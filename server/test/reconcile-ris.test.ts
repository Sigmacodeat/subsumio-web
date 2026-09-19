import { describe, expect, test } from "bun:test";
import { diff, inventoryNorIds, isMetadataOnlyNorm } from "../scripts/reconcile-ris.ts";

describe("reconcile-ris", () => {
  test("metadata-only records (§ 0) are not counted as norms", () => {
    expect(isMetadataOnlyNorm("§ 0")).toBe(true);
    expect(isMetadataOnlyNorm("§§ 0")).toBe(true);
    expect(isMetadataOnlyNorm(null)).toBe(true);
    expect(isMetadataOnlyNorm("§ 1295")).toBe(false);
    expect(isMetadataOnlyNorm("Art. 7")).toBe(false);
  });

  test("inventory lines become the set of NOR numbers in force", () => {
    const jsonl = [
      JSON.stringify({ nor: "NOR1", apa: "§ 1" }),
      JSON.stringify({ nor: "NOR2", apa: "§ 0" }),
      JSON.stringify({ nor: "NOR3", apa: "Art. 7" }),
      "",
    ].join("\n");
    expect([...inventoryNorIds(jsonl)].sort()).toEqual(["NOR1", "NOR3"]);
  });

  test("missing and extra are computed both ways", () => {
    const d = diff(new Set(["A", "B", "C"]), new Set(["B", "C", "D"]));
    expect(d.missing).toEqual(["A"]);
    expect(d.extra).toEqual(["D"]);
  });
});
