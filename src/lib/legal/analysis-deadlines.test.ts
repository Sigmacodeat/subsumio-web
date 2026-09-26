import { describe, expect, it } from "vitest";
import { engineDeadlineSuggestions, withAnalysisDeadlines } from "./analysis-deadlines";

// "Today" pinned — the result must not depend on the real clock.
const HEUTE = "2026-04-10";

const URTEIL =
  "URTEIL\nIM NAMEN DER REPUBLIK\nDas Klagebegehren wird abgewiesen.\n" +
  "Zugestellt am 03.04.2026.\nRechtsmittelbelehrung: Die Berufungsfrist beträgt vier Wochen.";

describe("W1-1 Upload → Analyse: Fristen aus Zustelldatum + Fristart über die Engine", () => {
  it("Urteil zugestellt 03.04.2026 (vergangen) → Berufungsfrist 04.05.2026 als Vorschlag", () => {
    // The model reported only the (grounded) service date; the end date never
    // stands in the document and was dropped by the grounding gate.
    const parsed = {
      document_type: "Urteil",
      key_dates: [{ date: "2026-04-03", what: "Zustellung des Urteils" }],
    };
    const out = withAnalysisDeadlines(parsed, URTEIL, { heute: HEUTE });
    const deadlines = out.deadlines as Array<Record<string, unknown>>;
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]).toMatchObject({
      date: "2026-05-04",
      urgency: "high",
      zustellungsdatum: "2026-04-03",
      frist_art: "berufung",
      rechtsgrundlage: "§ 464 Abs 1 ZPO",
      notfrist: true,
      engine_computed: true,
    });
  });

  it("Zustelldatum nur in den Stichtagen der Analyse → trotzdem berechnet", () => {
    const text = "URTEIL\nDas Klagebegehren wird abgewiesen. Berufungsfrist vier Wochen.";
    const [d] = engineDeadlineSuggestions(
      { document_type: "Urteil", key_dates: [{ date: "03.04.2026", what: "zugestellt" }] },
      text,
      { heute: HEUTE }
    );
    expect(d).toMatchObject({ date: "2026-05-04", zustellungsdatum: "2026-04-03" });
  });

  it("fehlt das Zustelldatum → Vorschlag „Zustelldatum fehlt“ statt Schweigen", () => {
    const [d] = engineDeadlineSuggestions(
      { document_type: "Urteil" },
      "URTEIL\nDie Berufungsfrist beträgt vier Wochen.",
      { heute: HEUTE }
    );
    expect(d!.date).toBe("");
    expect(d!.label).toContain("Zustelldatum fehlt");
    expect(d!.rueckfrage).toContain("Zustelldatum fehlt");
    expect(d!.urgency).toBe("normal");
  });

  it("bereits verstrichene Frist bleibt sichtbar, aber ohne automatischen Fristenbuch-Eintrag", () => {
    const [d] = engineDeadlineSuggestions({}, URTEIL, { heute: "2026-06-01" });
    expect(d).toMatchObject({ date: "2026-05-04", urgency: "normal" });
    expect(String(d!.label)).toContain("verstrichen");
  });

  it("Termine mit wörtlichem Datum bleiben zusätzlich erhalten, ohne Dublette", () => {
    const out = withAnalysisDeadlines(
      {
        key_dates: [
          { date: "2026-04-03", what: "Zustellung" },
          { date: "2026-05-04", what: "Fristende Berufung" },
          { date: "2026-06-12", what: "Tagsatzung" },
        ],
      },
      URTEIL,
      { heute: HEUTE }
    );
    const dates = (out.deadlines as Array<{ date: string }>).map((d) => d.date);
    expect(dates).toEqual(["2026-05-04", "2026-06-12"]);
  });

  it("DE-Akte rechnet mit deutschem Recht", () => {
    const [d] = engineDeadlineSuggestions({}, URTEIL, { heute: HEUTE, rechtsraum: "DE" });
    expect(d).toMatchObject({ rechtsraum: "DE", rechtsgrundlage: "§ 517 ZPO", date: "2026-05-04" });
  });
});
