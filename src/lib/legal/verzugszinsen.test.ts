import { describe, expect, test } from "vitest";

import { calculateVerzugszinsen, VerzugszinsenInputError } from "./verzugszinsen";

describe("calculateVerzugszinsen", () => {
  test("§ 1333 ABGB: 10.000 €, 365 Tage, act/365 → 400 €", () => {
    const r = calculateVerzugszinsen({
      kapital: 10_000,
      von: "2026-01-01",
      bis: "2027-01-01",
      grundlage: "abgb_1333",
    });
    expect(r.zinsenCents).toBe(40000);
    expect(r.segmente).toHaveLength(1);
    expect(r.segmente[0].tage).toBe(365);
  });

  test("§ 456 UGB: Halbjahres-Segmentierung 1.7.", () => {
    const r = calculateVerzugszinsen({
      kapital: 10_000,
      von: "2026-01-01",
      bis: "2027-01-01",
      grundlage: "ugb_456",
    });
    // Basis 1,53 % in beiden Halbjahren 2026 → Satz 10,73 %
    expect(r.segmente).toHaveLength(2);
    expect(r.segmente[0].bis).toBe("2026-07-01");
    expect(r.segmente[1].von).toBe("2026-07-01");
    expect(r.segmente.every((s) => s.satzProzent === 10.73)).toBe(true);
    // 10.000 × 10,73 % → 1.073 € (181 + 184 Tage)
    const expected =
      Math.round((1_000_000 * 10.73 * 181) / 36500) + Math.round((1_000_000 * 10.73 * 184) / 36500);
    expect(r.zinsenCents).toBe(expected);
  });

  test("§ 456 UGB: historischer Satzwechsel 2025 (2,53 → 1,53)", () => {
    const r = calculateVerzugszinsen({
      kapital: 10_000,
      von: "2025-01-01",
      bis: "2025-08-01",
      grundlage: "ugb_456",
    });
    expect(r.segmente).toHaveLength(2);
    expect(r.segmente[0].satzProzent).toBeCloseTo(11.73);
    expect(r.segmente[1].satzProzent).toBeCloseTo(10.73);
  });

  test("Betreibungspauschale 40 € nur bei § 456 UGB", () => {
    const mit = calculateVerzugszinsen({
      kapital: 1_000,
      von: "2026-01-01",
      bis: "2026-02-01",
      grundlage: "ugb_456",
      betreibungspauschale: true,
    });
    expect(mit.betreibungspauschaleCents).toBe(4000);
    expect(mit.totalCents).toBe(100000 + mit.zinsenCents + 4000);

    const ohne = calculateVerzugszinsen({
      kapital: 1_000,
      von: "2026-01-01",
      bis: "2026-02-01",
      grundlage: "abgb_1333",
      betreibungspauschale: true,
    });
    expect(ohne.betreibungspauschaleCents).toBe(0);
  });

  test("30/360-Methode", () => {
    const r = calculateVerzugszinsen({
      kapital: 12_000,
      von: "2026-01-15",
      bis: "2026-03-15",
      grundlage: "abgb_1333",
      methode: "30/360",
    });
    // 2 volle Monate = 60 Tage → 12.000 × 4 % × 60/360 = 80 €
    expect(r.segmente[0].tage).toBe(60);
    expect(r.zinsenCents).toBe(8000);
  });

  test("vereinbarter Zinssatz", () => {
    const r = calculateVerzugszinsen({
      kapital: 5_000,
      von: "2026-01-01",
      bis: "2026-04-01",
      grundlage: "vereinbart",
      satzProzent: 8,
    });
    // 90 Tage act/365 → 5.000 × 8 % × 90/365 ≈ 98,63 €
    expect(r.zinsenCents).toBe(9863);
  });

  test("Validierung", () => {
    expect(() =>
      calculateVerzugszinsen({
        kapital: 0,
        von: "2026-01-01",
        bis: "2026-02-01",
        grundlage: "abgb_1333",
      })
    ).toThrow(VerzugszinsenInputError);
    expect(() =>
      calculateVerzugszinsen({
        kapital: 100,
        von: "2026-02-01",
        bis: "2026-01-01",
        grundlage: "abgb_1333",
      })
    ).toThrow(VerzugszinsenInputError);
    expect(() =>
      calculateVerzugszinsen({
        kapital: 100,
        von: "2026-01-01",
        bis: "2026-02-01",
        grundlage: "vereinbart",
      })
    ).toThrow(VerzugszinsenInputError);
  });

  test("Quellenmetadaten und Begründung", () => {
    const r = calculateVerzugszinsen({
      kapital: 1_000,
      von: "2026-01-01",
      bis: "2026-02-01",
      grundlage: "ugb_456",
    });
    expect(r.source.statute).toContain("UGB");
    expect(r.source.url).toContain("oenb.at");
    expect(r.basis).toContain("§ 456");
  });
});
