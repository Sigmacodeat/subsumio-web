/**
 * corpus-sync-inventory.ts — the measurement behind the /ops/corpus sync
 * table. Every document must land in exactly one bucket, counted by RIS
 * document number on all three levels (RIS, disk, DB). Regression for the
 * 2026-09-25 audit: the table used to count raw files (with duplicates of
 * two naming generations) against distinct import file names.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyInDb, measure, PROOF_BUCKETS } from "../scripts/corpus-sync-inventory.ts";

const ROOT = mkdtempSync(join(tmpdir(), "sync-inventory-"));

/** content_hash of a normalized file: one per doc_id unless a test says otherwise. */
const hashOf = (docId: string) =>
  docId
    .toLowerCase()
    .replace(/[^0-9a-f]/g, "a")
    .padEnd(16, "0")
    .slice(0, 16);

function md(path: string, docId: string | null, hash: string | null = docId && hashOf(docId)) {
  mkdirSync(join(ROOT, path, ".."), { recursive: true });
  writeFileSync(
    join(ROOT, path),
    `---\nschema_version: 1\n${docId ? `doc_id: ${docId}\n` : ""}${hash ? `content_hash: "${hash}"\n` : ""}title: "x"\n---\n\nText\n`
  );
}

beforeAll(() => {
  // Bundesrecht: NOR2 twice on disk (two file generations), NOR3/NOR4 missing.
  md("_normalized/at-normen/a/p-1.md", "NOR1");
  md("_normalized/at-normen/a/p-2.md", "NOR2");
  md("_normalized/at-normen/a-old/p-2.md", "NOR2");
  md("_normalized/at-normen/b/p-1.md", "NOR8"); // repealed: not in the in-force index
  for (const f of ["a/p-1.md", "a/p-2.md", "a-old/p-2.md", "b/p-1.md", "junk.md"])
    md(`at-normen/${f}`, null);
  mkdirSync(join(ROOT, "_state"), { recursive: true });
  writeFileSync(
    join(ROOT, "_state/ris-inforce.jsonl"),
    [
      { nor: "NOR0", gnr: "1", apa: "§ 0" },
      { nor: "NOR1", gnr: "1", apa: "§ 1" },
      { nor: "NOR2", gnr: "1", apa: "§ 2" },
      { nor: "NOR3", gnr: "1", apa: "§ 3" },
      { nor: "NOR4", gnr: "1", apa: "Anl. 1" },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n") + "\n"
  );
  writeFileSync(
    join(ROOT, "_state/ris-fetch-outcomes.jsonl"),
    [
      { corpus: "at-normen", id: "NOR3", outcome: "failed", at: "2026-09-25T00:00:00Z" },
      { corpus: "at-normen", id: "NOR4", outcome: "no_text", at: "2026-09-25T00:00:00Z" },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n") + "\n"
  );
  // OGH: soll from the RIS hit count only.
  md("_normalized/at-judikatur/JJR_1.md", "JJR_1");
  md("_normalized/at-judikatur/JJT_2.md", "JJT_2");
  // Small RIS collection: Soll from the hit count.
  md("_normalized/at-avn/a.md", "AVN1");
  // Out of scope: raw only.
  md("ch/x.md", null);

  // Landesrecht, proof per Land: LST1 confirmed, LST2 file ≠ DB (checksum),
  // LWI1 failed the content check, LWI2 changed after it, LWI3 not imported,
  // LBG1 not fetched.
  md("_normalized/at-landesrecht/stmk/a.md", "LST1");
  md("_normalized/at-landesrecht/stmk/b.md", "LST2");
  md("_normalized/at-landesrecht/wien/a.md", "LWI1");
  md("_normalized/at-landesrecht/wien/b.md", "LWI2");
  md("_normalized/at-landesrecht/wien/c.md", "LWI3");
  writeFileSync(
    join(ROOT, "_state/ris-inforce-landesrecht.jsonl"),
    [
      { nor: "LST1", gnr: "20000001", abk: "StLG", apa: "§ 1" },
      { nor: "LST2", gnr: "20000001", abk: "StLG", apa: "§ 2" },
      { nor: "LWI1", gnr: "20000001", abk: "WLG", apa: "§ 1" },
      { nor: "LWI2", gnr: "20000001", abk: "WLG", apa: "§ 2" },
      { nor: "LWI3", gnr: "20000001", abk: "WLG", apa: "§ 3" },
      { nor: "LBG1", gnr: "10000001", abk: "BLG", apa: "§ 1" },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n") + "\n"
  );
});

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const DB: Record<string, Array<string | null>> = {
  "law-at-normen": ["NOR1", "NOR8", "NOR9", null, "NOR7"],
  "law-at-judikatur": ["JJR_1"],
  "law-at-landesrecht": ["LST1", "LST2", "LWI1", "LWI2"],
};
/** Pages whose content the audit accepted (corpus_page_verified). */
const VERIFIED = new Set(["NOR1", "JJR_1", "LST1", "LST2"]);
/** Pages changed after the last content check. */
const CHANGED = new Set(["LWI2"]);
/** DB checksum differs from the file. */
const DB_HASH: Record<string, string> = { LST2: "ffffffffffffffff" };

const engine = {
  async executeRaw(sql: string, params: unknown[] = []) {
    if (sql.includes("pipeline_state")) return [{ source_key: "jud-ogh", ris_total: "5" }];
    if (sql.includes("to_regclass")) return [{ ok: true }];
    if (sql.includes("corpus_status"))
      return [
        { source_id: "law-at-normen", last_plausibility_check: "2026-09-25T00:00:00Z" },
        { source_id: "law-at-landesrecht", last_plausibility_check: "2026-09-25T00:00:00Z" },
        { source_id: "law-at-judikatur", last_plausibility_check: "2026-09-25T00:00:00Z" },
      ];
    const [source, lastId] = params as [string, number];
    return (
      (DB[source] ?? [])
        // NOR7: an older version dated by mark-superseded-versions.ts.
        .map((doc_id, i) => ({
          id: i + 1,
          doc_id,
          dated: doc_id === "NOR7",
          fm_hash: doc_id ? (DB_HASH[doc_id] ?? hashOf(doc_id)) : null,
          verified: doc_id !== null && VERIFIED.has(doc_id),
          changed: doc_id !== null && CHANGED.has(doc_id),
        }))
        .filter((r) => r.id > lastId)
    );
  },
  async connect() {},
  async disconnect() {},
};

describe("corpus-sync-inventory", () => {
  test("puts every document in exactly one bucket, by document number", async () => {
    // No network in tests: the small-source Soll comes from a stub.
    const inv = await measure(engine, ROOT, async () => new Map([["at-avn", 707]]));
    const by = Object.fromEntries(inv.sources.map((s) => [s.corpus, s]));

    const normen = by["at-normen"];
    expect(normen).toMatchObject({
      inScope: true,
      risSoll: 4, // § 0 excluded
      risSollKind: "index",
      rawFiles: 5,
      normalizedFiles: 4,
      diskDocs: 3, // NOR2 counted once
      dbDocs: 4,
      dbPages: 5,
      dbPagesWithoutDocId: 1,
      missingOnDisk: 2,
      // Raw reasons; the web side (toSyncRow) keeps "failed" as open work —
      // only a real RIS answer (no text, 404) makes a document unreachable.
      missingByReason: { open: 0, failed: 1, no_text: 1, not_found: 0 },
      diskNotInDb: 1, // NOR2
      dbNotOnDisk: 1, // NOR9
      dbHistorical: 1, // NOR7 — kept on purpose, not an orphan
      notInRisSoll: 1, // NOR8 — repealed, still on disk
    });

    expect(by["at-judikatur"]).toMatchObject({
      risSoll: 5,
      risSollKind: "hits",
      diskDocs: 2,
      dbDocs: 1,
      missingOnDisk: 3,
      diskNotInDb: 1,
      dbNotOnDisk: 0,
      notInRisSoll: null,
    });

    expect(by["at-avn"]).toMatchObject({
      risSoll: 707,
      risSollKind: "hits",
      diskDocs: 1,
      missingOnDisk: 706,
    });

    expect(by["ch"]).toMatchObject({ inScope: false, rawFiles: 1, risSoll: null });
  });

  test("proof: one bucket per document, buckets add up to the Soll", async () => {
    const inv = await measure(engine, ROOT, async () => new Map([["at-avn", 707]]));
    const by = Object.fromEntries(inv.sources.map((s) => [s.corpus, s]));
    const sum = (c: Record<string, number>) => PROOF_BUCKETS.reduce((n, b) => n + c[b]!, 0);

    const normen = by["at-normen"]!.proof!;
    expect(normen.sollExact).toBe(true);
    expect(normen.counts).toEqual({
      confirmed: 1, // NOR1
      mismatch: 0,
      defective: 0,
      unchecked: 0,
      importOpen: 1, // NOR2
      fetchOpen: 1, // NOR3 (failed = still open)
      unreachable: 1, // NOR4 (no text at RIS)
    });
    expect(sum(normen.counts)).toBe(by["at-normen"]!.risSoll);
    expect(normen.samples.fetchOpen).toEqual([{ id: "NOR3", label: "Gesetz 1 § 3" }]);
    expect(normen.laws).toEqual({ "1": [1, 0, 0, 0, 1, 1, 1] });

    const lr = by["at-landesrecht"]!.proof!;
    expect(lr.counts).toEqual({
      confirmed: 1,
      mismatch: 1,
      defective: 1,
      unchecked: 1,
      importOpen: 1,
      fetchOpen: 1,
      unreachable: 0,
    });
    expect(sum(lr.counts)).toBe(by["at-landesrecht"]!.risSoll);
    expect(Object.keys(lr.parts!)).toEqual(["bgld", "stmk", "wien"]);
    expect(lr.parts!.stmk!.counts).toMatchObject({ confirmed: 1, mismatch: 1 });
    expect(lr.parts!.wien!.samples.defective).toEqual([{ id: "LWI1", label: "WLG § 1" }]);
    // Statute keys carry the Land — the same key the per-statute list uses.
    expect(Object.keys(lr.laws!).sort()).toEqual([
      "bgld-10000001",
      "stmk-20000001",
      "wien-20000001",
    ]);

    // Courts: only a hit count — the buckets cover the disk, fetchOpen is the estimate.
    const ogh = by["at-judikatur"]!.proof!;
    expect(ogh.sollExact).toBe(false);
    expect(ogh.counts).toMatchObject({ confirmed: 1, importOpen: 1, fetchOpen: 3 });

    // Out of scope and the archive carry no proof.
    expect(by["ch"]!.proof).toBeUndefined();
  });
});

describe("classifyInDb", () => {
  const db = (over: Partial<Parameters<typeof classifyInDb>[1]> = {}) => ({
    hashes: new Set(["aaaaaaaaaaaaaaaa"]),
    allVerified: true,
    changedSinceCheck: false,
    dated: false,
    ...over,
  });
  const disk = new Set(["aaaaaaaaaaaaaaaa"]);

  test("checksum first: a verified page with other content is not the document", () => {
    expect(classifyInDb(new Set(["bbbbbbbbbbbbbbbb"]), db(), true)).toBe("mismatch");
  });
  test("two differing files for one number are a mix, never confirmed", () => {
    expect(classifyInDb(new Set(["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"]), db(), true)).toBe(
      "mismatch"
    );
  });
  test("missing checksum on either side is a mismatch", () => {
    expect(classifyInDb(new Set([""]), db(), true)).toBe("mismatch");
    expect(classifyInDb(disk, db({ hashes: new Set([""]) }), true)).toBe("mismatch");
  });
  test("content verdict only counts for unchanged pages", () => {
    expect(classifyInDb(disk, db(), true)).toBe("confirmed");
    expect(classifyInDb(disk, db({ allVerified: false }), true)).toBe("defective");
    expect(classifyInDb(disk, db({ allVerified: false, changedSinceCheck: true }), true)).toBe(
      "unchecked"
    );
    expect(classifyInDb(disk, db({ allVerified: false }), false)).toBe("unchecked");
  });
});
