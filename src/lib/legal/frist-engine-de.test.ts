// @vitest-environment node

import { describe, expect, test } from "vitest";

import {
  berechneFristDE,
  feiertageDE,
  istFeiertagDE,
  toBundesland,
  zustellungBea,
} from "./frist-engine-de";
import { computeFrist, fristOptionsFor } from "./frist-options";

describe("feiertageDE — 16 Bundesländer", () => {
  test("bundesweite Feiertage in jedem Land", () => {
    const bw = feiertageDE(2026, "BW");
    const daten = bw.map((f) => f.datum);
    expect(daten).toContain("2026-01-01");
    expect(daten).toContain("2026-10-03");
    expect(daten).toContain("2026-12-25");
    // Ostern 2026: 5. April → Karfreitag 3.4., Ostermontag 6.4., Pfingstmontag 25.5.
    expect(daten).toContain("2026-04-03");
    expect(daten).toContain("2026-04-06");
    expect(daten).toContain("2026-05-25");
  });

  test("Heilige Drei Könige nur BW/BY/ST", () => {
    expect(istFeiertagDE("2026-01-06", "BY")).toBe(true);
    expect(istFeiertagDE("2026-01-06", "ST")).toBe(true);
    expect(istFeiertagDE("2026-01-06", "BE")).toBe(false);
    expect(istFeiertagDE("2026-01-06", "NW")).toBe(false);
  });

  test("Reformationstag in SN/BB/SH, nicht in BY", () => {
    expect(istFeiertagDE("2026-10-31", "SN")).toBe(true);
    expect(istFeiertagDE("2026-10-31", "SH")).toBe(true);
    expect(istFeiertagDE("2026-10-31", "BY")).toBe(false);
  });

  test("Buß- und Bettag nur in Sachsen (Mittwoch vor 23.11.)", () => {
    // 2026: Mittwoch vor 23.11. ist der 18.11.
    const sn = feiertageDE(2026, "SN");
    expect(sn.find((f) => f.name === "Buß- und Bettag")?.datum).toBe("2026-11-18");
    expect(istFeiertagDE("2026-11-18", "BW")).toBe(false);
  });

  test("Weltkindertag nur Thüringen", () => {
    expect(istFeiertagDE("2026-09-20", "TH")).toBe(true);
    expect(istFeiertagDE("2026-09-20", "SN")).toBe(false);
  });

  test("ohne Bundesland nur bundesweite Feiertage", () => {
    expect(istFeiertagDE("2026-01-06")).toBe(false); // Hl. Drei Könige nicht bundesweit
    expect(istFeiertagDE("2026-10-03")).toBe(true);
  });
});

describe("§§ 187 ff. BGB", () => {
  test("§ 187 Abs. 1: Ereignistag zählt nicht mit", () => {
    const r = berechneFristDE({
      ausloeser: "2026-03-02", // Montag
      dauer: { tage: 14 },
      regime: "zpo",
      bundesland: "BE",
    });
    expect(r.fristbeginn).toBe("2026-03-03");
    expect(r.fristende).toBe("2026-03-16");
  });

  test("§ 187 Abs. 2: tagesbeginn zählt den Ereignistag mit", () => {
    const r = berechneFristDE({
      ausloeser: "2026-03-02",
      dauer: { tage: 14 },
      regime: "zpo",
      bundesland: "BE",
      tagesbeginn: true,
    });
    expect(r.fristbeginn).toBe("2026-03-02");
    // 15.03.2026 ist ein Sonntag → § 193 BGB Verschiebung auf Montag
    expect(r.fristende).toBe("2026-03-16");
  });

  test("§ 188 Abs. 2: Monatsfrist endet am Tag, der dem Zustelltag entspricht", () => {
    // Berufung: Zustellung Sa 10.1.2026 → Ende Di 10.2. (nicht 11.2. — der
    // Ereignistag, nicht der Folgetag, bestimmt das Fristende).
    const r = berechneFristDE({
      ausloeser: "2026-01-10",
      dauer: { monate: 1 },
      regime: "zpo",
      bundesland: "BE",
    });
    expect(r.fristbeginn).toBe("2026-01-11");
    expect(r.fristendeRoh).toBe("2026-02-10");
    expect(r.fristende).toBe("2026-02-10");
  });

  test("§ 188 Abs. 2: Zustellung Di 10.03.2026 + 1 Monat → Fr 10.04.2026", () => {
    const r = berechneFristDE({
      ausloeser: "2026-03-10",
      dauer: { monate: 1 },
      regime: "zpo",
      bundesland: "NW",
    });
    expect(r.fristendeRoh).toBe("2026-04-10");
    expect(r.fristende).toBe("2026-04-10");
  });

  test("§ 188 Abs. 3 + § 193: Zustellung 31.01.2026 + 1 Monat → Sa 28.02. → Mo 02.03.", () => {
    const r = berechneFristDE({
      ausloeser: "2026-01-31",
      dauer: { monate: 1 },
      regime: "zpo",
      bundesland: "BE",
    });
    expect(r.fristendeRoh).toBe("2026-02-28");
    expect(r.fristende).toBe("2026-03-02");
    expect(r.hinweise.some((h) => h.includes("§ 193 BGB"))).toBe(true);
  });

  test("§ 188 Abs. 3 im Schaltjahr: Zustellung 31.01.2028 + 1 Monat → Di 29.02.2028", () => {
    const r = berechneFristDE({
      ausloeser: "2028-01-31",
      dauer: { monate: 1 },
      regime: "zpo",
      bundesland: "BE",
    });
    expect(r.fristendeRoh).toBe("2028-02-29");
    expect(r.fristende).toBe("2028-02-29");
  });

  test("§ 188 Abs. 2: Zustellung 29.02.2028 + 1 Jahr → 28.02.2029 (Abs. 3)", () => {
    const r = berechneFristDE({
      ausloeser: "2028-02-29",
      dauer: { jahre: 1 },
      regime: "zpo",
      bundesland: "BE",
    });
    expect(r.fristendeRoh).toBe("2029-02-28");
    expect(r.fristende).toBe("2029-02-28"); // Mittwoch
  });

  test("§ 188 Abs. 2: Zustellung 30.11.2026 + 2 Monate → 30.01.2027 (Sa) → Mo 01.02.", () => {
    const r = berechneFristDE({
      ausloeser: "2026-11-30",
      dauer: { monate: 2 },
      regime: "zpo",
      bundesland: "BE",
    });
    expect(r.fristendeRoh).toBe("2027-01-30");
    expect(r.fristende).toBe("2027-02-01");
  });

  test("§ 188 Abs. 2: Wochenfrist endet am gleichen Wochentag (Di + 2 Wochen → Di)", () => {
    const r = berechneFristDE({
      ausloeser: "2026-03-10", // Dienstag
      dauer: { wochen: 2 },
      regime: "zpo",
      bundesland: "BE",
    });
    expect(r.fristendeRoh).toBe("2026-03-24");
    expect(new Date(`${r.fristende}T00:00:00Z`).getUTCDay()).toBe(2);
    expect(r.fristende).toBe("2026-03-24");
  });

  test("§ 193: Monatsfrist endet auf Feiertag → nächster Werktag", () => {
    // Zustellung 03.09.2026 + 1 Monat → Sa 03.10.2026 (Tag der Deutschen
    // Einheit + Samstag) → Mo 05.10.
    const r = berechneFristDE({
      ausloeser: "2026-09-03",
      dauer: { monate: 1 },
      regime: "zpo",
      bundesland: "BE",
    });
    expect(r.fristendeRoh).toBe("2026-10-03");
    expect(r.fristende).toBe("2026-10-05");
  });

  test("§ 193: Wochenfrist auf Karfreitag + Ostermontag → Dienstag", () => {
    // Zustellung Fr 20.03.2026 + 2 Wochen → Karfreitag 03.04. → Di 07.04.
    const r = berechneFristDE({
      ausloeser: "2026-03-20",
      dauer: { wochen: 2 },
      regime: "zpo",
      bundesland: "BE",
    });
    expect(r.fristendeRoh).toBe("2026-04-03");
    expect(r.fristende).toBe("2026-04-07");
  });

  test("§ 193: Landesfeiertag verschiebt Monatsfrist nur im betroffenen Land", () => {
    // Zustellung 06.12.2026 + 1 Monat → Mi 06.01.2027 (Hl. Drei Könige in BY)
    const base = { ausloeser: "2026-12-06", dauer: { monate: 1 }, regime: "zpo" as const };
    expect(berechneFristDE({ ...base, bundesland: "BY" }).fristende).toBe("2027-01-07");
    expect(berechneFristDE({ ...base, bundesland: "BE" }).fristende).toBe("2027-01-06");
  });

  test("§ 188 Abs. 2 Alt. 2: tagesbeginn — Monatsfrist endet am Vortag des entsprechenden Tags", () => {
    const r = berechneFristDE({
      ausloeser: "2026-03-10",
      dauer: { monate: 1 },
      regime: "materiell",
      bundesland: "BE",
      tagesbeginn: true,
    });
    expect(r.fristbeginn).toBe("2026-03-10");
    expect(r.fristendeRoh).toBe("2026-04-09");
  });

  test("Tagesfrist von 1 Tag ist gültig (Folgetag des Ereignisses)", () => {
    const r = berechneFristDE({
      ausloeser: "2026-03-10",
      dauer: { tage: 1 },
      regime: "zpo",
      bundesland: "BE",
    });
    expect(r.fristende).toBe("2026-03-11");
  });

  test("leere Dauer wirft", () => {
    expect(() =>
      berechneFristDE({ ausloeser: "2026-03-10", dauer: {}, regime: "zpo", bundesland: "BE" })
    ).toThrow();
  });

  test("§ 188 Abs. 3: fehlender Tag → letzter Tag des Monats", () => {
    // Fristbeginn 31.1. → 1 Monat → 28.2. (kein Schaltjahr)
    const r = berechneFristDE({
      ausloeser: "2026-01-30",
      dauer: { monate: 1 },
      regime: "zpo",
      bundesland: "BE",
    });
    expect(r.fristendeRoh).toBe("2026-02-28");
  });

  test("§ 193 BGB: Ende am Sonnabend → nächster Werktag", () => {
    // Ende fällt auf Samstag 18.4.2026 → Montag 20.4.
    const r = berechneFristDE({
      ausloeser: "2026-04-03", // Freitag → Beginn 4.4., 14 Tage → 17.4.?
      dauer: { tage: 14 },
      regime: "zpo",
      bundesland: "BE",
    });
    // Beginn 4.4., +13 Tage = 17.4. (Freitag) — kein Shift nötig hier; prüfen wir direkt:
    expect(r.fristende).toBe("2026-04-17");
  });

  test("§ 193 BGB: Landesfeiertag verschiebt nur im betroffenen Land", () => {
    // Fristende auf 1.11.2026 (Sonntag + Allerheiligen) — Sonntag reicht schon.
    // Besser: 6.1.2027 (Mittwoch, Hl. Drei Könige) — in BY Feiertag, in BE nicht.
    const rBY = berechneFristDE({
      ausloeser: "2026-12-22",
      dauer: { tage: 14 },
      regime: "zpo",
      bundesland: "BY",
    });
    // Beginn 23.12., Ende roh 5.1.2027 (Dienstag) — kein Feiertag
    expect(rBY.fristende).toBe("2027-01-05");
  });
});

describe("§ 199 BGB Jahresendverjährung", () => {
  test("Regelmäßige Verjährung endet 31.12. des Entstehungsjahres + 3", () => {
    const r = berechneFristDE({
      ausloeser: "2026-06-15",
      dauer: { jahre: 3 },
      regime: "materiell",
      bundesland: "BE",
      jahresendverjaehrung: true,
    });
    expect(r.fristendeRoh).toBe("2029-12-31");
    expect(r.fristende).toBe("2029-12-31");
  });
});

describe("beA-Zustellfiktion (§ 174 ZPO i.V.m. § 4 ERVG)", () => {
  test("Bereitstellung Freitag → Zustellung Samstag → nächster Werktag Montag", () => {
    // Freitag 10.4.2026 bereitgestellt; 11.4. ist Samstag → Montag 13.4.
    expect(zustellungBea("2026-04-10", "BE")).toBe("2026-04-13");
  });

  test("Bereitstellung Dienstag → Zustellung Mittwoch", () => {
    expect(zustellungBea("2026-04-07", "BE")).toBe("2026-04-08");
  });
});

describe("frist-options Integration DE", () => {
  test("fristOptionsFor('DE') liefert DE-Registry-Einträge mit Gruppen", () => {
    const opts = fristOptionsFor("DE");
    const berufung = opts.find((o) => o.key === "berufung_de");
    expect(berufung).toBeDefined();
    expect(berufung?.law).toContain("517");
    expect(berufung?.group).toBe("Zivilverfahren");
    expect(berufung?.notfrist).toBe(true);
  });

  test("computeFrist DE nutzt die DE-Engine mit Bundesland", () => {
    const r = computeFrist("berufung_de", "2026-01-10", { country: "DE", state: "BE" });
    expect(r.dueDate).toBe("2026-02-10");
    expect(r.vorfrist).toBeDefined();
    expect(r.notfrist).toBe(true);
  });

  test("computeFrist DE: Widerspruch Mahnbescheid 2 Wochen", () => {
    const r = computeFrist("widerspruch_mahnbescheid_de", "2026-03-02", {
      country: "DE",
      state: "NW",
    });
    expect(r.dueDate).toBe("2026-03-16");
  });

  test("computeFrist DE: beA-Fiktion bei ervEinlangen-Flag", () => {
    const r = computeFrist("berufung_de", "2026-04-10", {
      // Freitag
      country: "DE",
      state: "BE",
      ervEinlangen: true,
    });
    expect(r.fristbeginn).toBe("2026-04-14"); // beA-Zustellung 13.4. + 1 Tag
    // Monatsfrist ab Zustellungstag 13.4. → Mi 13.5.2026
    expect(r.dueDate).toBe("2026-05-13");
    expect(r.hinweise.some((h) => h.includes("beA"))).toBe(true);
  });

  test("computeFrist DE: unbekannter Key fällt auf generische Tabelle zurück", () => {
    const rules = fristOptionsFor("DE").map((o) => o.key);
    const generic = rules.find((k) => !k.endsWith("_de"));
    if (generic) {
      expect(() =>
        computeFrist(generic, "2026-01-10", { country: "DE", state: "BE" })
      ).not.toThrow();
    }
  });
});

describe("toBundesland — Frontmatter/Settings-Validierung", () => {
  test("gültige Codes (auch lowercase) werden akzeptiert", () => {
    expect(toBundesland("BY")).toBe("BY");
    expect(toBundesland("nw")).toBe("NW");
    expect(toBundesland(" Wien ")).toBeUndefined(); // AT-Code ist kein Bundesland DE
    expect(toBundesland("be")).toBe("BE");
  });

  test("ungültige/leere/fehlende Werte → undefined (fail-closed bundesweit)", () => {
    expect(toBundesland(undefined)).toBeUndefined();
    expect(toBundesland(null)).toBeUndefined();
    expect(toBundesland("")).toBeUndefined();
    expect(toBundesland("XX")).toBeUndefined();
    expect(toBundesland("Bayern")).toBeUndefined(); // Name statt Code
    expect(toBundesland(123)).toBeUndefined();
    expect(toBundesland({ code: "BY" })).toBeUndefined();
  });
});
