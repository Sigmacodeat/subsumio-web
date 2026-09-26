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

function md(
  path: string,
  docId: string | null,
  hash: string | null = docId && hashOf(docId),
  withRaw = true
) {
  const text = `---\nschema_version: 1\n${docId ? `doc_id: ${docId}\n` : ""}${hash ? `content_hash: "${hash}"\n` : ""}title: "x"\n---\n\nText\n`;
  mkdirSync(join(ROOT, path, ".."), { recursive: true });
  writeFileSync(join(ROOT, path), text);
  // A canonical copy counts only next to its raw file (same relative path).
  const raw = path.replace(/^_normalized\//, "");
  if (withRaw && raw !== path) {
    mkdirSync(join(ROOT, raw, ".."), { recursive: true });
    writeFileSync(join(ROOT, raw), text);
  }
}

beforeAll(() => {
  // Bundesrecht: NOR2 twice on disk (two file generations), NOR3/NOR4 missing.
  md("_normalized/at-normen/a/p-1.md", "NOR1");
  md("_normalized/at-normen/a/p-2.md", "NOR2");
  md("_normalized/at-normen/a-old/p-2.md", "NOR2");
  md("_normalized/at-normen/b/p-1.md", "NOR8"); // repealed: not in the in-force index
  md("at-normen/junk.md", null); // raw file without a canonical copy
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
  md("_normalized/at-landesrecht/stmk/c.md", "LST3");
  md("_normalized/at-landesrecht/wien/a.md", "LWI1");
  md("_normalized/at-landesrecht/wien/b.md", "LWI2");
  md("_normalized/at-landesrecht/wien/c.md", "LWI3");
  // Canonical copy whose raw file is gone: not on disk, LBG1 stays missing.
  md("_normalized/at-landesrecht/bgld/x.md", "LBG1", undefined, false);
  // A later fetch put another document at the same path: the canonical copy
  // (LWI8, an older version) no longer has its raw file.
  md("_normalized/at-landesrecht/wien/d.md", "LWI8");
  md("at-landesrecht/wien/d.md", "LWI9");
  writeFileSync(
    join(ROOT, "_state/ris-inforce-landesrecht.jsonl"),
    [
      { nor: "LST1", gnr: "20000001", abk: "StLG", apa: "§ 1" },
      { nor: "LST2", gnr: "20000001", abk: "StLG", apa: "§ 2" },
      { nor: "LST3", gnr: "20000001", abk: "StLG", apa: "§ 3" },
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
  "law-at-landesrecht": ["LST1", "LST2", "LWI1", "LWI2", "LST3"],
};
/** Pages whose content the audit accepted (corpus_page_verified). */
const VERIFIED = new Set(["NOR1", "JJR_1", "LST1", "LST2", "LST3"]);
/** Metadata in the DB; by default what the RIS index says. */
const META: Record<string, Record<string, string>> = {
  NOR1: { m_paragraph_ref: "§ 1" },
  LST1: { m_abbr: "StLG", m_paragraph_ref: "§ 1" },
  LST2: { m_abbr: "StLG", m_paragraph_ref: "§ 2" },
  LWI1: { m_abbr: "WLG", m_paragraph_ref: "§ 1" },
  LWI2: { m_abbr: "WLG", m_paragraph_ref: "§ 2" },
  // Text verified, but the abbreviation is not what RIS lists.
  LST3: { m_abbr: "StLG 1999", m_paragraph_ref: "§ 3", m_retrieved_at: "2026-01-01" },
};
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
          ...(doc_id ? META[doc_id] : {}),
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
      metaMismatch: 0,
      unchecked: 0,
      importOpen: 1, // NOR2
      fetchOpen: 1, // NOR3 (failed = still open)
      unreachable: 1, // NOR4 (no text at RIS)
    });
    expect(sum(normen.counts)).toBe(by["at-normen"]!.risSoll);
    expect(normen.samples.fetchOpen).toEqual([{ id: "NOR3", label: "Gesetz 1 § 3" }]);
    expect(normen.laws).toEqual({ "1": [1, 0, 0, 0, 0, 1, 1, 1] });

    const lr = by["at-landesrecht"]!.proof!;
    expect(lr.counts).toEqual({
      confirmed: 1,
      mismatch: 1,
      defective: 1,
      metaMismatch: 1, // LST3

      unchecked: 1,
      importOpen: 1,
      fetchOpen: 1,
      unreachable: 0,
    });
    expect(sum(lr.counts)).toBe(by["at-landesrecht"]!.risSoll);
    expect(Object.keys(lr.parts!)).toEqual(["bgld", "stmk", "wien"]);
    expect(by["at-landesrecht"]!.normalizedWithoutRaw).toBe(2);
    expect(lr.parts!.stmk!.counts).toMatchObject({ confirmed: 1, mismatch: 1, metaMismatch: 1 });
    expect(lr.parts!.stmk!.samples.metaMismatch).toEqual([
      { id: "LST3", label: "StLG § 3 — Abkürzung" },
    ]);
    expect(lr.metaFields).toEqual({ abbr: 1 });
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
  test("metadata: a failed text outranks it, a verified text does not make it right", () => {
    expect(classifyInDb(disk, db({ metaDiff: ["abbr"] }), true)).toBe("metaMismatch");
    expect(classifyInDb(disk, db({ metaDiff: ["abbr"], allVerified: false }), true)).toBe(
      "defective"
    );
    expect(classifyInDb(disk, db({ metaDiff: [] }), true)).toBe("confirmed");
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

describe("history", () => {
  test("one compact line per measurement, old lines dropped", async () => {
    const { appendHistory, historyLine, HISTORY_DAYS } =
      await import("../scripts/corpus-sync-inventory.ts");
    const inv = await measure(engine, ROOT, async () => new Map([["at-avn", 707]]));
    const line = historyLine(inv);
    expect(line.s["at-normen"]).toEqual([4, 1, 0, 0, 0, 0, 1, 1, 1]);
    expect(line.s["ch"]).toBeUndefined();

    const now = Date.parse(inv.measuredAt);
    const old = JSON.stringify({
      at: new Date(now - (HISTORY_DAYS + 1) * 86_400_000).toISOString(),
      s: {},
    });
    const recent = JSON.stringify({ at: new Date(now - 86_400_000).toISOString(), s: {} });
    const out = appendHistory(`${old}\n${recent}\nkaputt\n`, line, now).trim().split("\n");
    expect(out).toHaveLength(2);
    expect(JSON.parse(out[1]!).at).toBe(inv.measuredAt);
  });

  test("a court list is the Soll only once the crawl reconciled with RIS", async () => {
    const write = (complete: boolean) => {
      writeFileSync(
        join(ROOT, "_state/ris-index-jud-ogh.jsonl"),
        ["JJR_1", "JJT_2", "JJT_3"]
          .map((id) => JSON.stringify({ id, kurztitel: `1Ob${id}` }))
          .join("\n") + "\n"
      );
      writeFileSync(
        join(ROOT, "_state/ris-index-jud-ogh.meta.json"),
        JSON.stringify({ crawledAt: "2026-09-26T00:00:00Z", risTotal: 3, listed: 3, complete })
      );
    };
    write(false);
    let by = Object.fromEntries(
      (await measure(engine, ROOT, async () => new Map())).sources.map((s) => [s.corpus, s])
    );
    expect(by["at-judikatur"]!.risSollKind).toBe("hits");
    expect(by["at-judikatur"]!.courtIndex).toMatchObject({ complete: false, listed: 3 });

    write(true);
    by = Object.fromEntries(
      (await measure(engine, ROOT, async () => new Map())).sources.map((s) => [s.corpus, s])
    );
    const ogh = by["at-judikatur"]!;
    expect(ogh.risSollKind).toBe("index");
    expect(ogh.risSoll).toBe(3);
    expect(ogh.proof!.sollExact).toBe(true);
    // JJT_3 is listed by RIS but not on disk — now known by number.
    expect(ogh.proof!.samples.fetchOpen).toEqual([{ id: "JJT_3", label: "1ObJJT_3" }]);
    rmSync(join(ROOT, "_state/ris-index-jud-ogh.jsonl"));
    rmSync(join(ROOT, "_state/ris-index-jud-ogh.meta.json"));
  });
});
