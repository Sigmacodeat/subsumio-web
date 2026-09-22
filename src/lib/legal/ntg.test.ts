import { describe, expect, test } from "vitest";

import { calculateNtg, calculateNtgZeitgebuehr, NtgInputError } from "./ntg";
import { NTG_BASIS_CAP_EURO } from "./ntg-tariff-data";

describe("calculateNtg Wertgebühr (Anl. 1 Z 1)", () => {
  test("Flatfee: bis 70 € → 9,20 €; bis 150 € → 18,20 €", () => {
    expect(calculateNtg({ tarifart: "zweiseitig_voll", grundlage: 70 }).totalCents).toBe(920);
    expect(calculateNtg({ tarifart: "zweiseitig_voll", grundlage: 70.01 }).totalCents).toBe(1820);
    expect(calculateNtg({ tarifart: "zweiseitig_voll", grundlage: 150 }).totalCents).toBe(1820);
  });

  test("progressive Scheibe: 200 € → 18,20 + 5,30 = 23,50", () => {
    expect(calculateNtg({ tarifart: "zweiseitig_voll", grundlage: 200 }).totalCents).toBe(2350);
  });

  test("Bandende 1.090 € → 18,20 + 14×5,30 = 92,40", () => {
    expect(calculateNtg({ tarifart: "zweiseitig_voll", grundlage: 1_090 }).totalCents).toBe(9240);
  });

  test("Bandwechsel 1.091 € → +15,60 nächste Scheibe = 108,00", () => {
    expect(calculateNtg({ tarifart: "zweiseitig_voll", grundlage: 1_091 }).totalCents).toBe(10800);
  });

  test("gesetzliche Halbierung (§§ 19/20, § 18 Abs 2)", () => {
    const voll = calculateNtg({ tarifart: "zweiseitig_voll", grundlage: 1_090 });
    const halb = calculateNtg({ tarifart: "darlehen", grundlage: 1_090 });
    expect(halb.totalCents).toBe(Math.round(voll.totalCents / 2));
    expect(halb.vollCents).toBe(voll.totalCents);
  });

  test("Bemessungsgrundlage-Deckel 3.633.640 €", () => {
    const atCap = calculateNtg({
      tarifart: "zweiseitig_voll",
      grundlage: NTG_BASIS_CAP_EURO,
    });
    const overCap = calculateNtg({
      tarifart: "zweiseitig_voll",
      grundlage: NTG_BASIS_CAP_EURO + 500_000,
    });
    expect(overCap.totalCents).toBe(atCap.totalCents);
    expect(overCap.basis).toContain("Deckel");
  });
});

describe("calculateNtgZeitgebuehr § 26", () => {
  test("angefangene halbe Stunden aufrunden", () => {
    expect(calculateNtgZeitgebuehr(30).totalCents).toBe(1290);
    expect(calculateNtgZeitgebuehr(31).totalCents).toBe(2580);
    expect(calculateNtgZeitgebuehr(60).totalCents).toBe(2580);
  });

  test("wirft bei ungültiger Zeit", () => {
    expect(() => calculateNtgZeitgebuehr(0)).toThrow(NtgInputError);
  });
});

describe("calculateNtg Validierung", () => {
  test("wirft bei ungültiger Grundlage", () => {
    expect(() => calculateNtg({ tarifart: "zweiseitig_voll", grundlage: -1 })).toThrow(
      NtgInputError
    );
  });
});
