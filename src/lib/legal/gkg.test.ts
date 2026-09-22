// @vitest-environment node

import { describe, expect, test } from "vitest";

import { calculateGkg, GkgInputError, gkgEinfacheGebuehr } from "./gkg";

describe("gkgEinfacheGebuehr — § 34 GKG Stufenformel", () => {
  // Referenzwerte aus Anlage 2 GKG
  test.each([
    [500, 40],
    [1_000, 61],
    [1_500, 82],
    [2_000, 103],
    [3_000, 125.5],
    [10_000, 283],
    [25_000, 435.5],
    [50_000, 638],
    [200_000, 2_038],
    [500_000, 4_138],
  ])("Streitwert %i € → einfache Gebühr %i € (Anlage 2)", (wert, gebuehr) => {
    expect(gkgEinfacheGebuehr(wert)).toBe(gebuehr);
  });

  test("angefangener Stufenbetrag: 501 € → 2 Stufen", () => {
    expect(gkgEinfacheGebuehr(501)).toBe(61); // 40 + 21
  });

  test("über 500.000 €: +210 je angefangene 50.000", () => {
    expect(gkgEinfacheGebuehr(550_000)).toBe(4_348);
    expect(gkgEinfacheGebuehr(500_001)).toBe(4_348);
  });

  test("ungültige Eingaben werfen", () => {
    expect(() => gkgEinfacheGebuehr(0)).toThrow(GkgInputError);
    expect(() => gkgEinfacheGebuehr(-100)).toThrow(GkgInputError);
    expect(() => gkgEinfacheGebuehr(NaN)).toThrow(GkgInputError);
  });
});

describe("calculateGkg — Gebührensätze KV Anlage 1", () => {
  test("KV 1210: 1. Instanz = 3,0 × einfache Gebühr", () => {
    const r = calculateGkg({ streitwert: 10_000, satzKey: "verfahren1Instanz" });
    expect(r.gebuehr).toBe(849); // 283 × 3
    expect(r.kv).toBe("1210");
  });

  test("KV 1100: Mahnverfahren = 0,5", () => {
    const r = calculateGkg({ streitwert: 10_000, satzKey: "mahnverfahren" });
    expect(r.gebuehr).toBe(141.5);
  });

  test("KV 1220: Berufung = 4,0", () => {
    const r = calculateGkg({ streitwert: 50_000, satzKey: "berufung" });
    expect(r.gebuehr).toBe(2_552); // 638 × 4
  });

  test("Mindestgebühr 15 € (§ 34 Abs. 2)", () => {
    const r = calculateGkg({ streitwert: 100, satzKey: "mahnverfahren" });
    expect(r.gebuehr).toBe(20); // 40 × 0,5 = 20 ≥ 15
  });
});
