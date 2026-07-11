import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { splitStatute } from "../src/core/legal/split-statute.ts";

// ---------------------------------------------------------------------------
// AT corpus completeness gate.
//
// The Austrian codes are RIS "GeltendeFassung" PDF text (no `## §` headings).
// A regression in split-statute once stranded the flagship codes: the ABGB
// recovered 12 of ~1500 §§, and the UGB/IO/GmbHG/AktG parsed to ZERO — the
// entire civil, commercial and insolvency law was invisible to §-retrieval.
//
// This test re-runs the real split over the checked-in corpus and asserts a
// conservative floor per code (well below the true count, well above the
// broken state) plus the strongest invariant: NO Austrian statute file may
// split to zero sections. It needs no engine, embeddings or network — pure,
// deterministic, cheap enough to run every CI shard.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const AT_DIR = join(__dirname, "../../law-corpus/at");

function sectionCount(file: string): number {
  const path = join(AT_DIR, file);
  if (!existsSync(path)) return -1;
  return splitStatute(readFileSync(path, "utf8")).sections.length;
}

// Conservative floors: the fix currently yields far more (e.g. ABGB 1352),
// but the corpus version drifts as RIS reconsolidates. Floors guard the
// catastrophic-regression class (flagship code collapses to a handful / zero).
const FLAGSHIP_FLOORS: Array<{ file: string; abbr: string; min: number }> = [
  { file: "abgb.md", abbr: "ABGB", min: 1000 }, // Zivilrecht — was 12
  { file: "stgb-at.md", abbr: "StGB", min: 300 }, // Strafrecht — was 20
  { file: "ugb.md", abbr: "UGB", min: 500 }, // Unternehmensrecht — was 0
  { file: "io.md", abbr: "IO", min: 250 }, // Insolvenz — was 0
  { file: "gmbhg-at.md", abbr: "GmbHG", min: 100 }, // was 0
  { file: "aktg-at.md", abbr: "AktG", min: 200 }, // was 0
  { file: "eheg.md", abbr: "EheG", min: 30 }, // was 0
  { file: "estg-at.md", abbr: "EStG", min: 150 }, // Steuer — was 49
  { file: "zpo-at.md", abbr: "ZPO", min: 150 }, // Zivilprozess
  { file: "stpo-at.md", abbr: "StPO", min: 400 }, // Strafprozess
  { file: "bao.md", abbr: "BAO", min: 300 }, // Abgaben
];

describe("AT corpus completeness gate", () => {
  for (const { file, abbr, min } of FLAGSHIP_FLOORS) {
    test(`${abbr} (${file}) splits into at least ${min} §-sections`, () => {
      const count = sectionCount(file);
      expect(count).toBeGreaterThanOrEqual(0); // file exists
      expect(count).toBeGreaterThanOrEqual(min);
    });
  }

  test("§ 1295 ABGB (Schadenersatz) is an independently retrievable section", () => {
    const { sections } = splitStatute(readFileSync(join(AT_DIR, "abgb.md"), "utf8"));
    const refs = new Set(sections.map((s) => s.ref));
    expect(refs.has("1295")).toBe(true);
    const s = sections.find((x) => x.ref === "1295")!;
    expect(s.body).toContain("§ 1295");
  });

  test("no Austrian statute file splits to zero sections", () => {
    const files = readdirSync(AT_DIR).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(50);
    const empties = files.filter((f) => sectionCount(f) === 0);
    expect(empties).toEqual([]);
  });
});
