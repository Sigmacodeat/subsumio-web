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
import { measure } from "../scripts/corpus-sync-inventory.ts";

const ROOT = mkdtempSync(join(tmpdir(), "sync-inventory-"));

function md(path: string, docId: string | null) {
  mkdirSync(join(ROOT, path, ".."), { recursive: true });
  writeFileSync(
    join(ROOT, path),
    `---\nschema_version: 1\n${docId ? `doc_id: ${docId}\n` : ""}title: "x"\n---\n\nText\n`
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
  // Out of scope: raw only.
  md("ch/x.md", null);
});

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const DB: Record<string, Array<string | null>> = {
  "law-at-normen": ["NOR1", "NOR8", "NOR9", null, "NOR7"],
  "law-at-judikatur": ["JJR_1"],
};

const engine = {
  async executeRaw(sql: string, params: unknown[] = []) {
    if (sql.includes("pipeline_state")) return [{ source_key: "jud-ogh", ris_total: "5" }];
    const [source, lastId] = params as [string, number];
    return (
      (DB[source] ?? [])
        // NOR7: an older version dated by mark-superseded-versions.ts.
        .map((doc_id, i) => ({ id: i + 1, doc_id, dated: doc_id === "NOR7" }))
        .filter((r) => r.id > lastId)
    );
  },
  async connect() {},
  async disconnect() {},
};

describe("corpus-sync-inventory", () => {
  test("puts every document in exactly one bucket, by document number", async () => {
    const inv = await measure(engine, ROOT);
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

    expect(by["ch"]).toMatchObject({ inScope: false, rawFiles: 1, risSoll: null });
  });
});
