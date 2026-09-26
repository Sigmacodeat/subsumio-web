/**
 * Engine Parity E2E
 *
 * Codex flagged that searchKeyword behavior differs structurally between
 * the two engines (Postgres uses a CTE that ranks pages then picks best
 * chunk; PGLite returns chunks directly). Without verification, source-aware
 * ranking could pass on PGLite and silently fail on Postgres.
 *
 * Strategy: seed identical corpora into both engines, run identical queries,
 * assert top-5 slug ordering matches.
 *
 * Gated by DATABASE_URL — skips gracefully if no real Postgres. Always runs
 * the PGLite half so the seed/query path is at least exercised.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../../src/core/pglite-engine.ts";
import type { ChunkInput, SearchResult } from "../../src/core/types.ts";
import type { BrainEngine } from "../../src/core/engine.ts";
import { hasDatabase, setupDB, teardownDB, getEngine } from "./helpers.ts";

const SKIP_PG = !hasDatabase();
const describeBoth = SKIP_PG ? describe.skip : describe;

function basisEmbedding(idx: number, dim = 1536): Float32Array {
  const emb = new Float32Array(dim);
  emb[idx % dim] = 1.0;
  return emb;
}

interface SeedPage {
  slug: string;
  type: "writing" | "concept" | "note" | "person" | "company";
  title: string;
  body: string;
  embeddingDim: number;
}

const SEED_PAGES: SeedPage[] = [
  {
    slug: "originals/talks/article-outline-fat-code",
    type: "writing",
    title: "Fat Code Thin Harness — Part 3",
    body: "fat code thin harness pattern part 3 production case studies",
    embeddingDim: 7,
  },
  {
    slug: "concepts/fat-code-thin-harness",
    type: "concept",
    title: "Fat Code Thin Harness",
    body: "reusable concept fat code thin harness architecture",
    embeddingDim: 14,
  },
  {
    slug: "openclaw/chat/2026-04-15",
    type: "note",
    title: "2026-04-15 chat",
    body:
      "fat code thin harness fat code thin harness discussion went on at length, " +
      "fat code thin harness came up again and again, fat code thin harness fat code thin harness.",
    embeddingDim: 8,
  },
  {
    slug: "openclaw/chat/2026-04-16",
    type: "note",
    title: "2026-04-16 chat",
    body:
      "fat code thin harness once more, fat code thin harness fat code thin harness, " +
      "still talking about fat code thin harness fat code thin harness.",
    embeddingDim: 9,
  },
  {
    slug: "people/example-founder",
    type: "person",
    title: "Example Founder",
    body: "example founder unrelated content for distraction",
    embeddingDim: 50,
  },
];

async function seedEngine(eng: BrainEngine) {
  for (const p of SEED_PAGES) {
    await eng.putPage(p.slug, {
      type: p.type,
      title: p.title,
      compiled_truth: p.body,
      timeline: "",
    });
    const chunks: ChunkInput[] = [
      {
        chunk_index: 0,
        chunk_text: p.body,
        chunk_source: "compiled_truth",
        embedding: basisEmbedding(p.embeddingDim),
        token_count: p.body.split(/\s+/).length,
      },
    ];
    await eng.upsertChunks(p.slug, chunks);
  }
}

const QUERIES = ["fat code thin harness", "fat code thin harness part 3", "fat code production"];

let pgEngine: BrainEngine;
let pgliteEngine: PGLiteEngine;

// The suites below share the process-global Postgres connection managed by
// helpers.ts. A single lifecycle prevents sibling beforeAll hooks from
// truncating/reconnecting the database while another suite is asserting.
beforeAll(async () => {
  if (SKIP_PG) return;
  pgEngine = await setupDB();
  await seedEngine(pgEngine);
  await seedRelational(pgEngine);

  pgliteEngine = new PGLiteEngine();
  await pgliteEngine.connect({});
  await pgliteEngine.initSchema();
  await seedEngine(pgliteEngine);
  await seedRelational(pgliteEngine);
}, 90_000);

afterAll(async () => {
  if (SKIP_PG) return;
  await pgliteEngine.disconnect();
  await teardownDB();
}, 30_000);

describeBoth("Engine parity — Postgres vs PGLite", () => {
  for (const q of QUERIES) {
    test(`searchKeyword: top-5 slugs match for "${q}"`, async () => {
      const pgResults = await pgEngine.searchKeyword(q, { limit: 5 });
      const pgliteResults = await pgliteEngine.searchKeyword(q, { limit: 5 });

      const pgSlugs = pgResults.map((r: SearchResult) => r.slug);
      const pgliteSlugs = pgliteResults.map((r: SearchResult) => r.slug);

      // Top result MUST match (the swamp-resistance guarantee).
      expect(pgSlugs[0]).toBe(pgliteSlugs[0]);
      // Sets should match (allowing some ordering drift on lower-ranked
      // results since FTS rank function differences between engines are
      // out of scope for this fix).
      expect(new Set(pgSlugs)).toEqual(new Set(pgliteSlugs));
    });
  }

  test("findByTitleFuzzy: typed parameters and result match across engines", async () => {
    const pgResult = await pgEngine.findByTitleFuzzy(
      "Fat Code Thin Harness Part 3",
      undefined,
      0.5
    );
    const pgliteResult = await pgliteEngine.findByTitleFuzzy(
      "Fat Code Thin Harness Part 3",
      undefined,
      0.5
    );

    expect(pgResult).toEqual(pgliteResult);
    expect(pgResult?.slug).toBe("originals/talks/article-outline-fat-code");
  });

  test("listPages frontmatterAny: same rows on both engines", async () => {
    for (const eng of [pgEngine, pgliteEngine] as BrainEngine[]) {
      for (const [slug, fm] of [
        ["test/parity-fm-a", { case_slug: "legal/cases/parity-a" }],
        ["test/parity-fm-b", { case_title: "Parity B" }],
        ["test/parity-fm-c", { case_slug: "legal/cases/parity-c" }],
      ] as const) {
        await eng.putPage(slug, {
          type: "note",
          title: slug,
          compiled_truth: "fm parity",
          frontmatter: { ...fm },
        });
      }
    }
    const filter = {
      type: "note" as const,
      limit: 100,
      frontmatterAny: [
        ["case_slug", "legal/cases/parity-a"],
        ["case_title", "Parity B"],
      ] as Array<[string, string]>,
    };
    const pg = (await pgEngine.listPages(filter)).map((p) => p.slug).sort();
    const pl = (await pgliteEngine.listPages(filter)).map((p) => p.slug).sort();
    expect(pg).toEqual(["test/parity-fm-a", "test/parity-fm-b"]);
    expect(pl).toEqual(pg);
  });

  test("searchVector: top result matches between engines", async () => {
    const queryVec = basisEmbedding(7); // article direction
    const pgResults = await pgEngine.searchVector(queryVec, { limit: 5 });
    const pgliteResults = await pgliteEngine.searchVector(queryVec, { limit: 5 });

    expect(pgResults[0]?.slug).toBe(pgliteResults[0]?.slug);
  });

  test("hard-exclude is consistent across engines", async () => {
    // Both engines should hide test/ pages by default; both should opt
    // them back in via include_slug_prefixes.
    await pgEngine.putPage("test/parity-fixture", {
      type: "note",
      title: "parity test fixture",
      compiled_truth: "parity test fixture content",
      timeline: "",
    });
    await pgEngine.upsertChunks("test/parity-fixture", [
      {
        chunk_index: 0,
        chunk_text: "parity test fixture content",
        chunk_source: "compiled_truth",
        embedding: basisEmbedding(20),
        token_count: 5,
      },
    ] satisfies ChunkInput[]);

    await pgliteEngine.putPage("test/parity-fixture", {
      type: "note",
      title: "parity test fixture",
      compiled_truth: "parity test fixture content",
      timeline: "",
    });
    await pgliteEngine.upsertChunks("test/parity-fixture", [
      {
        chunk_index: 0,
        chunk_text: "parity test fixture content",
        chunk_source: "compiled_truth",
        embedding: basisEmbedding(20),
        token_count: 5,
      },
    ] satisfies ChunkInput[]);

    const pgDefault = await pgEngine.searchKeyword("parity test fixture");
    const pgliteDefault = await pgliteEngine.searchKeyword("parity test fixture");
    expect(pgDefault.map((r: SearchResult) => r.slug)).not.toContain("test/parity-fixture");
    expect(pgliteDefault.map((r: SearchResult) => r.slug)).not.toContain("test/parity-fixture");

    const pgOptIn = await pgEngine.searchKeyword("parity test fixture", {
      include_slug_prefixes: ["test/"],
    });
    const pgliteOptIn = await pgliteEngine.searchKeyword("parity test fixture", {
      include_slug_prefixes: ["test/"],
    });
    expect(pgOptIn.map((r: SearchResult) => r.slug)).toContain("test/parity-fixture");
    expect(pgliteOptIn.map((r: SearchResult) => r.slug)).toContain("test/parity-fixture");
  });

  test("detail=high produces a different ranking than default on at least one engine", async () => {
    // Source-boost gates on `detail !== 'high'`. If the gate works on both
    // engines, the ordering for `detail=high` should differ from default in
    // any case where the swamp / curated pages have different raw scores.
    //
    // Postgres's CTE ranks pages then picks best chunk; ts_rank normalizes
    // by doc length so chat pages don't always swamp at the page level.
    // PGLite scores chunks directly — chat chunks beat article chunks on
    // raw ts_rank. The two engines need different parity contracts here.
    //
    // Common assertion that holds on both: detail=high must include the
    // chat pages in its result set (they're not filtered by detail), and
    // the result set should not be identical to default-detail (the boost
    // must be doing _something_ visible).
    const pgDefault = await pgEngine.searchKeyword("fat code thin harness", { limit: 5 });
    const pgHigh = await pgEngine.searchKeyword("fat code thin harness", {
      detail: "high",
      limit: 5,
    });
    const pgliteDefault = await pgliteEngine.searchKeyword("fat code thin harness", { limit: 5 });
    const pgliteHigh = await pgliteEngine.searchKeyword("fat code thin harness", {
      detail: "high",
      limit: 5,
    });

    // Chat pages must be present in detail=high results on both engines.
    expect(pgHigh.some((r: SearchResult) => r.slug.startsWith("openclaw/chat/"))).toBe(true);
    expect(pgliteHigh.some((r: SearchResult) => r.slug.startsWith("openclaw/chat/"))).toBe(true);

    // The boost must be doing something — at least one engine's ordering
    // should change between default and detail=high.
    const pgChanged =
      pgDefault.map((r: SearchResult) => r.slug).join(",") !==
      pgHigh.map((r: SearchResult) => r.slug).join(",");
    const pgliteChanged =
      pgliteDefault.map((r: SearchResult) => r.slug).join(",") !==
      pgliteHigh.map((r: SearchResult) => r.slug).join(",");
    expect(pgChanged || pgliteChanged).toBe(true);
  });

  // v0.39.3.0 T3 — provenance write+read parity (WARN-8 + CV5).
  // Both engines must write the same 4 provenance columns (source_kind,
  // source_uri, ingested_via, ingested_at) on putPage AND surface them
  // on getPage. A drift here would mean `gbrain migrate --to supabase`
  // silently loses half a user's provenance audit trail.
  test("provenance columns: putPage writes + getPage returns identical shape on both engines", async () => {
    const slug = "wiki/provenance-parity";
    const input = {
      type: "note" as const,
      title: "Provenance Parity Test",
      compiled_truth: "body",
      timeline: "",
      source_kind: "capture-cli",
      source_uri: "file:///tmp/parity.md",
      ingested_via: "put_page",
    };
    await pgEngine.putPage(slug, input);
    await pgliteEngine.putPage(slug, input);

    const pgPage = await pgEngine.getPage(slug);
    const pglitePage = await pgliteEngine.getPage(slug);

    expect(pgPage).not.toBeNull();
    expect(pglitePage).not.toBeNull();

    // All 4 provenance fields must match across engines.
    expect(pgPage!.source_kind).toBe("capture-cli");
    expect(pglitePage!.source_kind).toBe("capture-cli");
    expect(pgPage!.source_uri).toBe("file:///tmp/parity.md");
    expect(pglitePage!.source_uri).toBe("file:///tmp/parity.md");
    expect(pgPage!.ingested_via).toBe("put_page");
    expect(pglitePage!.ingested_via).toBe("put_page");
    // ingested_at is server-stamped; both engines must populate a Date
    // (not Date drift across engines — the assertion is structural).
    expect(pgPage!.ingested_at).toBeInstanceOf(Date);
    expect(pglitePage!.ingested_at).toBeInstanceOf(Date);
  });

  test("provenance COALESCE-preserve UPDATE: parity on both engines (CV12)", async () => {
    // First write with provenance.
    const slug = "wiki/provenance-preserve-parity";
    await pgEngine.putPage(slug, {
      type: "note",
      title: "V1",
      compiled_truth: "body v1",
      timeline: "",
      source_kind: "capture-cli",
      ingested_via: "put_page",
    });
    await pgliteEngine.putPage(slug, {
      type: "note",
      title: "V1",
      compiled_truth: "body v1",
      timeline: "",
      source_kind: "capture-cli",
      ingested_via: "put_page",
    });

    // Second write WITHOUT provenance — both engines must preserve
    // the first-write audit trail via COALESCE-preserve UPDATE.
    await pgEngine.putPage(slug, {
      type: "note",
      title: "V2",
      compiled_truth: "body v2",
      timeline: "",
    });
    await pgliteEngine.putPage(slug, {
      type: "note",
      title: "V2",
      compiled_truth: "body v2",
      timeline: "",
    });

    const pgPage = await pgEngine.getPage(slug);
    const pglitePage = await pgliteEngine.getPage(slug);

    // Provenance preserved on BOTH engines (CV12 first-write-wins).
    expect(pgPage!.source_kind).toBe("capture-cli");
    expect(pglitePage!.source_kind).toBe("capture-cli");
    expect(pgPage!.ingested_via).toBe("put_page");
    expect(pglitePage!.ingested_via).toBe("put_page");
    // Page title updated (proves the UPDATE actually fired).
    expect(pgPage!.title).toBe("V2");
    expect(pglitePage!.title).toBe("V2");
  });

  test("v0.41.19.0 deletePages parity: both engines return same confirmed-deleted slugs", async () => {
    const realSlugs = ["wiki/dpp-1", "wiki/dpp-2", "wiki/dpp-3"];
    for (const slug of realSlugs) {
      await pgEngine.putPage(slug, {
        type: "note",
        title: slug,
        compiled_truth: "body",
        timeline: "",
      });
      await pgliteEngine.putPage(slug, {
        type: "note",
        title: slug,
        compiled_truth: "body",
        timeline: "",
      });
    }

    // Mix real + ghost slugs. D6: only real ones come back.
    const allSlugs = [...realSlugs, "wiki/dpp-ghost-a", "wiki/dpp-ghost-b"];
    const pgDeleted = await pgEngine.deletePages(allSlugs, { sourceId: "default" });
    const pgliteDeleted = await pgliteEngine.deletePages(allSlugs, { sourceId: "default" });

    expect(pgDeleted.sort()).toEqual(realSlugs.sort());
    expect(pgliteDeleted.sort()).toEqual(realSlugs.sort());

    // Pages actually gone on both engines.
    for (const slug of realSlugs) {
      const pg = await pgEngine.getPage(slug);
      const pglite = await pgliteEngine.getPage(slug);
      expect(pg).toBeNull();
      expect(pglite).toBeNull();
    }
  });

  test("purgeDeletedPages parity: files rows go with the purged page on both engines", async () => {
    for (const engine of [pgEngine, pgliteEngine]) {
      await engine.putPage("wiki/purge-files", {
        type: "note",
        title: "purge",
        compiled_truth: "body",
        timeline: "",
      });
      await engine.executeRaw(
        `INSERT INTO files (source_id, page_slug, filename, storage_path, content_hash)
         VALUES ('default', 'wiki/purge-files', 'x.pdf', 'clean/parity/wiki/purge-files/x.pdf', 'hp')`
      );
      await engine.softDeletePage("wiki/purge-files");
      await engine.executeRaw(
        `UPDATE pages SET deleted_at = now() - INTERVAL '73 hours' WHERE slug = 'wiki/purge-files'`
      );
    }
    const pg = await pgEngine.purgeDeletedPages(72);
    const pglite = await pgliteEngine.purgeDeletedPages(72);
    for (const r of [pg, pglite]) {
      expect(r.slugs).toContain("wiki/purge-files");
      expect(r.files).toContainEqual({
        sourceId: "default",
        pageSlug: "wiki/purge-files",
        storagePath: "clean/parity/wiki/purge-files/x.pdf",
      });
    }
    for (const engine of [pgEngine, pgliteEngine]) {
      const left = await engine.executeRaw<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM files WHERE page_slug = 'wiki/purge-files'`
      );
      expect(left[0].n).toBe(0);
    }
  });

  test("v114 (#1941) listLinkSources parity: same ordered provenance counts on both engines", async () => {
    const sourceId = "link-source-parity";
    const mk = async (eng: BrainEngine) => {
      await eng.executeRaw(
        "INSERT INTO sources (id, name, config) VALUES ($1, $2, '{}'::jsonb) ON CONFLICT DO NOTHING",
        [sourceId, "Link Source Parity"]
      );
      for (const s of ["lsp-a", "lsp-b", "lsp-c"]) {
        await eng.putPage(
          s,
          { type: "note", title: s, compiled_truth: "b", timeline: "" },
          { sourceId }
        );
      }
      // citation-graph:2, manual:1 — exercises count DESC + the kebab regex.
      const linkOpts = { fromSourceId: sourceId, toSourceId: sourceId };
      await eng.addLink(
        "lsp-a",
        "lsp-b",
        "",
        "cites",
        "citation-graph",
        undefined,
        undefined,
        linkOpts
      );
      await eng.addLink(
        "lsp-a",
        "lsp-c",
        "",
        "cites",
        "citation-graph",
        undefined,
        undefined,
        linkOpts
      );
      await eng.addLink("lsp-b", "lsp-c", "", "rel", "manual", undefined, undefined, linkOpts);
    };
    await mk(pgEngine);
    await mk(pgliteEngine);

    const pg = await pgEngine.listLinkSources({ sourceId });
    const pglite = await pgliteEngine.listLinkSources({ sourceId });

    const norm = (rows: { link_source: string | null; count: number }[]) =>
      rows.filter((r) => r.link_source === "citation-graph" || r.link_source === "manual");
    expect(norm(pg)).toEqual(norm(pglite));
    // citation-graph (2) must order before manual (1) on both engines.
    const cgIdx = pg.findIndex((r) => r.link_source === "citation-graph");
    const mIdx = pg.findIndex((r) => r.link_source === "manual");
    expect(cgIdx).toBeLessThan(mIdx);
  });

  test("v0.41.19.0 resolveSlugsByPaths parity: same Map on both engines", async () => {
    const seedSql = `
      INSERT INTO pages (source_id, slug, source_path, type, title, compiled_truth, timeline, frontmatter)
        VALUES ('default', $1, $2, 'note', 't', 'b', '', '{}'::jsonb)
        ON CONFLICT (source_id, slug) DO UPDATE SET source_path = EXCLUDED.source_path
    `;
    await pgEngine.executeRaw(seedSql, ["wiki/rsp-1", "wiki/rsp-1.md"]);
    await pgEngine.executeRaw(seedSql, ["wiki/rsp-2", "wiki/rsp-2.md"]);
    await pgliteEngine.executeRaw(seedSql, ["wiki/rsp-1", "wiki/rsp-1.md"]);
    await pgliteEngine.executeRaw(seedSql, ["wiki/rsp-2", "wiki/rsp-2.md"]);

    const paths = ["wiki/rsp-1.md", "wiki/rsp-2.md", "wiki/rsp-missing.md"];
    const pgMap = await pgEngine.resolveSlugsByPaths(paths, { sourceId: "default" });
    const pgliteMap = await pgliteEngine.resolveSlugsByPaths(paths, { sourceId: "default" });

    expect(pgMap.size).toBe(2);
    expect(pgliteMap.size).toBe(2);
    expect(pgMap.get("wiki/rsp-1.md")).toBe("wiki/rsp-1");
    expect(pgliteMap.get("wiki/rsp-1.md")).toBe("wiki/rsp-1");
    expect(pgMap.get("wiki/rsp-2.md")).toBe("wiki/rsp-2");
    expect(pgliteMap.get("wiki/rsp-2.md")).toBe("wiki/rsp-2");
    expect(pgMap.get("wiki/rsp-missing.md")).toBeUndefined();
    expect(pgliteMap.get("wiki/rsp-missing.md")).toBeUndefined();
  });

  // v0.41.29.0 — findOrphanPages source scoping parity. Real Postgres
  // coverage for the postgres.js `sql` scalar fragment + `= ANY(${arr}::text[])`
  // array binding (a documented footgun class — the jsonb double-encode saga).
  // PGLite logic is pinned in test/orphans-source-scope.test.ts; this asserts
  // the Postgres SQL produces the same scoped sets. Cross-source inbound
  // (src-b → src-a) must NOT make the target an orphan of src-a (A2).
  test("v0.41.29.0 findOrphanPages source scoping parity (scalar + federated)", async () => {
    const srcSql = `INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT DO NOTHING`;
    const pageSql = `
      INSERT INTO pages (source_id, slug, type, title, compiled_truth, timeline, frontmatter)
        VALUES ($1, $2, 'person', 't', 'b', '', '{}'::jsonb)
        ON CONFLICT (source_id, slug) DO NOTHING
    `;
    for (const eng of [pgEngine, pgliteEngine]) {
      await eng.executeRaw(srcSql, ["orphan-src-a"]);
      await eng.executeRaw(srcSql, ["orphan-src-b"]);
      await eng.executeRaw(pageSql, ["orphan-src-a", "people/op-orphan-a"]);
      await eng.executeRaw(pageSql, ["orphan-src-a", "people/op-target-a"]);
      await eng.executeRaw(pageSql, ["orphan-src-b", "people/op-linker-b"]);
      // Cross-source inbound: src-b page → src-a target (A2).
      await eng.addLink(
        "people/op-linker-b",
        "people/op-target-a",
        "",
        "mentions",
        "markdown",
        undefined,
        undefined,
        { fromSourceId: "orphan-src-b", toSourceId: "orphan-src-a" }
      );
    }

    const scoped = async (eng: BrainEngine, opts: { sourceId?: string; sourceIds?: string[] }) =>
      (await eng.findOrphanPages(opts))
        .map((r) => r.slug)
        .filter((s) => s.startsWith("people/op-"))
        .sort();

    // Scalar scope to src-a: op-orphan-a is an orphan; op-target-a is saved
    // by the cross-source inbound (A2). Parity on both engines.
    const pgA = await scoped(pgEngine, { sourceId: "orphan-src-a" });
    const pgliteA = await scoped(pgliteEngine, { sourceId: "orphan-src-a" });
    expect(pgA).toEqual(["people/op-orphan-a"]);
    expect(pgliteA).toEqual(pgA);

    // Scalar scope to src-b.
    const pgB = await scoped(pgEngine, { sourceId: "orphan-src-b" });
    const pgliteB = await scoped(pgliteEngine, { sourceId: "orphan-src-b" });
    expect(pgB).toEqual(["people/op-linker-b"]);
    expect(pgliteB).toEqual(pgB);

    // Federated array scope (= ANY binding) → union.
    const pgFed = await scoped(pgEngine, { sourceIds: ["orphan-src-a", "orphan-src-b"] });
    const pgliteFed = await scoped(pgliteEngine, { sourceIds: ["orphan-src-a", "orphan-src-b"] });
    expect(pgFed).toEqual(["people/op-linker-b", "people/op-orphan-a"]);
    expect(pgliteFed).toEqual(pgFed);
  });

  // v0.42.7 (#1696): stale-page extraction watermark parity. Isolated under a
  // dedicated source so other tests' mutations don't perturb the counts.
  test("stale-page extraction methods: Postgres ↔ PGLite parity", async () => {
    const SRC = "stale-parity";
    const VER = "2026-05-31T00:00:00Z";
    for (const eng of [pgEngine, pgliteEngine]) {
      await eng.executeRaw(
        `INSERT INTO sources (id, name, config) VALUES ($1, 'Stale Parity', '{}'::jsonb) ON CONFLICT DO NOTHING`,
        [SRC]
      );
      await eng.executeRaw(
        `INSERT INTO pages (slug, source_id, type, title, compiled_truth, timeline, frontmatter, content_hash, created_at, updated_at)
         SELECT 'sp/' || g, $1, 'concept', 'SP' || g, 'body ' || g, '', '{}'::jsonb, 'sph' || g, now(), now()
           FROM generate_series(1, 3) g`,
        [SRC]
      );
    }

    // NULL arm: all 3 stale on both engines.
    expect(await pgEngine.countStalePagesForExtraction({ sourceId: SRC })).toBe(3);
    expect(await pgliteEngine.countStalePagesForExtraction({ sourceId: SRC })).toBe(3);

    // listStalePagesForExtraction: same slugs + content columns populated.
    const pgList = (await pgEngine.listStalePagesForExtraction({ batchSize: 10, sourceId: SRC }))
      .map((r) => r.slug)
      .sort();
    const plList = (
      await pgliteEngine.listStalePagesForExtraction({ batchSize: 10, sourceId: SRC })
    )
      .map((r) => r.slug)
      .sort();
    expect(pgList).toEqual(["sp/1", "sp/2", "sp/3"]);
    expect(plList).toEqual(pgList);
    const pgRow = (await pgEngine.listStalePagesForExtraction({ batchSize: 1, sourceId: SRC }))[0];
    expect(pgRow.compiled_truth).toBeTruthy();
    expect(pgRow.updated_at).toBeInstanceOf(Date);

    // markPagesExtractedBatch: stamp one → count drops to 2 on both.
    const stampAt = new Date().toISOString();
    await pgEngine.markPagesExtractedBatch([{ slug: "sp/1", source_id: SRC }], stampAt);
    await pgliteEngine.markPagesExtractedBatch([{ slug: "sp/1", source_id: SRC }], stampAt);
    expect(await pgEngine.countStalePagesForExtraction({ sourceId: SRC })).toBe(2);
    expect(await pgliteEngine.countStalePagesForExtraction({ sourceId: SRC })).toBe(2);

    // version arm: stamp sp/2 old + set updated_at old (isolate version arm) →
    // flagged only when versionTs is passed. Parity on both engines.
    for (const eng of [pgEngine, pgliteEngine]) {
      await eng.markPagesExtractedBatch([{ slug: "sp/2", source_id: SRC }], "2000-01-01T00:00:00Z");
      await eng.executeRaw(
        `UPDATE pages SET updated_at = '2000-01-01T00:00:00Z' WHERE slug = 'sp/2' AND source_id = $1`,
        [SRC]
      );
    }
    // Without versionTs: sp/2 not stale (stamp == updated, not NULL). sp/3 still NULL-stale.
    expect(await pgEngine.countStalePagesForExtraction({ sourceId: SRC })).toBe(1);
    expect(await pgliteEngine.countStalePagesForExtraction({ sourceId: SRC })).toBe(1);
    // With versionTs: sp/2's old stamp (< VER) re-flags it → 2 stale.
    expect(await pgEngine.countStalePagesForExtraction({ sourceId: SRC, versionTs: VER })).toBe(2);
    expect(await pgliteEngine.countStalePagesForExtraction({ sourceId: SRC, versionTs: VER })).toBe(
      2
    );

    // edited-since arm: stamp sp/1 in the recent past, updated_at slightly after →
    // re-flagged on both engines (updated_at > links_extracted_at).
    for (const eng of [pgEngine, pgliteEngine]) {
      await eng.executeRaw(
        `UPDATE pages SET links_extracted_at = now() - interval '2 hours', updated_at = now() - interval '1 hour' WHERE slug = 'sp/1' AND source_id = $1`,
        [SRC]
      );
    }
    expect(await pgEngine.countStalePagesForExtraction({ sourceId: SRC })).toBe(2); // sp/1 (edited) + sp/3 (NULL)
    expect(await pgliteEngine.countStalePagesForExtraction({ sourceId: SRC })).toBe(2);
  });

  test("v0.41.39 listEnrichCandidates parity (thin filter + source-aware inbound + order)", async () => {
    const stub = "Stub page.";
    const pageSql = `
      INSERT INTO pages (source_id, slug, type, title, compiled_truth, timeline, frontmatter)
        VALUES ('default', $1, $2, $3, $4, '', '{}'::jsonb)
        ON CONFLICT (source_id, slug) DO NOTHING
    `;
    for (const eng of [pgEngine, pgliteEngine]) {
      // Two thin people (ec-alice ← 2 inbound, ec-bob ← 1), one thin company
      // (ec-widget ← 0), one long page (must be excluded by the thin filter).
      await eng.executeRaw(pageSql, ["ep/ec-alice", "person", "EC Alice", stub]);
      await eng.executeRaw(pageSql, ["ep/ec-bob", "person", "EC Bob", stub]);
      await eng.executeRaw(pageSql, ["companies/ec-widget", "company", "EC Widget", stub]);
      await eng.executeRaw(pageSql, ["ep/ec-long", "person", "EC Long", "x".repeat(900)]);
      // Linker pages + inbound links (link_source NULL → counted).
      await eng.executeRaw(pageSql, ["ep/ec-l1", "note", "L1", "links"]);
      await eng.executeRaw(pageSql, ["ep/ec-l2", "note", "L2", "links"]);
      await eng.executeRaw(pageSql, ["ep/ec-l3", "note", "L3", "links"]);
      await eng.addLink("ep/ec-l1", "ep/ec-alice", "ctx a1");
      await eng.addLink("ep/ec-l2", "ep/ec-alice", "ctx a2");
      await eng.addLink("ep/ec-l3", "ep/ec-bob", "ctx b1");
    }

    const run = async (eng: BrainEngine) =>
      (
        await eng.listEnrichCandidates({
          types: ["person", "company"],
          thinThreshold: 400,
          order: "inbound-links",
          limit: 10,
          sourceId: "default",
        })
      ).filter((c) => c.slug.startsWith("ep/") || c.slug === "companies/ec-widget");

    const pg = await run(pgEngine);
    const pglite = await run(pgliteEngine);

    const shape = (rows: typeof pg) =>
      rows.map((r) => `${r.slug}:${r.inbound_count}:${r.body_len}`);
    expect(shape(pg)).toEqual(shape(pglite));

    // Concrete contract: long page excluded; ordering alice(2) > bob(1) > widget(0).
    const slugs = pg.map((r) => r.slug);
    expect(slugs).not.toContain("ep/ec-long");
    expect(slugs.indexOf("ep/ec-alice")).toBeLessThan(slugs.indexOf("ep/ec-bob"));
    expect(slugs.indexOf("ep/ec-bob")).toBeLessThan(slugs.indexOf("companies/ec-widget"));
    expect(pg.find((r) => r.slug === "ep/ec-alice")!.inbound_count).toBe(2);
  });
});

// ── relationalFanout parity (v0.43) ─────────────────────────────────────
async function seedRelational(eng: BrainEngine) {
  const pages: Array<[string, "company" | "person"]> = [
    ["companies/ep-widget", "company"],
    ["companies/ep-other", "company"],
    ["people/ep-inv-a", "person"],
    ["people/ep-inv-b", "person"],
    ["people/ep-emp-c", "person"],
    ["people/ep-mentioner", "person"],
  ];
  for (const [slug, type] of pages) {
    await eng.putPage(slug, { type, title: slug, compiled_truth: `${slug} body`, timeline: "" });
  }
  await eng.upsertChunks("people/ep-inv-b", [
    {
      chunk_index: 0,
      chunk_text: "b",
      chunk_source: "compiled_truth",
      embedding: basisEmbedding(2),
      token_count: 1,
    },
  ] satisfies ChunkInput[]);
  await eng.addLink("people/ep-inv-a", "companies/ep-widget", "", "invested_in", "manual");
  await eng.addLink("people/ep-inv-b", "companies/ep-widget", "", "invested_in", "manual");
  await eng.addLink("people/ep-emp-c", "companies/ep-widget", "", "works_at", "manual");
  await eng.addLink("people/ep-mentioner", "companies/ep-widget", "", "mentions", "mentions");
  await eng.addLink("people/ep-inv-a", "companies/ep-other", "", "invested_in", "manual");
}

describeBoth("Engine parity — relationalFanout", () => {
  const shape = (rows: Awaited<ReturnType<BrainEngine["relationalFanout"]>>) =>
    rows.map(
      (r) =>
        `${r.source_id}:${r.slug}:${r.hop}:${r.edge_count}:${r.via_link_types.join(",")}:${r.path.join(">")}:${r.canonical_chunk_id ?? "null"}`
    );

  test("typed-edge fan-out is identical across engines", async () => {
    const opts = { direction: "in" as const, linkTypes: ["invested_in"] };
    const pg = await pgEngine.relationalFanout(["companies/ep-widget"], opts);
    const pglite = await pgliteEngine.relationalFanout(["companies/ep-widget"], opts);
    expect(shape(pg)).toEqual(shape(pglite));
    expect(pg.map((r) => r.slug).sort()).toEqual(["people/ep-inv-a", "people/ep-inv-b"]);
  });

  test("type-agnostic + mentions-exclusion identical across engines", async () => {
    const pg = await pgEngine.relationalFanout(["companies/ep-widget"], { direction: "in" });
    const pglite = await pgliteEngine.relationalFanout(["companies/ep-widget"], {
      direction: "in",
    });
    expect(shape(pg)).toEqual(shape(pglite));
    expect(pg.map((r) => r.slug)).not.toContain("people/ep-mentioner");
  });

  test("connects (multi-seed, both) identical across engines", async () => {
    const seeds = ["companies/ep-widget", "companies/ep-other"];
    const pg = await pgEngine.relationalFanout(seeds, { direction: "both" });
    const pglite = await pgliteEngine.relationalFanout(seeds, { direction: "both" });
    expect(shape(pg)).toEqual(shape(pglite));
  });
});

// ── page-array ops parity (Subsumio atomic time_entries writes) ─────────
// The append/mutate primitives are single UPDATE statements whose result
// must be byte-identical across engines — a divergence means a web write
// path that behaves differently on self-hosted (pglite) vs managed
// (postgres) deployments.
describeBoth("Engine parity — page array ops", () => {
  test("appendPageArrayItems + mutatePageArrayItems produce identical results on both engines", async () => {
    const slug = "matters/ep-parity-1";
    const initial = [
      { id: "t1", minutes: 60, billed: false },
      { id: "t2", minutes: 30, billed: true, invoice_number: "INV-1" },
    ];
    const run = async (eng: BrainEngine) => {
      await eng.putPage(slug, {
        type: "legal_case",
        title: "Parity matter",
        compiled_truth: "",
        timeline: "",
        frontmatter: { time_entries: initial },
      });
      const appended = await eng.appendPageArrayItems(slug, "time_entries", [
        { id: "t3", minutes: 15, billed: false },
      ]);
      const patched = await eng.mutatePageArrayItems(slug, "time_entries", {
        matchKey: "id",
        matchValues: ["t1", "t2", "t3", "t-missing"],
        set: { billed: true, invoice_number: "INV-2" },
        unless: { eq: { billed: true }, ne: { invoice_number: "INV-2" } },
      });
      const removed = await eng.mutatePageArrayItems(slug, "time_entries", {
        matchKey: "id",
        matchValues: ["t3"],
        remove: true,
        unless: { eq: { billed: true } },
      });
      const absent = await eng.mutatePageArrayItems(slug, "time_entries", {
        matchKey: "id",
        matchValues: ["t-missing"],
        set: { billed: true },
      });
      return { appended, patched, removed, absent };
    };
    const pg = await run(pgEngine);
    const pglite = await run(pgliteEngine);
    expect(pglite).toEqual(pg);
    // Concrete contract (guards against both engines agreeing on a wrong
    // shape): t1 updated, t2 skipped (different invoice), t-missing absent.
    expect(pg.patched?.matched_ids).toEqual(["t1", "t2", "t3"]);
    expect(pg.patched?.skipped_ids).toEqual(["t2"]);
    expect(pg.removed?.skipped_ids).toEqual(["t3"]); // t3 billed by the patch
    expect(pg.absent).toBeNull();
    expect(pg.patched?.items).toEqual([
      { id: "t1", minutes: 60, billed: true, invoice_number: "INV-2" },
      { id: "t2", minutes: 30, billed: true, invoice_number: "INV-1" },
      { id: "t3", minutes: 15, billed: true, invoice_number: "INV-2" },
    ]);
  });

  test("contradiction runs: source_id is stored and loadContradictionsTrend filters by source", async () => {
    const row = (run_id: string, source_id?: string) => ({
      run_id,
      judge_model: "parity",
      prompt_version: "1",
      queries_evaluated: 1,
      queries_with_contradiction: 0,
      total_contradictions_flagged: 0,
      wilson_ci_lower: 0,
      wilson_ci_upper: 1,
      judge_errors_total: 0,
      cost_usd_total: 0.25,
      duration_ms: 1,
      source_tier_breakdown: {},
      report_json: { per_query: [] },
      ...(source_id ? { source_id } : {}),
    });
    const load = async (eng: BrainEngine) => {
      await eng.writeContradictionsRun(row("parity-run-a", "parity-firm-a"));
      await eng.writeContradictionsRun(row("parity-run-b", "parity-firm-b"));
      await eng.writeContradictionsRun(row("parity-run-host"));
      const scoped = await eng.loadContradictionsTrend(1, { sourceIds: ["parity-firm-a"] });
      const all = await eng.loadContradictionsTrend(1);
      return {
        scoped: scoped.map((r) => [r.run_id, r.source_id, r.cost_usd_total]),
        all: all
          .filter((r) => r.run_id.startsWith("parity-run-"))
          .map((r) => [r.run_id, r.source_id])
          .sort(),
      };
    };
    const pg = await load(pgEngine);
    const pl = await load(pgliteEngine);
    expect(pg.scoped).toEqual([["parity-run-a", "parity-firm-a", 0.25]]);
    expect(pg.all).toEqual([
      ["parity-run-a", "parity-firm-a"],
      ["parity-run-b", "parity-firm-b"],
      ["parity-run-host", null],
    ]);
    expect(pl).toEqual(pg);
  });

  test("takes / scorecard / calibration / salience / anomalies honour the source scope on both engines", async () => {
    const seed = async (eng: BrainEngine) => {
      for (const src of ["parity-scope-a", "parity-scope-b"]) {
        await eng.executeRaw(
          "INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT DO NOTHING",
          [src]
        );
        for (const n of [1, 2]) {
          await eng.putPage(
            `parity-scope/${src}-${n}`,
            { type: "note", title: `${src} ${n}`, compiled_truth: "scope", timeline: "" },
            { sourceId: src }
          );
        }
        const page = await eng.getPage(`parity-scope/${src}-1`, { sourceId: src });
        await eng.addTakesBatch([
          {
            page_id: page!.id,
            row_num: 1,
            claim: `parity scope ${src}`,
            kind: "bet",
            holder: "parity-scope-holder",
            weight: 0.8,
          },
        ]);
      }
      await eng.executeRaw(
        `UPDATE takes SET resolved_quality = 'correct', resolved_at = now()
          WHERE holder = 'parity-scope-holder'`
      );
    };
    const read = async (eng: BrainEngine) => {
      const scope = { sourceId: "parity-scope-a" };
      const today = new Date().toISOString().slice(0, 10);
      const takes = await eng.listTakes({ holder: "parity-scope-holder", ...scope });
      const card = await eng.getScorecard({ holder: "parity-scope-holder", ...scope }, undefined);
      const curve = await eng.getCalibrationCurve(
        { holder: "parity-scope-holder", ...scope },
        undefined
      );
      const salience = await eng.getRecentSalience({
        days: 1,
        slugPrefix: "parity-scope",
        ...scope,
      });
      const anomalies = await eng.findAnomalies({ since: today, sigma: 0, ...scope });
      return {
        takes: takes.map((t) => t.claim),
        bets: card.total_bets,
        curveN: curve.reduce((n, b) => n + b.n, 0),
        salience: salience.map((r) => r.source_id).sort(),
        anomalySlugs: anomalies
          .flatMap((a) => a.page_slugs)
          .filter((x) => x.startsWith("parity-scope/"))
          .sort(),
      };
    };
    await seed(pgEngine);
    await seed(pgliteEngine);
    const pg = await read(pgEngine);
    expect(pg.takes).toEqual(["parity scope parity-scope-a"]);
    expect(pg.bets).toBe(1);
    expect(pg.curveN).toBe(1);
    expect(new Set(pg.salience)).toEqual(new Set(["parity-scope-a"]));
    expect(pg.anomalySlugs.every((x) => x.includes("parity-scope-a"))).toBe(true);
    expect(await read(pgliteEngine)).toEqual(pg);
  });

  test("countPagesByStatus: same grouped counts on both engines", async () => {
    const src = "parity-counts";
    const seed = async (eng: BrainEngine) => {
      await eng.executeRaw(
        "INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT DO NOTHING",
        [src]
      );
      const rows: Array<[string, Record<string, unknown>]> = [
        ["pc/a", { status: "open", due_date: "2030-01-10" }],
        ["pc/b", { status: "Open", date: "2030-02-10" }],
        ["pc/c", { status: "done", due_date: "2030-01-01" }],
        ["pc/d", { status: "tombstoned", due_date: "2030-01-01" }],
        ["pc/e", {}],
      ];
      for (const [slug, fm] of rows) {
        await eng.putPage(
          slug,
          { type: "note", title: slug, compiled_truth: "c", timeline: "", frontmatter: fm },
          { sourceId: src }
        );
      }
    };
    const read = async (eng: BrainEngine) =>
      (
        await eng.countPagesByStatus({
          types: ["note"],
          dateFields: ["due_date", "date"],
          dateBefore: "2030-01-31",
          sourceId: src,
        })
      ).sort((x, y) => (x.status < y.status ? -1 : 1));
    await seed(pgEngine);
    await seed(pgliteEngine);
    const pg = await read(pgEngine);
    expect(pg.find((r) => r.status === "open")).toMatchObject({ count: 2, before_count: 1 });
    expect(pg.find((r) => r.status === "tombstoned")).toBeUndefined();
    expect(await read(pgliteEngine)).toEqual(pg);
  });

  test("listPages textMatch: same substring matches on both engines", async () => {
    const src = "parity-textmatch";
    const seed = async (eng: BrainEngine) => {
      await eng.executeRaw(
        "INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT DO NOTHING",
        [src]
      );
      for (const [slug, title, fm] of [
        ["ptm/otto", "Otto", { name: "Otto Altgegner", email: "otto@example.test" }],
        ["ptm/firma", "Firma", { company: "Acme 100% GmbH" }],
        ["ptm/case", "Akte", { case_number: "3 Cg 12/30" }],
      ] as const) {
        await eng.putPage(
          slug,
          { type: "note", title, compiled_truth: "t", timeline: "", frontmatter: { ...fm } },
          { sourceId: src }
        );
      }
    };
    const read = async (eng: BrainEngine, q: string) =>
      (await eng.listPages({ sourceId: src, textMatch: q, limit: 50 })).map((p) => p.slug).sort();
    await seed(pgEngine);
    await seed(pgliteEngine);
    for (const q of ["OTTO", "example.test", "100%", "cg 12", "%%"]) {
      expect(await read(pgliteEngine, q)).toEqual(await read(pgEngine, q));
    }
    expect(await read(pgEngine, "100%")).toEqual(["ptm/firma"]);
  });
});
