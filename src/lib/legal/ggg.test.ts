import { describe, expect, test } from "vitest";

import { calculateGgg, GggInputError } from "./ggg";

describe("calculateGgg TP1", () => {
  test("unterste Band bis 150 € → 25 €", () => {
    const r = calculateGgg({ tarifpost: "TP1", wert: 150 });
    expect(r.totalCents).toBe(2500);
  });

  test("Bandgrenze 150,01 → nächste Stufe 48 €", () => {
    expect(calculateGgg({ tarifpost: "TP1", wert: 150.01 }).totalCents).toBe(4800);
    expect(calculateGgg({ tarifpost: "TP1", wert: 300 }).totalCents).toBe(4800);
  });

  test("Band 35.000–70.000 → 1.556 €", () => {
    expect(calculateGgg({ tarifpost: "TP1", wert: 50_000 }).totalCents).toBe(155600);
  });

  test("Bandgrenze 350.000 → 7.783 €; darüber 1,2 % + 4.203 €", () => {
    expect(calculateGgg({ tarifpost: "TP1", wert: 350_000 }).totalCents).toBe(778300);
    const r = calculateGgg({ tarifpost: "TP1", wert: 400_000 });
    // 1,2 % von 400.000 = 4.800 + 4.203 = 9.003
    expect(r.totalCents).toBe(900300);
  });

  test("Anm. 3 Viertel bei Rückzug vor Zustellung", () => {
    const r = calculateGgg({ tarifpost: "TP1", wert: 150, ermaessigung: "viertel" });
    expect(r.totalCents).toBe(625);
  });

  test("Anm. 2 halbe Gebühr (EJ/Vergleich)", () => {
    const r = calculateGgg({ tarifpost: "TP1", wert: 3_500, ermaessigung: "haelfte" });
    expect(r.totalCents).toBe(9100);
    expect(r.basisCents).toBe(18200);
  });

  test("Kfz-Rechtsschutzziel → Fixgebühr 70 €", () => {
    const r = calculateGgg({ tarifpost: "TP1", wert: 999_999, kfzRechtsschutz: true });
    expect(r.totalCents).toBe(7000);
  });
});

describe("calculateGgg TP2", () => {
  test("unterste Band bis 150 € → 20 €", () => {
    expect(calculateGgg({ tarifpost: "TP2", wert: 150 }).totalCents).toBe(2000);
  });

  test("Band 140.000–210.000 → 6.867 €", () => {
    expect(calculateGgg({ tarifpost: "TP2", wert: 200_000 }).totalCents).toBe(686700);
  });

  test("über 350.000 → 1,8 % + 6.071 €", () => {
    const r = calculateGgg({ tarifpost: "TP2", wert: 500_000 });
    // 1,8 % von 500.000 = 9.000 + 6.071 = 15.071
    expect(r.totalCents).toBe(1507100);
  });

  test("Viertel-Ermäßigung nur in TP 1 erlaubt", () => {
    expect(() => calculateGgg({ tarifpost: "TP2", wert: 100, ermaessigung: "viertel" })).toThrow(
      GggInputError
    );
  });
});

describe("calculateGgg Validierung", () => {
  test("wirft bei ungültigem Streitwert", () => {
    expect(() => calculateGgg({ tarifpost: "TP1", wert: 0 })).toThrow(GggInputError);
    expect(() => calculateGgg({ tarifpost: "TP1", wert: -5 })).toThrow(GggInputError);
    expect(() => calculateGgg({ tarifpost: "TP1", wert: NaN })).toThrow(GggInputError);
  });

  test("Ergebnis trägt Quellenmetadaten und Begründung", () => {
    const r = calculateGgg({ tarifpost: "TP1", wert: 10_000 });
    expect(r.source.statute).toContain("GGG");
    expect(r.source.url).toContain("ris.bka.gv.at");
    expect(r.basis).toContain((10_000).toLocaleString("de-AT"));
  });
});
