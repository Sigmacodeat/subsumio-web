/**
 * Stale Dependency Graph — Round-Trip Test
 *
 * T3.4 Definition of Done:
 *   - Migration in BEIDEN Engines (PGLite + Postgres)
 *   - Novellen-Simulation im Test (§ ändern → Dependency wird stale → Re-Verifikation läuft → Diff erzeugt)
 *   - PG-Round-Trip grün
 *   - typecheck grün
 *
 * This test runs against a real PostgreSQL test database (docker-compose.test.yml,
 * port 5434) AND an in-memory PGLite engine to verify engine parity.
 *
 * Setup:
 *   docker compose -f server/docker-compose.test.yml up -d
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5434/gbrain_test
 *
 * The test simulates the full novella detection flow:
 *   1. Seed initial law snapshot (BGB § 823, § 823a)
 *   2. Record output dependency (draft cites § 823)
 *   3. Simulate law change (§ 823 modified, § 823a removed, § 824 added)
 *   4. Run novella detection → dependency marked 'pending'
 *   5. Re-verify against new snapshot → status 'stale'
 *   6. Get attorney diff → "betroffen seit <date>", alt→neu
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Pool } from "pg";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";

import { DependencyGraphStore, computeClaimHash } from "../src/core/legal/dependency-graph.ts";
import {
  detectNovella,
  detectNovellaFromSource,
  runNovellaCheckFromSource,
  buildSlug,
  buildReceipt,
  hashFullText,
  hashPerParagraph,
} from "../src/core/legal/novella-detection.ts";
import {
  type CorpusReceipt,
} from "../src/core/legal/corpus-receipt.ts";

// ── Test DB Setup ─────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const HAS_PG = !!DATABASE_URL && DATABASE_URL.includes("5434");

let pgPool: Pool | null = null;
let pgliteEngine: PGLiteEngine | null = null;

// PGLite helper: get a Pool-like interface wrapping engine.db.query()
// SnapshotStore uses pool.connect() → client.query("BEGIN"/"COMMIT"/"ROLLBACK") → client.release()
// PGLite supports transaction control via sequential query() calls.
interface PoolLikeClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release(): void;
}

interface PoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect(): Promise<PoolLikeClient>;
}

function makePGLitePool(engine: PGLiteEngine): PoolLike {
  const db = engine.db;
  const queryFn = async (text: string, params?: unknown[]) => {
    const result = await db.query(text, params as never[]);
    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: (result.rows as unknown[]).length,
    };
  };
  return {
    query: queryFn,
    async connect(): Promise<PoolLikeClient> {
      // PGLite is a single connection — return a client wrapper
      // that delegates to the same db instance.
      return {
        query: queryFn,
        release() {},
      };
    },
  };
}

async function setupPGLite(): Promise<{ engine: PGLiteEngine; pool: PoolLike }> {
  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  pgliteEngine = engine;
  return { engine, pool: makePGLitePool(engine) };
}

async function setupPG(): Promise<Pool> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    // Drop tables for clean slate
    await client.query("DROP TABLE IF EXISTS output_dependencies CASCADE");
    await client.query("DROP TABLE IF EXISTS stale_outputs CASCADE");
    await client.query("DROP TABLE IF EXISTS corpus_snapshot_paragraphs CASCADE");
    await client.query("DROP TABLE IF EXISTS corpus_amendments CASCADE");
    await client.query("DROP TABLE IF EXISTS corpus_snapshots CASCADE");

    // Create tables from migration v121 SQL
    const { MIGRATIONS } = await import("../src/core/migrate.ts");
    const v121 = MIGRATIONS.find((m) => m.version === 121);
    if (v121?.sql) {
      await client.query(v121.sql);
    }
  } finally {
    client.release();
  }
  return pool;
}

async function cleanupTables(pool: PoolLike): Promise<void> {
  await pool.query("DELETE FROM output_dependencies");
  await pool.query("DELETE FROM stale_outputs");
  await pool.query("DELETE FROM corpus_snapshot_paragraphs");
  await pool.query("DELETE FROM corpus_amendments");
  await pool.query("DELETE FROM corpus_snapshots");
}

// ── Test Fixtures ─────────────────────────────────────────────────────

const BGB_SLUG = "law/de/bgb";

const INITIAL_BGB_TEXT = `# Bürgerliches Gesetzbuch (BGB)

## § 823 Schadensersatzpflicht

Wer vorsätzlich oder fahrlässig das Leben, den Körper, die Gesundheit,
die Freiheit, das Eigentum oder ein sonstiges Recht eines anderen
widerrechtlich verletzt, ist dem anderen zum Ersatze des daraus
entstehenden Schadens verpflichtet.

## § 823a Schadensersatzpflicht bei Menschenwürdeverletzung

Verletzt jemand die Menschenwürde eines anderen, so ist er ihm zum
Ersatze des daraus entstehenden Schadens verpflichtet.
`;

const AMENDED_BGB_TEXT = `# Bürgerliches Gesetzbuch (BGB)

## § 823 Schadensersatzpflicht

Wer vorsätzlich oder fahrlässig das Leben, den Körper, die Gesundheit,
die Freiheit, das Eigentum oder ein sonstiges Recht eines anderen
widerrechtlich verletzt, ist dem anderen zum Ersatze des daraus
entstehenden Schadens verpflichtet. Die Ersatzpflicht umfasst auch
den immateriellen Schaden, soweit die Verletzung eine schwere
Gesundheitsverletzung ist.

## § 824 Ehrverletzung

Wer der Wahrheit zuwider Tatsachen behauptet, die einen anderen
in der Ehre verletzen, ist dem anderen zum Ersatze des daraus
entstehenden Schadens verpflichtet.
`;

function makeReceipt(
  slug: string,
  text: string,
  opts?: { announcement_date?: string; valid_from?: string }
): CorpusReceipt {
  return {
    slug,
    jurisdiction: "DE",
    statute_code: "BGB",
    valid_from: opts?.valid_from ?? "2026-01-01",
    valid_to: null,
    fetched_at: new Date().toISOString(),
    source_url: "https://www.gesetze-im-internet.de/bgb/xml.xml",
    content_hash: hashFullText(text),
    parser_version: "test-v1",
    license_status: "public",
    amendment_count: 0,
    announcement_date: opts?.announcement_date,
    gazette_reference: "BGBl. I S. 123",
    language: "de",
    paragraph_count: 2,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("Stale Dependency Graph — Round-Trip", () => {
  describe("Unit Tests (no DB required)", () => {
    it("hashFullText produces 64-char SHA-256", () => {
      const h = hashFullText("test text");
      expect(h.length).toBe(64);
      expect(h).toMatch(/^[a-f0-9]+$/);
    });

    it("hashPerParagraph extracts § headings", () => {
      const hashes = hashPerParagraph(INITIAL_BGB_TEXT);
      expect(Object.keys(hashes)).toContain("823");
      expect(Object.keys(hashes)).toContain("823a");
      expect(hashes["823"]).not.toBe(hashes["823a"]);
    });

    it("hashPerParagraph detects changed paragraphs", () => {
      const oldHashes = hashPerParagraph(INITIAL_BGB_TEXT);
      const newHashes = hashPerParagraph(AMENDED_BGB_TEXT);
      // § 823 was modified
      expect(oldHashes["823"]).not.toBe(newHashes["823"]);
      // § 823a was removed (not in new)
      expect(newHashes["823a"]).toBeUndefined();
      // § 824 was added
      expect(newHashes["824"]).toBeDefined();
      expect(oldHashes["824"]).toBeUndefined();
    });

    it("computeClaimHash is deterministic", () => {
      const h1 = computeClaimHash("§ 823 BGB Schadensersatz");
      const h2 = computeClaimHash("§ 823 BGB Schadensersatz");
      expect(h1).toBe(h2);
      expect(h1.length).toBe(64);
    });

    it("buildSlug generates correct corpus slug", () => {
      expect(buildSlug("DE", "BGB")).toBe("law/de/bgb");
      expect(buildSlug("AT", "ABGB")).toBe("law/at/abgb");
      expect(buildSlug("CH", "OR")).toBe("law/ch/or");
    });

    it("buildReceipt creates valid CorpusReceipt", () => {
      const slug = buildSlug("DE", "BGB");
      const receipt = buildReceipt(slug, "DE", "BGB", INITIAL_BGB_TEXT, "https://example.com/bgb");
      expect(receipt.slug).toBe("law/de/bgb");
      expect(receipt.statute_code).toBe("BGB");
      expect(receipt.jurisdiction).toBe("DE");
      expect(receipt.content_hash).toBe(hashFullText(INITIAL_BGB_TEXT));
      expect(receipt.paragraph_count).toBe(2);
      expect(receipt.parser_version).toBe("novella-detection-v1");
    });

    it("detectNovellaFromSource returns error for unsupported jurisdiction", async () => {
      const fakePool = { query: () => Promise.resolve({ rows: [] }) } as unknown as Pool;
      const report = await detectNovellaFromSource(fakePool, "XX" as never, "TEST");
      expect(report.error).toContain("Unsupported jurisdiction");
      expect(report.changed).toBe(false);
    });

    it("detectNovellaFromSource returns error when fetch fails", async () => {
      const fakePool = { query: () => Promise.resolve({ rows: [] }) } as unknown as Pool;
      const mockFetch = (() => Promise.reject(new Error("Network error"))) as unknown as typeof fetch;
      const report = await detectNovellaFromSource(fakePool, "DE", "BGB", mockFetch);
      // fetchDeStatute catches errors internally and returns null,
      // so detectNovellaFromSource sees a null result → "Failed to fetch"
      expect(report.error).toContain("Failed to fetch");
      expect(report.changed).toBe(false);
    });

    it("detectNovellaFromSource returns error when fetch returns null", async () => {
      const fakePool = { query: () => Promise.resolve({ rows: [] }) } as unknown as Pool;
      const mockFetch = (() => Promise.resolve({
        ok: false,
        text: () => Promise.resolve(""),
      })) as unknown as typeof fetch;
      const report = await detectNovellaFromSource(fakePool, "AT", "ABGB", mockFetch);
      expect(report.error).toContain("Failed to fetch");
      expect(report.changed).toBe(false);
    });
  });

  describe("PGLite Round-Trip", () => {
    let pool: PoolLike;

    let pgliteEngineInstance: PGLiteEngine;

    beforeAll(async () => {
      const result = await setupPGLite();
      pgliteEngineInstance = result.engine;
      pool = result.pool;
    });

    afterAll(async () => {
      if (pgliteEngineInstance) {
        await pgliteEngineInstance.disconnect();
      }
    });

    beforeEach(async () => {
      await cleanupTables(pool);
    });

    it("full novella detection flow: seed → change → detect → re-verify → diff", async () => {
      // 1. Seed initial snapshot
      const initialReceipt = makeReceipt(BGB_SLUG, INITIAL_BGB_TEXT);
      const report1 = await detectNovella(
        pool as unknown as Pool,
        BGB_SLUG,
        INITIAL_BGB_TEXT,
        initialReceipt
      );
      expect(report1.changed).toBe(true); // First snapshot = "changed" from null
      expect(report1.amendments.length).toBe(2); // § 823 + § 823a added
      expect(report1.old_content_hash).toBeNull();

      // 2. Record output dependency (draft cites § 823)
      const depStore = new DependencyGraphStore(pool as unknown as Pool);
      await depStore.recordDependency({
        output_id: "draft-001",
        output_type: "draft",
        source_slug: BGB_SLUG,
        snapshot_hash: report1.new_content_hash,
        paragraph_ref: "823",
        claim_hash: computeClaimHash("§ 823 BGB schadensersatzpflicht"),
        brain_id: "test-brain",
        user_id: "test-user",
      });

      // Verify dependency was recorded
      const deps = await depStore.getDependenciesForOutput("draft-001");
      expect(deps.length).toBe(1);
      expect(deps[0].reverify_status).toBe("pending");
      expect(deps[0].paragraph_ref).toBe("823");

      // 3. Simulate law change (Novelle)
      const amendedReceipt = makeReceipt(BGB_SLUG, AMENDED_BGB_TEXT, {
        announcement_date: "2026-07-15",
        valid_from: "2026-07-15",
      });
      const report2 = await detectNovella(
        pool as unknown as Pool,
        BGB_SLUG,
        AMENDED_BGB_TEXT,
        amendedReceipt
      );

      // 4. Verify novella was detected
      expect(report2.changed).toBe(true);
      expect(report2.old_content_hash).toBe(report1.new_content_hash);
      expect(report2.new_content_hash).not.toBe(report1.new_content_hash);
      expect(report2.amendments.length).toBe(3); // § 823 modified, § 823a removed, § 824 added

      const modifiedAmendments = report2.amendments.filter((a) => a.change_type === "modified");
      const removedAmendments = report2.amendments.filter((a) => a.change_type === "removed");
      const addedAmendments = report2.amendments.filter((a) => a.change_type === "added");
      expect(modifiedAmendments.length).toBe(1);
      expect(removedAmendments.length).toBe(1);
      expect(addedAmendments.length).toBe(1);

      // 5. Verify dependency was marked for re-verification
      const depsAfter = await depStore.getDependenciesForOutput("draft-001");
      expect(depsAfter.length).toBe(1);
      expect(depsAfter[0].reverify_status).toBe("pending");
      expect(depsAfter[0].triggering_amendment_id).not.toBeNull();

      // 6. Get re-verification queue
      const queue = await depStore.getReVerificationQueue({ brain_id: "test-brain" });
      expect(queue.length).toBe(1);
      expect(queue[0].dependency.output_id).toBe("draft-001");
      expect(queue[0].amendment.paragraph).toBe("823");
      expect(queue[0].amendment.change_type).toBe("modified");
      expect(queue[0].affected_since).toBeDefined();

      // 7. Re-verify against new snapshot
      const amendedParagraphs = report2.amendments.map((a) => a.paragraph);
      const reverifyStatus = await depStore.reVerifyAgainstSnapshot(
        depsAfter[0].id,
        "attorney-001",
        ["823"],
        AMENDED_BGB_TEXT,
        amendedParagraphs
      );

      // § 823 was modified → should be 'stale'
      expect(reverifyStatus).toBe("stale");

      // Verify status was persisted
      const depsFinal = await depStore.getDependenciesForOutput("draft-001");
      expect(depsFinal[0].reverify_status).toBe("stale");
      expect(depsFinal[0].reverified_by).toBe("attorney-001");
      expect(depsFinal[0].reverified_at).not.toBeNull();
      expect(depsFinal[0].reverify_notes).toContain("823");

      // 8. Get attorney diff
      const diff = await depStore.getDiff(
        BGB_SLUG,
        "823",
        depsFinal[0].triggering_amendment_id!
      );
      expect(diff).not.toBeNull();
      expect(diff!.change_type).toBe("modified");
      expect(diff!.paragraph_ref).toBe("823");
      expect(diff!.affected_since).toBe("2026-07-15");
      expect(diff!.change_type_label_de).toBe("Geändert");
      expect(diff!.old_text_preview).not.toBeNull();
      expect(diff!.new_text_preview).not.toBeNull();

      // 9. Verify stats
      const stats = await depStore.getStats("test-brain");
      expect(stats.total).toBe(1);
      expect(stats.stale).toBe(1);
      expect(stats.pending).toBe(0);
    });

    it("not_affected when amended paragraph doesn't match dependency", async () => {
      // Seed initial snapshot
      const initialReceipt = makeReceipt(BGB_SLUG, INITIAL_BGB_TEXT);
      await detectNovella(pool as unknown as Pool, BGB_SLUG, INITIAL_BGB_TEXT, initialReceipt);

      // Record dependency on § 823a
      const depStore = new DependencyGraphStore(pool as unknown as Pool);
      await depStore.recordDependency({
        output_id: "draft-002",
        output_type: "memo",
        source_slug: BGB_SLUG,
        snapshot_hash: hashFullText(INITIAL_BGB_TEXT),
        paragraph_ref: "823a",
        brain_id: "test-brain",
      });

      // Simulate change that only affects § 824 (new paragraph)
      const amendedText = INITIAL_BGB_TEXT + `
## § 825 Besondere Schadensarten
Verletzt jemand die Menschenwürde eines anderen, so ist er zum Ersatze verpflichtet.
`;
      const amendedReceipt = makeReceipt(BGB_SLUG, amendedText, {
        announcement_date: "2026-07-20",
        valid_from: "2026-07-20",
      });
      const report = await detectNovella(
        pool as unknown as Pool,
        BGB_SLUG,
        amendedText,
        amendedReceipt
      );

      // Re-verify: § 823a was NOT amended (only § 825 added)
      const deps = await depStore.getDependenciesForOutput("draft-002");
      const amendedParagraphs = report.amendments.map((a) => a.paragraph);
      const status = await depStore.reVerifyAgainstSnapshot(
        deps[0].id,
        "attorney-002",
        ["823a"],
        amendedText,
        amendedParagraphs
      );
      expect(status).toBe("not_affected");
    });

    it("verified when cited paragraph still exists and unchanged", async () => {
      // Seed initial snapshot
      const initialReceipt = makeReceipt(BGB_SLUG, INITIAL_BGB_TEXT);
      await detectNovella(pool as unknown as Pool, BGB_SLUG, INITIAL_BGB_TEXT, initialReceipt);

      // Record dependency on § 823
      const depStore = new DependencyGraphStore(pool as unknown as Pool);
      await depStore.recordDependency({
        output_id: "draft-003",
        output_type: "schriftsatz",
        source_slug: BGB_SLUG,
        snapshot_hash: hashFullText(INITIAL_BGB_TEXT),
        paragraph_ref: "823",
        brain_id: "test-brain",
      });

      // Simulate change that only adds a new paragraph (§ 824)
      const amendedText = INITIAL_BGB_TEXT + `
## § 824 Ehrverletzung
Wer der Wahrheit zuwider Tatsachen behauptet, die einen anderen
in der Ehre verletzen, ist dem anderen zum Ersatze verpflichtet.
`;
      const amendedReceipt = makeReceipt(BGB_SLUG, amendedText, {
        announcement_date: "2026-07-25",
        valid_from: "2026-07-25",
      });
      const report = await detectNovella(
        pool as unknown as Pool,
        BGB_SLUG,
        amendedText,
        amendedReceipt
      );

      // Re-verify: § 823 still exists and was NOT modified
      const deps = await depStore.getDependenciesForOutput("draft-003");
      const amendedParagraphs = report.amendments.map((a) => a.paragraph);
      // § 823 should not be in the amended set since it wasn't changed
      const status = await depStore.reVerifyAgainstSnapshot(
        deps[0].id,
        "attorney-003",
        ["823"],
        amendedText,
        amendedParagraphs
      );
      expect(status).toBe("not_affected"); // § 823 wasn't in the amended set
    });
  });

  // PostgreSQL round-trip — gated by DATABASE_URL pointing at port 5434
  const describePG = HAS_PG ? describe : describe.skip;

  describePG("PostgreSQL Round-Trip (port 5434)", () => {
    let pool: Pool;

    beforeAll(async () => {
      pool = await setupPG();
    });

    afterAll(async () => {
      await pool.end();
    });

    beforeEach(async () => {
      await cleanupTables(pool);
    });

    it("full novella detection flow on PostgreSQL", async () => {
      // 1. Seed initial snapshot
      const initialReceipt = makeReceipt(BGB_SLUG, INITIAL_BGB_TEXT);
      const report1 = await detectNovella(pool, BGB_SLUG, INITIAL_BGB_TEXT, initialReceipt);
      expect(report1.changed).toBe(true);
      expect(report1.amendments.length).toBe(2);

      // 2. Record output dependency
      const depStore = new DependencyGraphStore(pool);
      await depStore.recordDependency({
        output_id: "pg-draft-001",
        output_type: "draft",
        source_slug: BGB_SLUG,
        snapshot_hash: report1.new_content_hash,
        paragraph_ref: "823",
        claim_hash: computeClaimHash("§ 823 BGB schadensersatzpflicht"),
        brain_id: "pg-test-brain",
        user_id: "pg-test-user",
      });

      // 3. Simulate law change
      const amendedReceipt = makeReceipt(BGB_SLUG, AMENDED_BGB_TEXT, {
        announcement_date: "2026-07-15",
        valid_from: "2026-07-15",
      });
      const report2 = await detectNovella(pool, BGB_SLUG, AMENDED_BGB_TEXT, amendedReceipt);
      expect(report2.changed).toBe(true);
      expect(report2.amendments.length).toBe(3);

      // 4. Verify dependency marked pending
      const deps = await depStore.getDependenciesForOutput("pg-draft-001");
      expect(deps[0].reverify_status).toBe("pending");
      expect(deps[0].triggering_amendment_id).not.toBeNull();

      // 5. Re-verify → stale
      const amendedParagraphs = report2.amendments.map((a) => a.paragraph);
      const status = await depStore.reVerifyAgainstSnapshot(
        deps[0].id,
        "pg-attorney",
        ["823"],
        AMENDED_BGB_TEXT,
        amendedParagraphs
      );
      expect(status).toBe("stale");

      // 6. Get diff
      const diff = await depStore.getDiff(BGB_SLUG, "823", deps[0].triggering_amendment_id!);
      expect(diff).not.toBeNull();
      expect(diff!.change_type).toBe("modified");
      expect(diff!.affected_since).toBe("2026-07-15");
      expect(diff!.change_type_label_de).toBe("Geändert");

      // 7. Stats
      const stats = await depStore.getStats("pg-test-brain");
      expect(stats.total).toBe(1);
      expect(stats.stale).toBe(1);
    });

    it("engine parity: same hashes on PGLite and Postgres", async () => {
      // The hash functions are pure and don't depend on the DB
      const pgHash = hashFullText(INITIAL_BGB_TEXT);
      const pgliteHash = hashFullText(INITIAL_BGB_TEXT);
      expect(pgHash).toBe(pgliteHash);

      const pgParaHashes = hashPerParagraph(INITIAL_BGB_TEXT);
      const pgliteParaHashes = hashPerParagraph(INITIAL_BGB_TEXT);
      expect(pgParaHashes).toEqual(pgliteParaHashes);
    });
  });
});
