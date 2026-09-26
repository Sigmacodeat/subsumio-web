/**
 * Fristszenarien aus Gerichts- und Behördenschreiben (AT): Texterkennung +
 * Zustellung + Frist-Engine müssen dasselbe Datum liefern wie die direkte
 * Engine-Rechnung. Jedes Ergebnis bleibt Vorschlag (ein Mensch bestätigt).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  enrichDetectedDeadline,
  erkenneFerialsache,
  extractZustellung,
  recognizeDeadlines,
  type DetectedDeadline,
} from "./ai-deadline-detect";

// Fixed "today" (a Wednesday outside any vhfZ): nothing may depend on the
// real clock, and no weekend/holiday may shift a result by accident.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-11T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

function fristen(text: string, opts: Parameters<typeof recognizeDeadlines>[1] = {}) {
  return recognizeDeadlines(text, opts).filter((d) => d.berechnung || d.rueckfrage);
}

function einzige(text: string, opts: Parameters<typeof recognizeDeadlines>[1] = {}) {
  const list = fristen(text, opts);
  expect(list, JSON.stringify(list, null, 2)).toHaveLength(1);
  return list[0]!;
}

describe("Fristszenarien AT (Texterkennung → Frist-Engine)", () => {
  it("S1a: Urteil zugestellt Karfreitag 3.4.2026, „Berufungsfrist beträgt vier Wochen“ → 04.05.2026", () => {
    const d = einzige(
      "URTEIL\nIM NAMEN DER REPUBLIK\nDas Bezirksgericht Innere Stadt Wien hat … zu Recht erkannt.\n" +
        "Zugestellt am 03.04.2026.\nRechtsmittelbelehrung: Die Berufungsfrist beträgt vier Wochen."
    );
    expect(d.berechnung?.fristArt).toBe("berufung");
    expect(d.date).toBe("2026-05-04");
    expect(d.berechnung?.rechtsgrundlage).toBe("§ 464 Abs 1 ZPO");
  });

  it("S1b: „binnen vier Wochen … Berufung erhoben werden“ → Berufung, 04.05.2026 (Staatsfeiertag verschoben)", () => {
    const d = einzige(
      "Urteil des Bezirksgerichts, zugestellt am 03.04.2026.\n" +
        "Gegen dieses Urteil kann binnen vier Wochen ab Zustellung die Berufung erhoben werden."
    );
    expect(d.berechnung?.fristArt).toBe("berufung");
    expect(d.date).toBe("2026-05-04");
    expect(d.description).toContain("Berufungsfrist");
  });

  it("S2: Verbesserungsauftrag 14 Tage, zugestellt Mo 12.10.2026 → 27.10.2026 (Nationalfeiertag)", () => {
    const d = einzige(
      "Beschluss: Der Klägerin wird aufgetragen, die Klage binnen 14 Tagen zu verbessern " +
        "(Verbesserungsauftrag). Zugestellt am 12.10.2026."
    );
    expect(d.berechnung?.fristArt).toBeUndefined();
    expect(d.date).toBe("2026-10-27");
    expect(d.description).toContain("Verbesserungsfrist");
    expect(d.berechnung?.hinweise.join(" ")).toContain("§ 126 Abs 2 ZPO");
  });

  it("S3: Bescheid MA 35, Beschwerde „innerhalb von vier Wochen“, zugestellt 26.11.2026 → 28.12.2026 (24.12. § 33 AVG)", () => {
    const d = einzige(
      "Magistrat der Stadt Wien, MA 35\nBESCHEID\n…\nRechtsmittelbelehrung: Gegen diesen Bescheid kann " +
        "innerhalb von vier Wochen nach seiner Zustellung Beschwerde an das Verwaltungsgericht Wien " +
        "erhoben werden. Zugestellt am 26.11.2026."
    );
    expect(d.berechnung?.fristArt).toBe("beschwerde_vwgvg");
    expect(d.date).toBe("2026-12-28");
  });

  it("S4a: Auftrag zur Klagebeantwortung „binnen vier Wochen“, zugestellt 20.7.2026 → 17.08.2026 (nicht gehemmt)", () => {
    const d = einzige(
      "Der beklagten Partei wird aufgetragen, die Klage binnen vier Wochen schriftlich zu beantworten. " +
        "Zugestellt am 20.07.2026."
    );
    expect(d.berechnung?.fristArt).toBe("klagebeantwortung");
    expect(d.date).toBe("2026-08-17");
    expect(d.berechnung?.fristendeOhneHemmung).toBeUndefined();
  });

  it("S4b: „Klagebeantwortungsfrist beträgt vier Wochen“, zugestellt 20.7.2026 → 17.08.2026", () => {
    const d = einzige(
      "Auftrag: Die Klagebeantwortungsfrist beträgt vier Wochen. Zugestellt am 20.07.2026."
    );
    expect(d.berechnung?.fristArt).toBe("klagebeantwortung");
    expect(d.date).toBe("2026-08-17");
  });

  it("S5: Zahlungsbefehl „binnen vier Wochen Einspruch“, zugestellt Fr 4.12.2026 → 04.01.2027", () => {
    const d = einzige(
      "ZAHLUNGSBEFEHL\nGegen diesen Zahlungsbefehl kann binnen vier Wochen Einspruch erhoben werden. " +
        "Zugestellt am 04.12.2026."
    );
    expect(d.berechnung?.fristArt).toBe("einspruch_zahlungsbefehl");
    expect(d.date).toBe("2027-01-04");
  });

  it("S6: Urteil zugestellt 20.7.2026 (in der Sommer-vhfZ), Berufungsfrist → 14.09.2026, frühere Ferialsachen-Frist genannt", () => {
    const d = einzige("Urteil zugestellt am 20.07.2026. Die Berufungsfrist beträgt vier Wochen.");
    expect(d.date).toBe("2026-09-14");
    expect(d.berechnung?.fristendeOhneHemmung).toBe("2026-08-17");
    expect(d.berechnung?.hinweise.join(" ")).toContain("Ferialsache prüfen");
    // Depends on an unconfirmed fact → never "high".
    expect(d.confidence).toBe("medium");
  });

  it("S7: Urteil zugestellt 10.12.2026, Weihnachts-vhfZ im Lauf → 21.01.2027", () => {
    const d = einzige("Urteil zugestellt am 10.12.2026. Berufungsfrist vier Wochen.");
    expect(d.date).toBe("2027-01-21");
  });

  it("S8: Beschluss zugestellt 17.12.2026, Rekursfrist 14 Tage → 14.01.2027", () => {
    const d = einzige("Beschluss zugestellt am 17.12.2026. Die Rekursfrist beträgt 14 Tage.");
    expect(d.berechnung?.fristArt).toBe("rekurs");
    expect(d.date).toBe("2027-01-14");
  });

  it("S9: Urteil „am 02.10.2026 im ERV eingelangt“ → Zustellung Mo 5.10. (§ 89d Abs 2 GOG) → 02.11.2026", () => {
    const d = einzige(
      "Das Urteil ist am 02.10.2026 im ERV eingelangt. Die Berufungsfrist beträgt vier Wochen."
    );
    expect(d.berechnung?.eingangsdatum).toBe("2026-10-02");
    expect(d.berechnung?.zustellungsdatum).toBe("2026-10-05");
    expect(d.date).toBe("2026-11-02");
    expect(d.berechnung?.hinweise.join(" ")).toContain("§ 89d Abs 2 GOG");
  });

  it("S10: EV (Ferialsache) zugestellt 20.7.2026, Rekursfrist 14 Tage → 03.08.2026, NICHT 31.08.", () => {
    const d = einzige(
      "Beschluss in der Rechtssache wegen Erlassung einer einstweiligen Verfügung. " +
        "Die Rekursfrist beträgt 14 Tage. Zugestellt am 20.07.2026."
    );
    expect(d.date).toBe("2026-08-03");
    expect(d.berechnung?.fristendeMitHemmung).toBe("2026-08-31");
    expect(d.berechnung?.ferialsache).toBe("ja");
  });

  it("S11: Urteil ohne Zustelldatum → kein Datum, Rückfrage „Zustelldatum fehlt“, nie high", () => {
    const d = einzige("Urteil. Die Berufungsfrist beträgt vier Wochen.");
    expect(d.date).toBeUndefined();
    expect(d.rueckfrage).toContain("Zustelldatum fehlt");
    expect(d.confidence).not.toBe("high");
  });
});

describe("Ferialsache (§ 222 Abs 2 ZPO)", () => {
  it("im Zweifel (Bestandsache) keine Hemmung — frühere Frist, spätere als Hinweis", () => {
    const d = einzige(
      "Urteil in der Bestandsache wegen Räumung. Zugestellt am 20.07.2026. Berufungsfrist vier Wochen."
    );
    expect(d.date).toBe("2026-08-17");
    expect(d.berechnung?.fristendeMitHemmung).toBe("2026-09-14");
    expect(d.berechnung?.hinweise.join(" ")).toContain("Ferialsache prüfen");
    expect(d.confidence).toBe("medium");
  });

  it("vom Anwalt verneinte Ferialsache → Hemmung ohne Warnhinweis", () => {
    const d = einzige("Urteil zugestellt am 20.07.2026. Berufungsfrist vier Wochen.", {
      ferialsache: false,
    });
    expect(d.date).toBe("2026-09-14");
    expect(d.confidence).toBe("high");
  });

  it("erkennt Katalogsachen und Zweifelsfälle", () => {
    expect(erkenneFerialsache("Antrag auf einstweilige Verfügung").status).toBe("ja");
    expect(erkenneFerialsache("Besitzstörungsklage").status).toBe("ja");
    expect(erkenneFerialsache("Arbeitsrechtssache gegen …").status).toBe("zweifel");
    expect(erkenneFerialsache("Urteil über Kaufpreisforderung").status).toBe("unbekannt");
  });
});

describe("Zustellung und Rechtsraum", () => {
  it("erkennt ERV-Einlangen in mehreren Schreibweisen", () => {
    expect(extractZustellung("im ERV eingelangt am 02.10.2026")).toEqual({
      datum: "2026-10-02",
      art: "erv",
    });
    expect(extractZustellung("Einlangen im elektronischen Rechtsverkehr: 2. Oktober 2026")).toEqual(
      { datum: "2026-10-02", art: "erv" }
    );
    expect(extractZustellung("zugestellt am 3. Jänner 2027")).toEqual({
      datum: "2027-01-03",
      art: "standard",
    });
    expect(extractZustellung("zugestellt am 31.02.2026")).toBeNull();
  });

  it("DE-Akte rechnet mit der DE-Engine (Berufung 1 Monat, § 517 ZPO)", () => {
    const d = einzige("Urteil zugestellt am 20.07.2026. Die Berufungsfrist beträgt einen Monat.", {
      rechtsraum: "DE",
    });
    expect(d.berechnung?.rechtsraum).toBe("DE");
    expect(d.berechnung?.rechtsgrundlage).toBe("§ 517 ZPO");
    expect(d.date).toBe("2026-08-20");
  });

  it("CH-Akte: keine automatische Berechnung, Rückfrage", () => {
    const d = einzige("Urteil zugestellt am 20.07.2026. Berufungsfrist vier Wochen.", {
      rechtsraum: "CH",
    });
    expect(d.date).toBeUndefined();
    expect(d.rueckfrage).toContain("Schweizer");
  });

  it("ein genanntes Fristende wird nie als Fristbeginn verwendet", () => {
    const dd: DetectedDeadline = {
      type: "legal_deadline",
      description: "Berufungsfrist",
      date: "2026-05-04",
      confidence: "high",
      sourceSnippet: "Berufung bis 04.05.2026",
      matchedRule: "llm_fallback",
      suggestedTemplate: "berufung",
    };
    const e = enrichDetectedDeadline(dd, "Berufung bis 04.05.2026");
    expect(e.date).toBe("2026-05-04");
    expect(e.berechnung).toBeUndefined();
    expect(e.confidence).toBe("medium");
    expect(e.rueckfrage).toContain("Zustelldatum fehlt");
  });
});

describe("Dokumenttyp und Stichtage der Analyse", () => {
  it("Urteil ohne Fristwort: Berufungsfrist aus Dokumenttyp + Zustelldatum aus den Stichtagen", () => {
    const d = einzige("Das Klagebegehren wird abgewiesen.", {
      documentType: "Urteil",
      keyDates: [{ date: "2026-04-03", what: "Zustellung des Urteils" }],
    });
    expect(d.berechnung?.fristArt).toBe("berufung");
    expect(d.date).toBe("2026-05-04");
    expect(d.confidence).toBe("medium");
  });

  it("Zahlungsbefehl ohne Zustelldatum → Rückfrage statt Schweigen", () => {
    const d = einzige("Die beklagte Partei ist schuldig, … zu zahlen.", {
      documentType: "Zahlungsbefehl",
    });
    expect(d.berechnung).toBeUndefined();
    expect(d.rueckfrage).toContain("Zustelldatum fehlt");
  });

  it("eigene Klage ohne Zustellung erzeugt keinen Vorschlag", () => {
    expect(fristen("Klage wegen EUR 12.000", { documentType: "Klage" })).toHaveLength(0);
  });
});
