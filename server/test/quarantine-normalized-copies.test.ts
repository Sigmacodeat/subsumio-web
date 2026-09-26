/**
 * quarantine-normalized-copies.ts — canonical copies without a raw file, and
 * copies whose raw file lost the normalizer's duplicate selection, leave
 * _normalized (2026-09-26: 17,945 + 855 such copies on production).
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { planQuarantine } from "../scripts/quarantine-normalized-copies.ts";

function file(root: string, rel: string, docId: string, body: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(
    join(root, rel),
    `---\ntitle: "x"\ndoc_id: "${docId}"\nsource_url: "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/${docId}/${docId}.html"\n---\n\n${body}\n`
  );
}

describe("planQuarantine", () => {
  test("orphans and duplicate losers move, winners and singles stay", () => {
    const root = mkdtempSync(join(tmpdir(), "q-"));
    const raw = join(root, "at-normen");
    const norm = join(root, "_normalized", "at-normen");
    const long = "§ 1. " + "Ein vollständiger Normtext. ".repeat(20);
    // NOR1 twice on disk: the full text wins, the stub loses.
    file(raw, "a/p-1.md", "NOR1", long);
    file(raw, "old/p-1.md", "NOR1", "§ 1. kurz");
    file(norm, "a/p-1.md", "NOR1", long);
    file(norm, "old/p-1.md", "NOR1", "§ 1. kurz");
    // NOR2 single — stays.
    file(raw, "b/p-1.md", "NOR2", long);
    file(norm, "b/p-1.md", "NOR2", long);
    // NOR3 only canonical — its raw file is gone.
    file(norm, "c/p-1.md", "NOR3", long);
    // NOR4's path now holds NOR5 (a later fetch).
    file(raw, "d/p-1.md", "NOR5", long);
    file(norm, "d/p-1.md", "NOR4", long);

    // NOR6 twice raw, only the losing file was ever normalized — it stays.
    file(raw, "e/p-1.md", "NOR6", long);
    file(raw, "e-old/p-1.md", "NOR6", "§ 1. kurz");
    file(norm, "e-old/p-1.md", "NOR6", "§ 1. kurz");

    const plan = planQuarantine(raw, norm);
    expect(plan.keptLosers).toBe(1);
    expect(plan.moves.sort((x, y) => x.rel.localeCompare(y.rel))).toEqual([
      { rel: "c/p-1.md", reason: "no_raw", docId: "NOR3" },
      { rel: "d/p-1.md", reason: "raw_replaced", docId: "NOR4" },
      { rel: "old/p-1.md", reason: "duplicate_loser", docId: "NOR1" },
    ]);
  });

  test("an unmounted raw corpus stops the run", () => {
    const root = mkdtempSync(join(tmpdir(), "q-"));
    const norm = join(root, "_normalized", "at-normen");
    for (let i = 0; i < 4; i++) file(norm, `p-${i}.md`, `NOR${i}`, "x");
    expect(() => planQuarantine(join(root, "at-normen"), norm)).toThrow(/nicht eingehängt/);
  });
});
