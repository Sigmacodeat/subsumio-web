import { describe, it, expect } from "bun:test";
import {
  addDays,
  berechneFrist,
  berechneFristAuto,
  daysBetween,
  feiertageAT,
  istFeiertag,
  istKarfreitag,
  istWerktag,
  klassifiziereFrist,
  naechsterWerktag,
  osterSonntag,
  parseISODate,
  resolveFristArt,
  toISODate,
  vorigerWerktag,
  zustellungERV,
  zustellungHinterlegung,
  zustellungOhneNachweis,
  FRISTEN_REGISTRY,
  type FristRegime,
} from "../src/core/legal/frist-engine.ts";

// ── Date helpers ────────────────────────────────────────────

describe("ISO date helpers", () => {
  it("parses and formats round-trip", () => {
    expect(toISODate(parseISODate("2026-07-02"))).toBe("2026-07-02");
  });

  it("rejects invalid dates", () => {
    expect(() => parseISODate("2026-02-30")).toThrow();
    expect(() => parseISODate("02.07.2026")).toThrow();
  });

  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("daysBetween is signed", () => {
    expect(daysBetween("2026-01-01", "2026-01-15")).toBe(14);
    expect(daysBetween("2026-01-15", "2026-01-01")).toBe(-14);
  });
});

// ── Holidays ────────────────────────────────────────────────

describe("Austrian holidays", () => {
  it("computes Easter Sunday correctly (known anchors)", () => {
    expect(osterSonntag(2024)).toBe("2024-03-31");
    expect(osterSonntag(2025)).toBe("2025-04-20");
    expect(osterSonntag(2026)).toBe("2026-04-05");
    expect(osterSonntag(2027)).toBe("2027-03-28");
  });

  it("lists all 13 gesetzliche Feiertage", () => {
    expect(feiertageAT(2026)).toHaveLength(13);
  });

  it("flags fixed and movable holidays", () => {
    expect(istFeiertag("2026-01-01")).toBe(true); // Neujahr
    expect(istFeiertag("2026-04-06")).toBe(true); // Ostermontag 2026
    expect(istFeiertag("2026-05-14")).toBe(true); // Christi Himmelfahrt 2026
    expect(istFeiertag("2026-06-04")).toBe(true); // Fronleichnam 2026
    expect(istFeiertag("2026-10-26")).toBe(true); // Nationalfeiertag
    expect(istFeiertag("2026-07-02")).toBe(false);
  });

  it("Karfreitag is not a public holiday but is detected", () => {
    expect(istKarfreitag("2026-04-03")).toBe(true);
    expect(istFeiertag("2026-04-03")).toBe(false);
  });

  it("Werktag excludes weekends and holidays", () => {
    expect(istWerktag("2026-07-02")).toBe(true); // Thursday
    expect(istWerktag("2026-07-04")).toBe(false); // Saturday
    expect(istWerktag("2026-07-05")).toBe(false); // Sunday
    expect(istWerktag("2026-05-01")).toBe(false); // Staatsfeiertag (Friday)
  });

  it("naechster/voriger Werktag skip weekends + holidays", () => {
    // Fri 2026-05-01 is Staatsfeiertag → next Werktag after Thu 2026-04-30 is Mon 2026-05-04
    expect(naechsterWerktag("2026-04-30")).toBe("2026-05-04");
    expect(vorigerWerktag("2026-05-04")).toBe("2026-04-30");
  });
});

// ── Zustellfiktionen ────────────────────────────────────────

describe("Zustellfiktionen", () => {
  it("§ 89a GOG: ERV-Zustellung am folgenden Werktag (Samstag zählt nicht)", () => {
    // Einlangen Freitag 2026-07-03 → zugestellt Montag 2026-07-06
    expect(zustellungERV("2026-07-03")).toBe("2026-07-06");
    // Einlangen Mittwoch → Donnerstag
    expect(zustellungERV("2026-07-01")).toBe("2026-07-02");
    // Einlangen Donnerstag 2026-04-30 (Fr = Staatsfeiertag) → Montag 2026-05-04
    expect(zustellungERV("2026-04-30")).toBe("2026-05-04");
  });

  it("§ 17 Abs 3 ZustG: Hinterlegung — erster Tag der Abholfrist", () => {
    expect(zustellungHinterlegung("2026-03-10")).toBe("2026-03-10");
  });

  it("§ 26 Abs 2 ZustG: dritter Werktag nach Übergabe", () => {
    // Übergabe Montag 2026-07-06 → Di, Mi, Do → 2026-07-09
    expect(zustellungOhneNachweis("2026-07-06")).toBe("2026-07-09");
    // Übergabe Donnerstag 2026-07-02 → Fr, Mo, Di → 2026-07-07
    expect(zustellungOhneNachweis("2026-07-02")).toBe("2026-07-07");
  });
});

// ── Fristberechnung Kern ────────────────────────────────────

describe("berechneFrist — ZPO Grundregeln", () => {
  it("4-Wochen-Frist: Zustellung Mo 2026-01-12 → Fristende Mo 2026-02-09", () => {
    const r = berechneFrist({
      ausloeser: "2026-01-12",
      dauer: { wochen: 4 },
      regime: "zpo",
    });
    expect(r.fristende).toBe("2026-02-09");
    expect(r.kalendertage).toBe(28);
  });

  it("14-Tages-Frist: Tag der Zustellung zählt nicht mit (§ 125 Abs 1 ZPO)", () => {
    const r = berechneFrist({
      ausloeser: "2026-03-02",
      dauer: { tage: 14 },
      regime: "zpo",
    });
    expect(r.fristende).toBe("2026-03-16");
  });

  it("Monatsfrist endet am entsprechenden Tag (§ 125 Abs 2 ZPO)", () => {
    const r = berechneFrist({
      ausloeser: "2026-03-10",
      dauer: { monate: 1 },
      regime: "zpo",
    });
    expect(r.fristende).toBe("2026-04-10");
  });

  it("Monatsfrist: fehlt der Tag im Zielmonat → letzter Tag des Monats", () => {
    const r = berechneFrist({
      ausloeser: "2026-01-31",
      dauer: { monate: 1 },
      regime: "zpo",
    });
    expect(r.fristende).toBe("2026-03-02"); // 28.2.2026 ist Samstag → Mo 2.3.
    expect(r.fristendeRoh).toBe("2026-02-28");
  });

  it("Fristende an Samstag → nächster Werktag (§ 126 Abs 2 ZPO)", () => {
    // Zustellung Sa? nein: 14 Tage ab Fr 2026-06-19 → Fr 2026-07-03? nein:
    // 2026-06-20 + 14 = 2026-07-04 (Samstag) → Montag 2026-07-06
    const r = berechneFrist({
      ausloeser: "2026-06-20",
      dauer: { tage: 14 },
      regime: "zpo",
    });
    expect(r.fristendeRoh).toBe("2026-07-04");
    expect(r.fristende).toBe("2026-07-06");
    expect(r.hinweise.some((h) => h.includes("§ 126 Abs 2 ZPO"))).toBe(true);
  });

  it("Fristende an Feiertag → nächster Werktag", () => {
    // 2026-05-01 (Staatsfeiertag, Freitag): 14 Tage ab 2026-04-17 → 1.5. → Mo 4.5.
    const r = berechneFrist({
      ausloeser: "2026-04-17",
      dauer: { tage: 14 },
      regime: "zpo",
    });
    expect(r.fristendeRoh).toBe("2026-05-01");
    expect(r.fristende).toBe("2026-05-04");
  });

  it("throws on empty Dauer", () => {
    expect(() => berechneFrist({ ausloeser: "2026-01-01", dauer: {}, regime: "zpo" })).toThrow();
  });
});

describe("berechneFrist — AVG-Regime", () => {
  it("Karfreitag zählt als fristhemmender End-Tag (§ 33 Abs 2 AVG)", () => {
    // Karfreitag 2026 = 2026-04-03 (Freitag). 2 Wochen ab Fr 2026-03-20 → 3.4.
    const r = berechneFrist({
      ausloeser: "2026-03-20",
      dauer: { wochen: 2 },
      regime: "avg",
    });
    expect(r.fristendeRoh).toBe("2026-04-03");
    // Sa 4.4., So 5.4., Mo 6.4. = Ostermontag → Di 7.4.
    expect(r.fristende).toBe("2026-04-07");
  });

  it("24.12. zählt als fristhemmender End-Tag (§ 33 Abs 2 AVG)", () => {
    // 2026-12-24 ist Donnerstag. 2 Wochen ab Do 2026-12-10 → 24.12. → Fr 25.12.
    // (Christtag) → Sa 26. → So 27. → Mo 28.12.
    const r = berechneFrist({
      ausloeser: "2026-12-10",
      dauer: { wochen: 2 },
      regime: "avg",
    });
    expect(r.fristendeRoh).toBe("2026-12-24");
    expect(r.fristende).toBe("2026-12-28");
  });

  it("ZPO-Regime verschiebt Karfreitag ebenfalls (§ 1 FrHemmG)", () => {
    // 2 Wochen ab Fr 2026-03-20 → Karfreitag 3.4. → Sa/So → Ostermontag 6.4. → Di 7.4.
    const r = berechneFrist({
      ausloeser: "2026-03-20",
      dauer: { wochen: 2 },
      regime: "zpo",
    });
    expect(r.fristendeRoh).toBe("2026-04-03");
    expect(r.fristende).toBe("2026-04-07");
    expect(r.hinweise.some((h) => h.includes("FrHemmG"))).toBe(true);
  });

  it("StPO-Regime verschiebt Karfreitag (§ 1 FrHemmG)", () => {
    // 2 Wochen ab Fr 2027-03-12 → Karfreitag 2027-03-26 → Ostermontag 29.3. → Di 30.3.
    const r = berechneFrist({
      ausloeser: "2027-03-12",
      dauer: { wochen: 2 },
      regime: "stpo",
    });
    expect(r.fristendeRoh).toBe("2027-03-26");
    expect(r.fristende).toBe("2027-03-30");
  });

  it("ZPO-Regime verschiebt 24.12. NICHT (nur § 33 Abs 2 AVG)", () => {
    const r = berechneFrist({
      ausloeser: "2026-12-10",
      dauer: { wochen: 2 },
      regime: "zpo",
    });
    // 24.12. Do → bleibt (Christtag erst am 25.)
    expect(r.fristende).toBe("2026-12-24");
  });

  it("materiellrechtliche Frist auf Karfreitag bleibt (§§ 902 f. ABGB)", () => {
    const r = berechneFrist({
      ausloeser: "2025-04-03",
      dauer: { jahre: 1 },
      regime: "materiell",
    });
    expect(r.fristende).toBe("2026-04-03");
  });
});

describe("berechneFrist — materiellrechtliche Fristen", () => {
  it("Verjährung: keine End-Tag-Verschiebung (§§ 902 f. ABGB)", () => {
    // 3 Jahre ab 2023-07-05 → 2026-07-05 (Sonntag!) — bleibt Sonntag
    const r = berechneFrist({
      ausloeser: "2023-07-05",
      dauer: { jahre: 3 },
      regime: "materiell",
    });
    expect(r.fristende).toBe("2026-07-05");
    expect(r.hinweise.some((h) => h.includes("Materiellrechtliche"))).toBe(true);
  });
});

// ── § 222 ZPO verhandlungsfreie Zeit ────────────────────────

describe("§ 222 ZPO — verhandlungsfreie Zeit", () => {
  it("Zustellung während Sommer-vhfZ → Berufungsfrist endet 14.9. (Lehrbuchfall)", () => {
    // Zustellung 2026-07-20 (innerhalb 15.7.–17.8.):
    // Rest bis 17.8. = 28 Tage; roh = 20.7.+28 = 17.8.; +28 = 14.9.
    const r = berechneFrist({
      ausloeser: "2026-07-20",
      dauer: { wochen: 4 },
      regime: "zpo",
      gehemmtInVhfz: true,
    });
    expect(r.fristende).toBe("2026-09-14"); // Montag
  });

  it("jede Zustellung innerhalb der Sommer-vhfZ führt zum selben Fristende", () => {
    for (const z of ["2026-07-15", "2026-07-31", "2026-08-17"]) {
      const r = berechneFrist({
        ausloeser: z,
        dauer: { wochen: 4 },
        regime: "zpo",
        gehemmtInVhfz: true,
      });
      expect(r.fristende).toBe("2026-09-14");
    }
  });

  it("vhfZ-Anfang fällt in laufende Frist → Verlängerung um ganze Dauer (34 Tage)", () => {
    // Zustellung 2026-07-01: roh = 29.7.; 15.7. liegt in [2.7., 29.7.]
    // → +34 Tage = 1.9.2026 (Dienstag)
    const r = berechneFrist({
      ausloeser: "2026-07-01",
      dauer: { wochen: 4 },
      regime: "zpo",
      gehemmtInVhfz: true,
    });
    expect(r.fristende).toBe("2026-09-01");
    expect(r.hinweise.some((h) => h.includes("ganze Dauer"))).toBe(true);
  });

  it("Winter-vhfZ (24.12.–6.1.) wird angewendet", () => {
    // Zustellung 2026-12-28 (innerhalb): Rest bis 6.1.2027 = 9 Tage
    // roh = 25.1.2027 + 9 = 3.2.2027 (Mittwoch)
    const r = berechneFrist({
      ausloeser: "2026-12-28",
      dauer: { wochen: 4 },
      regime: "zpo",
      gehemmtInVhfz: true,
    });
    expect(r.fristende).toBe("2027-02-03");
  });

  it("Ferialsache: keine Hemmung", () => {
    const r = berechneFrist({
      ausloeser: "2026-07-20",
      dauer: { wochen: 4 },
      regime: "zpo",
      gehemmtInVhfz: true,
      ferialsache: true,
    });
    expect(r.fristende).toBe("2026-08-17"); // 20.7.+28 = 17.8. (Montag)
    expect(r.hinweise.some((h) => h.includes("Ferialsache"))).toBe(true);
  });

  it("keine Hemmung außerhalb der vhfZ", () => {
    const r = berechneFrist({
      ausloeser: "2026-03-02",
      dauer: { wochen: 4 },
      regime: "zpo",
      gehemmtInVhfz: true,
    });
    expect(r.fristende).toBe("2026-03-30");
  });
});

// ── Registry ────────────────────────────────────────────────

describe("Fristarten-Registry", () => {
  it("has unique keys", () => {
    const keys = FRISTEN_REGISTRY.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves known Fristarten", () => {
    expect(resolveFristArt("berufung")?.rechtsgrundlage).toBe("§ 464 Abs 1 ZPO");
    expect(resolveFristArt("nonexistent")).toBeNull();
  });

  it("berechneFristAuto: Berufung mit Vorfrist", () => {
    const r = berechneFristAuto("berufung", "2026-01-12");
    expect(r.fristende).toBe("2026-02-09"); // Montag
    expect(r.vorfrist).toBe("2026-02-02"); // Montag, 7 Tage davor
    expect(r.art.notfrist).toBe(true);
  });

  it("berechneFristAuto: Vorfrist wird auf Werktag zurückgezogen", () => {
    // Fristende Mo 2026-07-06 (aus dem Samstag-Beispiel oben);
    // 7 Tage davor = Mo 2026-06-29 (Werktag, bleibt)
    const r = berechneFristAuto("rekurs", "2026-06-22");
    // 22.6.+14 = 6.7. (Montag)
    expect(r.fristende).toBe("2026-07-06");
    expect(istWerktag(r.vorfrist)).toBe(true);
  });

  it("berechneFristAuto: unknown key throws with known keys listed", () => {
    expect(() => berechneFristAuto("phantasiefrist", "2026-01-01")).toThrow(/berufung/);
  });

  it("StPO Berufungsanmeldung: 3 Tage", () => {
    // Urteil Mi 2026-07-01 → 3 Tage → Sa 4.7. → Mo 6.7.
    const r = berechneFristAuto("berufungsanmeldung_stpo", "2026-07-01");
    expect(r.fristende).toBe("2026-07-06");
  });

  it("VwGH-Revision: 6 Wochen im AVG-Regime", () => {
    const r = berechneFristAuto("revision_vwgh", "2026-02-02");
    expect(r.fristende).toBe("2026-03-16"); // Mo 2.2. + 42 Tage = Mo 16.3.
  });
});

// ── Fristenbuch-Klassifikation ──────────────────────────────

describe("klassifiziereFrist", () => {
  it("ueberfaellig when past", () => {
    expect(klassifiziereFrist("2026-06-30", "2026-07-02")).toBe("ueberfaellig");
  });

  it("kritisch within 2 Werktage", () => {
    // heute Do 2.7., Fristende Fr 3.7. → 1 Werktag
    expect(klassifiziereFrist("2026-07-03", "2026-07-02")).toBe("kritisch");
    // heute Do 2.7., Fristende Mo 6.7. → Fr + Mo = 2 Werktage
    expect(klassifiziereFrist("2026-07-06", "2026-07-02")).toBe("kritisch");
  });

  it("vorfrist within 7 Kalendertage", () => {
    expect(klassifiziereFrist("2026-07-09", "2026-07-02")).toBe("vorfrist");
  });

  it("ok when far away", () => {
    expect(klassifiziereFrist("2026-08-01", "2026-07-02")).toBe("ok");
  });

  it("same-day is kritisch, not ueberfaellig", () => {
    expect(klassifiziereFrist("2026-07-02", "2026-07-02")).toBe("kritisch");
  });
});

// ── Audit 2026-09-25: Regime je Fristart, 24.12., Schaltjahr, Jahreswechsel ──

describe("§ 35 VfGG iVm § 126 Abs 2 ZPO — VfGH-Beschwerde (FRI-4)", () => {
  it("§ 82 Abs 1 VfGG: 6 Wochen ab Do 2026-11-12 enden am Do 2026-12-24 — der 24.12. verschiebt nach § 126 Abs 2 ZPO nicht", () => {
    const r = berechneFristAuto("beschwerde_vfgh", "2026-11-12");
    expect(r.art.regime).toBe("zpo");
    expect(r.fristende).toBe("2026-12-24");
  });

  it("§ 35 VfGG: keine Hemmung durch die verhandlungsfreie Zeit (§ 222 ZPO gilt nur im Rechtsmittelverfahren)", () => {
    // Zustellung Mo 2026-07-20 (in der Sommer-vhfZ) + 6 Wochen = Mo 2026-08-31
    expect(berechneFristAuto("beschwerde_vfgh", "2026-07-20").fristende).toBe("2026-08-31");
  });
});

describe("§ 108 Abs 3 BAO / § 84 Abs 1 StPO — 24.12. (FRI-5)", () => {
  it("§ 245 Abs 1 iVm § 108 Abs 3 BAO: Bescheidbeschwerde 1 Monat ab 2026-11-24 → 24.12. (Do) → 25./26./27. → Mo 2026-12-28", () => {
    const r = berechneFristAuto("steuer_berufung_at", "2026-11-24");
    expect(r.art.regime).toBe("bao");
    expect(r.art.bezeichnung).toMatch(/Bescheidbeschwerde/);
    expect(r.fristendeRoh).toBe("2026-12-24");
    expect(r.fristende).toBe("2026-12-28");
    expect(r.hinweise.some((h) => h.includes("§ 108 Abs 3 BAO"))).toBe(true);
  });

  it("§ 108 Abs 3 BAO: Karfreitag verschiebt (1 Monat ab 2026-03-03 → Karfreitag 3.4. → Di 2026-04-07)", () => {
    const r = berechneFristAuto("steuer_berufung_at", "2026-03-03");
    expect(r.fristendeRoh).toBe("2026-04-03");
    expect(r.fristende).toBe("2026-04-07");
  });

  it("§ 84 Abs 1 StPO: der 24.12. ist kein fristverlängernder Tag (14 Tage ab 2026-12-10 → Do 2026-12-24)", () => {
    expect(berechneFristAuto("beschwerde_stpo", "2026-12-10").fristende).toBe("2026-12-24");
  });

  it("§ 26 Abs 1 VwGG: Revision gegen ein BFG-Erkenntnis 6 Wochen (nicht 2 Monate) — Mo 2026-03-02 → Mo 2026-04-13", () => {
    const r = berechneFristAuto("steuer_revision_vwgh_at", "2026-03-02");
    expect(r.art.rechtsgrundlage).toBe("§ 26 Abs 1 VwGG");
    expect(r.fristende).toBe("2026-04-13");
  });
});

describe("Regime je Fristart gegen die Rechtsgrundlage (FRI-21)", () => {
  // Snapshot: welche Verfahrensordnung die Fristberechnung (End-Tag-Regeln)
  // bestimmt. Hätte FRI-4/FRI-5 gefunden.
  const EXPECTED: Record<string, FristRegime> = {
    klagebeantwortung: "zpo",
    einspruch_zahlungsbefehl: "zpo",
    berufung: "zpo",
    berufungsbeantwortung: "zpo",
    revision: "zpo",
    rekurs: "zpo",
    revisionsrekurs: "zpo",
    widerspruch_versaeumungsurteil: "zpo",
    wiedereinsetzung: "zpo",
    einspruch_rechtsverletzung_stpo: "stpo",
    beschwerde_stpo: "stpo",
    berufungsanmeldung_stpo: "stpo",
    berufungsausfuehrung_stpo: "stpo",
    beschwerde_vwgvg: "avg",
    revision_vwgh: "avg",
    beschwerde_vfgh: "zpo",
    vorstellung_avg: "avg",
    verjaehrung_kurz: "materiell",
    verjaehrung_lang: "materiell",
    gewaehrleistung_beweglich: "materiell",
    steuer_berufung_at: "bao",
    steuer_revision_vwgh_at: "avg",
    steuer_festsetzungsverjaehrung_at: "materiell",
  };

  it("every Austrian Fristart has the regime of its statute", () => {
    const at = FRISTEN_REGISTRY.filter((f) => !/_(de|ch)$/.test(f.key));
    expect(Object.fromEntries(at.map((f) => [f.key, f.regime]))).toEqual(EXPECTED);
  });

  it("§ 222 Abs 1 ZPO: Hemmung nur für Notfristen im Rechtsmittelverfahren", () => {
    const gehemmt = FRISTEN_REGISTRY.filter((f) => f.gehemmtInVhfz)
      .map((f) => f.key)
      .sort();
    expect(gehemmt).toEqual(
      ["berufung", "berufungsbeantwortung", "rekurs", "revision", "revisionsrekurs"].sort()
    );
    for (const f of FRISTEN_REGISTRY.filter((x) => x.gehemmtInVhfz)) {
      expect(f.regime).toBe("zpo");
      expect(f.notfrist).toBe(true);
    }
  });
});

describe("§ 125 Abs 2 ZPO / § 902 ABGB — Schaltjahr und Monatsende (FRI-21)", () => {
  it("§ 125 Abs 2 ZPO: 1 Monat ab 2028-01-31 endet am 2028-02-29 (Schaltjahr, Dienstag)", () => {
    const r = berechneFrist({ ausloeser: "2028-01-31", dauer: { monate: 1 }, regime: "zpo" });
    expect(r.fristende).toBe("2028-02-29");
  });

  it("§ 125 Abs 2 ZPO: 1 Monat ab 2027-01-31 → 28.2. (So) → § 126 Abs 2 ZPO Mo 2027-03-01", () => {
    const r = berechneFrist({ ausloeser: "2027-01-31", dauer: { monate: 1 }, regime: "zpo" });
    expect(r.fristendeRoh).toBe("2027-02-28");
    expect(r.fristende).toBe("2027-03-01");
  });

  it("§ 902 ABGB: 1 Jahr ab 2028-02-29 endet am 2029-02-28 (materiell, keine Verschiebung)", () => {
    const r = berechneFrist({ ausloeser: "2028-02-29", dauer: { jahre: 1 }, regime: "materiell" });
    expect(r.fristende).toBe("2029-02-28");
  });

  it("§ 1489 ABGB: 3 Jahre ab 2024-02-29 → 2027-02-28 (materiell)", () => {
    expect(berechneFristAuto("verjaehrung_kurz", "2024-02-29").fristende).toBe("2027-02-28");
  });
});

describe("§ 222 Abs 1 und 2 ZPO — Jahreswechsel und Ferialsache (FRI-21)", () => {
  it("§ 521 Abs 1 iVm § 222 Abs 1 ZPO: Rekurs ab 2026-12-20 — vhfZ 24.12.–6.1. fällt in den Lauf (+14) → 17.1. (So) → Mo 2027-01-18", () => {
    const r = berechneFristAuto("rekurs", "2026-12-20");
    expect(r.fristendeRoh).toBe("2027-01-17");
    expect(r.fristende).toBe("2027-01-18");
  });

  it("§ 222 Abs 2 ZPO: Ferialsache — Rekurs ab 2026-12-20 ohne Hemmung → Mo 2027-01-04", () => {
    const r = berechneFristAuto("rekurs", "2026-12-20", { ferialsache: true });
    // 20.12. + 14 = 3.1. (So) → 4.1.
    expect(r.fristende).toBe("2027-01-04");
  });

  it("§ 222 Abs 2 Z 6 ZPO: Rekurs gegen EV-Beschluss, zugestellt Mo 2026-07-20 → Mo 2026-08-03 (ohne Hemmung)", () => {
    expect(berechneFristAuto("rekurs", "2026-07-20", { ferialsache: true }).fristende).toBe(
      "2026-08-03"
    );
    expect(berechneFristAuto("rekurs", "2026-07-20").fristende).toBe("2026-08-31");
  });

  it("§ 464 Abs 1 iVm § 222 Abs 1 ZPO: Berufung ab Beginn in der vhfZ (Sommerzeit) 2026-07-20 → Mo 2026-09-14", () => {
    expect(berechneFristAuto("berufung", "2026-07-20").fristende).toBe("2026-09-14");
  });

  it("§ 464 Abs 1 ZPO: Berufung ab Mo 2026-03-02 → Mo 2026-03-30 (4 Wochen, nicht 1 Monat)", () => {
    expect(berechneFristAuto("berufung", "2026-03-02").fristende).toBe("2026-03-30");
  });
});
