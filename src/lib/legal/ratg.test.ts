import { describe, expect, it } from "vitest";
import { RATG_TARIFF } from "@/lib/legal/ratg-tariff-data";
import {
  RatgInputError,
  calculateRatgNebenleistung,
  calculateRatgService,
  calculateRatgTp4,
  calculateRatgTp7,
  calculateRatgTp9,
  ratgBaseFee,
  ratgTp5Fee,
  ratgTp6Fee,
  ratgTp8Fee,
  streitgenossenPercent,
} from "@/lib/legal/ratg";

// Transcribed from the tables of BGBl. II Nr. 131/2023 (RIS, amtssigniert,
// ausgegeben am 27. April 2023) — an independent source from the consolidated
// statute text the data file is generated from.
const OFFICIAL = {
  TP1: {
    bands: [4.2, 5.9, 7.5, 8.4, 9.2, 11.1, 14.8, 16.1, 17.9, 21.5, 26.6, 35.1],
    step: 4.2,
    cap: 312.2,
    hourCap: null,
  },
  TP2: {
    bands: [17.9, 26.6, 35.1, 38.7, 43.7, 52.5, 69.8, 78.6, 87.0, 104.6, 130.2, 173.8],
    step: 17.9,
    cap: 1558.2,
    hourCap: 779.3,
  },
  TP3A: {
    bands: [35.1, 52.5, 69.8, 76.8, 87.0, 104.6, 139.1, 156.2, 173.8, 208.2, 260.2, 346.6],
    step: 35.1,
    cap: 20770.6,
    hourCap: 10385.4,
  },
  TP3B: {
    bands: [43.7, 65.4, 87.0, 96.0, 108.6, 130.2, 173.8, 195.2, 216.9, 260.2, 325.0, 433.2],
    step: 43.7,
    cap: 25963.2,
    hourCap: 12981.8,
  },
  TP3C: {
    bands: [52.5, 78.6, 104.6, 115.0, 130.2, 156.2, 208.2, 234.4, 260.2, 312.2, 390.0, 519.6],
    step: 52.5,
    cap: 31155.8,
    hourCap: 15578.0,
  },
} as const;
const UPPER = [40, 70, 110, 180, 360, 730, 1090, 1820, 3630, 5450, 7270, 10170];

describe("RATG tariff data", () => {
  for (const [item, official] of Object.entries(OFFICIAL)) {
    it(`${item} matches BGBl. II Nr. 131/2023`, () => {
      const data = RATG_TARIFF[item as keyof typeof RATG_TARIFF];
      expect(data.bands.map((b) => b.upTo)).toEqual(UPPER);
      expect(data.bands.map((b) => b.amount)).toEqual(official.bands);
      expect(data.stepAmount).toBe(official.step);
      expect(data.stepEvery).toBe(1450);
      expect(data.cap).toBe(official.cap);
      expect(data.hourCap).toBe(official.hourCap);
    });
  }
});

describe("Entlohnung nach Bemessungsgrundlage (TP 3A)", () => {
  it.each([
    [40, 35.1],
    [40.01, 52.5],
    [10_170, 346.6],
    [10_171, 381.7], // erste angefangene 1 450 €
    [11_620, 381.7],
    [11_621, 416.8],
    [34_820, 943.3], // 17 Schritte
    [34_821, 978.4], // Schritt 34 820 → 36 340
    [36_340, 978.4],
    [50_000, 992.06], // + 1 ‰ von 13 660 €
    [363_360, 1305.42], // + 1 ‰ von 327 020 €
    [1_000_000, 1623.74], // + 0,5 ‰ von 636 640 €
    [100_000_000, 20_770.6], // Höchstbetrag
  ])("BG %d € → %d €", (bg, fee) => {
    expect(ratgBaseFee("TP3A", bg)).toBe(fee);
  });

  it("rejects an empty basis", () => {
    expect(() => ratgBaseFee("TP3A", 0)).toThrow(RatgInputError);
  });
});

describe("Leistung mit Nebenleistungen", () => {
  it("Klage TP 3A, BG 10 000 €, Einheitssatz 60 %, ERV einleitend", () => {
    const r = calculateRatgService({
      item: "TP3A",
      kind: "schriftsatz",
      bemessungsgrundlage: 10_000,
      erv: "einleitend",
      label: "Klage",
    });
    expect(r.lines.map((l) => [l.key, l.amount])).toEqual([
      ["entlohnung", 346.6],
      ["einheitssatz", 207.96],
      ["erv", 5],
    ]);
    expect(r.net).toBe(559.56);
  });

  it("über 10 170 € gilt 50 %, doppelter Einheitssatz nach § 23 Abs. 6", () => {
    const r = calculateRatgService({
      item: "TP3A",
      kind: "schriftsatz",
      bemessungsgrundlage: 20_000,
      einheitssatzFactor: 2,
    });
    // 346,60 + 7 × 35,10 = 592,30; 50 % × 2 = 592,30
    expect(r.lines[0].amount).toBe(592.3);
    expect(r.lines[1].amount).toBe(592.3);
  });

  it("Verhandlung: erste Stunde voll, jede weitere begonnene zur Hälfte", () => {
    const r = calculateRatgService({
      item: "TP3A",
      kind: "verhandlung",
      bemessungsgrundlage: 10_000,
      hours: 2.25,
      einheitssatzFactor: 0,
    });
    expect(r.lines).toHaveLength(1);
    expect(r.net).toBe(693.2); // 346,60 + 2 × 173,30
  });

  it("Streitgenossenzuschlag auf Entlohnung und Einheitssatz, ohne ERV", () => {
    expect(streitgenossenPercent(1, 1)).toBe(0);
    expect(streitgenossenPercent(2, 1)).toBe(10);
    expect(streitgenossenPercent(2, 2)).toBe(15);
    expect(streitgenossenPercent(10, 10)).toBe(50);
    const r = calculateRatgService({
      item: "TP3A",
      kind: "schriftsatz",
      bemessungsgrundlage: 10_000,
      erv: "weiterer",
      personen: { vertreten: 2, gegenueber: 1 },
    });
    const sg = r.lines.find((l) => l.key === "streitgenossen")!;
    expect(sg.amount).toBe(55.46); // 10 % von 554,56
    expect(r.net).toBe(612.62); // 346,60 + 207,96 + 55,46 + 2,60
  });

  it("TP 1 kennt keine Verhandlung", () => {
    expect(() =>
      calculateRatgService({ item: "TP1", kind: "verhandlung", bemessungsgrundlage: 500 })
    ).toThrow(RatgInputError);
  });
});

// ── TP 4 bis 9 — Erwartungswerte von Hand aus Anl. 1 RATG idF BGBl. II Nr. 131/2023 ──

describe("TP 5 und 6 (Schreiben, Briefe)", () => {
  it("TP 5 nach Wertstufe und Steigerung über 2 910 €", () => {
    expect(ratgTp5Fee(70)).toBe(4.2);
    expect(ratgTp5Fee(1000)).toBe(9.2);
    // 10,80 + 2 angefangene 1 450 € × 3,30
    expect(ratgTp5Fee(5000)).toBe(17.4);
    expect(ratgTp5Fee(10_000_000)).toBe(104.6);
  });

  it("TP 6 ist das Doppelte, höchstens 208,20 €", () => {
    expect(ratgTp6Fee(1000)).toBe(18.4);
    expect(ratgTp6Fee(100_000)).toBe(208.2);
  });

  it("rechnet die Information aus den Akten mit der Hälfte dazu", () => {
    const r = calculateRatgNebenleistung({
      art: "brief",
      bemessungsgrundlage: 1000,
      anzahl: 2,
      information: true,
    });
    expect(r.lines.map((l) => l.amount)).toEqual([36.8, 18.4]);
    expect(r.net).toBe(55.2);
  });
});

describe("TP 8 (Besprechungen)", () => {
  it("Wertstufen und beide Steigerungsbereiche", () => {
    expect(ratgTp8Fee(1820)).toBe(52.5);
    // 52,50 + 6 × 11,10
    expect(ratgTp8Fee(10_000)).toBe(119.1);
    // 52,50 + 13 × 11,10 + 11,10 (20 670 bis 21 800)
    expect(ratgTp8Fee(21_000)).toBe(207.9);
    // wie oben + 6 × 5,90 über 21 800
    expect(ratgTp8Fee(30_000)).toBe(243.3);
    expect(ratgTp8Fee(50_000_000)).toBe(692.9);
  });

  it("zählt jede begonnene halbe Stunde", () => {
    const r = calculateRatgNebenleistung({
      art: "besprechung",
      bemessungsgrundlage: 10_000,
      hours: 0.75,
    });
    expect(r.net).toBe(238.2);
  });

  it("kurze Besprechung: vier Zehntel", () => {
    const r = calculateRatgNebenleistung({ art: "besprechung_kurz", bemessungsgrundlage: 10_000 });
    expect(r.net).toBe(47.64);
  });
});

describe("TP 4 (Strafsachen)", () => {
  it("Hauptverhandlung wegen sonstiger Vergehen, 1,5 Stunden", () => {
    const r = calculateRatgTp4({
      verfahren: "privatanklage_sonstige",
      leistung: "hauptverhandlung",
      hours: 1.5,
    });
    // 307,60 + 2 × 153,80; Einheitssatz 50 % (BG 11 000 € nach § 10 Z 7 lit b)
    expect(r.lines.map((l) => l.amount)).toEqual([615.2, 307.6]);
  });

  it("Privatbeteiligte erhalten die Hälfte", () => {
    const r = calculateRatgTp4({
      verfahren: "privatbeteiligter_bezirksgericht",
      leistung: "berufungsausfuehrung",
      erv: "weiterer",
    });
    // 1,5 × (184,60 / 2); Einheitssatz 60 % (BG 3 000 €); ERV 2,60
    expect(r.lines.map((l) => l.amount)).toEqual([138.45, 83.07, 2.6]);
  });

  it("Rechtsmittelanmeldung ist ein Zehntel", () => {
    const r = calculateRatgTp4({
      verfahren: "privatanklage_bezirksgericht",
      leistung: "rechtsmittelanmeldung",
      einheitssatzFactor: 0,
    });
    expect(r.net).toBe(18.46);
  });

  it("lehnt eine Anklage durch Privatbeteiligte ab", () => {
    expect(() =>
      calculateRatgTp4({ verfahren: "privatbeteiligter_sonstige", leistung: "anklage" })
    ).toThrow(/Privatbeteiligte/);
  });
});

describe("TP 7 und 9", () => {
  it("TP 7 durch den Rechtsanwalt: doppelte TP 6 je halbe Stunde, mit Einheitssatz", () => {
    const r = calculateRatgTp7({ bemessungsgrundlage: 1000, hours: 1, durch: "anwalt" });
    expect(r.lines.map((l) => l.amount)).toEqual([73.6, 44.16]);
  });

  it("TP 9 Zeitversäumnis je begonnene Stunde, ohne Einheitssatz", () => {
    const r = calculateRatgTp9({ zeitversaeumnisHours: 2.5 });
    expect(r.lines).toHaveLength(1);
    expect(r.net).toBe(101.7);
  });
});
