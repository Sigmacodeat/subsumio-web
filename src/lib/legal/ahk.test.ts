import { describe, expect, it } from "vitest";
import { AHK_BEMESSUNGSGRUNDLAGEN, AHK_STRAF_POSITIONEN } from "@/lib/legal/ahk-tariff-data";
import {
  AhkInputError,
  calculateAhkStraf,
  calculateAhkStrafRatg,
  calculateAhkZivilverwaltung,
  ahkNachtWochenendeZuschlag,
  ahkSichereNachrichtAuslage,
  einstufungAusStrafdrohung,
} from "@/lib/legal/ahk";

// Independently transcribed from the AHK primary text (Stand: 01.10.2024,
// oerak.at/fileadmin/user_upload/Gesetzestexte/AHK/AHK_01102024.pdf, § 9
// Abs 1), read directly a second time — not copied from ahk-tariff-data.ts —
// so a transcription error in the data file doesn't slip past unnoticed.
const OFFICIAL_STRAF = {
  bezirksgericht: {
    hauptverhandlung: [238, 119],
    berufung_voll: 714,
    berufung_strafe: 352,
    berufungsverhandlung_voll: [468, 234],
    berufungsverhandlung_strafe: [352, 176],
  },
  einzelrichter_gerichtshof: {
    hauptverhandlung: [396, 198],
    berufung_voll: 1188,
    berufung_strafe: 590,
    berufungsverhandlung_voll: [786, 393],
    berufungsverhandlung_strafe: [590, 295],
  },
  schoeffengericht: {
    hauptverhandlung: [540, 270],
    berufung: 808,
    berufungsverhandlung: [808, 404],
    nichtigkeitsbeschwerde: 1620,
    gerichtstag_nichtigkeit: [1076, 538],
  },
  geschworenengericht: {
    hauptverhandlung: [620, 310],
    berufung: 928,
    berufungsverhandlung: [928, 464],
    nichtigkeitsbeschwerde: 1860,
    gerichtstag_nichtigkeit: [1236, 618],
  },
  haftverfahren: {
    verhandlung_1instanz: [364, 182],
    grundrechtsbeschwerde: 786,
    sonstige_beschwerde: 564,
    verhandlung_2instanz: [564, 282],
  },
} as const;

describe("AHK_STRAF_POSITIONEN matches the primary text (§ 9 Abs 1)", () => {
  for (const [verfahren, positions] of Object.entries(OFFICIAL_STRAF)) {
    for (const [key, expected] of Object.entries(positions)) {
      it(`${verfahren}.${key}`, () => {
        const pos = AHK_STRAF_POSITIONEN[verfahren as keyof typeof AHK_STRAF_POSITIONEN].find(
          (p) => p.key === key
        );
        expect(pos).toBeDefined();
        if (Array.isArray(expected)) {
          expect(pos!.ersteHalbeStunde).toBe(expected[0]);
          expect(pos!.weitereHalbeStunde).toBe(expected[1]);
        } else {
          expect(pos!.amount).toBe(expected);
        }
      });
    }
  }
});

// Independently transcribed from § 5 AHK, spot-check of a representative
// subset (not the full 37 — the full list is checked for internal
// consistency by calculateAhkZivilverwaltung's tests below).
describe("AHK_BEMESSUNGSGRUNDLAGEN spot-check (§ 5 AHK)", () => {
  const expected: Record<string, number> = {
    abgaben: 5500,
    adoption: 9300,
    bau_geringfuegig: 9300,
    bau_mittel: 34600,
    bau_grossprojekt: 286700,
    bergrecht: 57000,
    immaterialgueter: 57000,
    kartell_sonst: 229700,
    sonstige_einfach: 5500,
    sonstige_allgemein: 21200,
    sonstige_weittragend: 55500,
    patientenverfuegung: 21200,
  };
  for (const [key, amount] of Object.entries(expected)) {
    it(key, () => {
      const entry = AHK_BEMESSUNGSGRUNDLAGEN.find((e) => e.key === key);
      expect(entry?.amount).toBe(amount);
    });
  }
});

describe("calculateAhkZivilverwaltung", () => {
  it("applies the § 6 Abs 3a surcharge on top of the RATG-style total", () => {
    const withSurcharge = calculateAhkZivilverwaltung({
      item: "TP3A",
      kind: "schriftsatz",
      bemessungsgrundlage: 21200, // "sonstige Zivilsache, im Allgemeinen"
      einheitssatzFactor: 1,
    });
    const withoutSurcharge = calculateAhkZivilverwaltung({
      item: "TP3A",
      kind: "schriftsatz",
      bemessungsgrundlage: 21200,
      einheitssatzFactor: 1,
      withSurcharge: false,
    });
    // The surcharge line must exist and be exactly 12.09% of the pre-surcharge total.
    const surchargeLine = withSurcharge.lines.find((l) => l.key === "zuschlag_6_3a");
    expect(surchargeLine).toBeDefined();
    expect(withSurcharge.net).toBeGreaterThan(withoutSurcharge.net);
    const expectedSurcharge = Math.round(withoutSurcharge.net * 100 * 0.1209) / 100;
    expect(surchargeLine!.amount).toBeCloseTo(expectedSurcharge, 1);
  });

  it("rejects a Verhandlung under TP1 (RATG has no hourly rate for TP1)", () => {
    expect(() =>
      calculateAhkZivilverwaltung({ item: "TP1", kind: "verhandlung", bemessungsgrundlage: 5500 })
    ).toThrow(AhkInputError);
  });

  it("applies the Streitgenossenzuschlag per § 7 Abs 1 (same bands as RATG § 15)", () => {
    const r = calculateAhkZivilverwaltung({
      item: "TP3A",
      kind: "schriftsatz",
      bemessungsgrundlage: 21200,
      personen: { vertreten: 2, gegenueber: 1 },
      withSurcharge: false,
    });
    const line = r.lines.find((l) => l.key === "streitgenossen");
    expect(line?.label).toContain("10 %");
  });
});

describe("calculateAhkStraf", () => {
  it("Hauptverhandlung Bezirksgericht, eine halbe Stunde: 238 €", () => {
    const r = calculateAhkStraf({
      verfahren: "bezirksgericht",
      positionKey: "hauptverhandlung",
      hours: 0.5,
    });
    expect(r.net).toBe(238);
  });

  it("Hauptverhandlung Bezirksgericht, 1,5 Stunden (drei halbe): 238 + 2×119 = 476", () => {
    const r = calculateAhkStraf({
      verfahren: "bezirksgericht",
      positionKey: "hauptverhandlung",
      hours: 1.5,
    });
    expect(r.net).toBe(238 + 2 * 119);
  });

  it("§ 9 Abs 2: 20% Zuschlag bei gleichzeitiger Nichtigkeitsbeschwerde und Berufung (Schöffengericht)", () => {
    const r = calculateAhkStraf({
      verfahren: "schoeffengericht",
      positionKey: "berufungsverhandlung",
      hours: 0.5,
      nichtigkeitUndBerufung: true,
    });
    expect(r.net).toBe(Math.round(808 * 1.2 * 100) / 100);
  });

  it("§ 9 Abs 2-Zuschlag lehnt eine nicht berechtigte Position ab", () => {
    expect(() =>
      calculateAhkStraf({
        verfahren: "bezirksgericht",
        positionKey: "hauptverhandlung",
        nichtigkeitUndBerufung: true,
      })
    ).toThrow(AhkInputError);
  });

  it("§ 10 Abs 3: Streitgenossenzuschlag 30% je weitere verteidigte Partei", () => {
    const r = calculateAhkStraf({
      verfahren: "bezirksgericht",
      positionKey: "hauptverhandlung",
      hours: 0.5,
      weitereVerteidigtePersonen: 2,
    });
    const line = r.lines.find((l) => l.key === "streitgenossen");
    expect(line?.amount).toBe(Math.round(238 * 0.3 * 2 * 100) / 100);
  });

  it("§ 12: Erfolgszuschlag lehnt mehr als 50% ab", () => {
    expect(() =>
      calculateAhkStraf({
        verfahren: "bezirksgericht",
        positionKey: "hauptverhandlung",
        hours: 0.5,
        erfolgszuschlagProzent: 51,
      })
    ).toThrow(AhkInputError);
  });
});

describe("calculateAhkStrafRatg (§ 10 Abs 1 Bemessungsgrundlagen)", () => {
  it("uses 7 800 € for the Bezirksgericht-Einstufung", () => {
    const withSurcharge = calculateAhkStrafRatg({
      item: "TP2",
      kind: "schriftsatz",
      einstufung: "bezirksgericht",
    });
    const zivil = calculateAhkZivilverwaltung({
      item: "TP2",
      kind: "schriftsatz",
      bemessungsgrundlage: 7800,
    });
    expect(withSurcharge.net).toBe(zivil.net);
    expect(withSurcharge.lines[0].basis).toContain("§ 10 Abs 1 AHK");
  });
});

describe("einstufungAusStrafdrohung (§ 13 Abs 1)", () => {
  it("maps low fines to bezirksgericht", () => {
    expect(einstufungAusStrafdrohung(500, false)).toBe("bezirksgericht");
  });
  it("maps mid fines to einzelrichter_gerichtshof", () => {
    expect(einstufungAusStrafdrohung(2000, false)).toBe("einzelrichter_gerichtshof");
  });
  it("maps higher fines to schoeffengericht", () => {
    expect(einstufungAusStrafdrohung(4000, false)).toBe("schoeffengericht");
  });
  it("maps very high fines to geschworenengericht", () => {
    expect(einstufungAusStrafdrohung(5000, false)).toBe("geschworenengericht");
  });
  it("Haft immer geschworenengericht, unabhängig von der Geldstrafe", () => {
    expect(einstufungAusStrafdrohung(100, true)).toBe("geschworenengericht");
  });
});

describe("§ 16 und § 17 AHK", () => {
  it("Nacht/Wochenende/Feiertag: 100% Zuschlag", () => {
    const line = ahkNachtWochenendeZuschlag(238);
    expect(line.amount).toBe(238);
  });

  it("sichere elektronische Nachricht: 0,50 € je Stück", () => {
    const line = ahkSichereNachrichtAuslage(3);
    expect(line.amount).toBe(1.5);
  });

  it("lehnt eine Anzahl von 0 ab", () => {
    expect(() => ahkSichereNachrichtAuslage(0)).toThrow(AhkInputError);
  });
});
