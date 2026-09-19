import { describe, expect, test } from "bun:test";
import { abbrKey, parseCitedNorm, provisionKey } from "../scripts/build-citation-links.ts";

describe("build-citation-links parsing", () => {
  test("RIS cited-norm strings", () => {
    expect(parseCitedNorm("ABGB §1295 Abs1")).toEqual({ abbr: "ABGB", key: "P1295" });
    expect(parseCitedNorm("B-VG Art.133 Abs4")).toEqual({ abbr: "BVG", key: "A133" });
    expect(parseCitedNorm("BEinstG §14 Abs2")).toEqual({ abbr: "BEINSTG", key: "P14" });
    expect(parseCitedNorm("EStG 1988 §4 Abs4 Z1")).toEqual({ abbr: "ESTG1988", key: "P4" });
    expect(parseCitedNorm("AVG §66a")).toEqual({ abbr: "AVG", key: "P66a" });
    expect(parseCitedNorm("VwRallg")).toBeNull();
  });

  test("norm paragraph_ref and abbr use the same keys", () => {
    expect(provisionKey("§ 1295")).toBe("P1295");
    expect(provisionKey("Art. 133")).toBe("A133");
    expect(provisionKey("Anl. 2")).toBe("N2");
    expect(provisionKey("§ 66a")).toBe("P66a");
    expect(abbrKey("B-VG")).toBe("BVG");
    expect(abbrKey("EStG 1988")).toBe("ESTG1988");
  });
});
