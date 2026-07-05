import { describe, test, expect } from "vitest";
import { triageMessage, triageBatch, type TriageInput, URGENCY_LABELS } from "./triage";

describe("triageMessage", () => {
  test("classifies frist message as critical", () => {
    const input: TriageInput = {
      source: "bea",
      subject: "Rechtsmittelfrist läuft",
      body: "Die Notfrist von zwei Wochen beginnt ab Zustellung des Urteils.",
    };
    const card = triageMessage(input);
    expect(card.urgency).toBe("critical");
    expect(card.actionType).toBe("frist");
    expect(card.confidence).toBe("high");
  });

  test("classifies gerichtstermin as critical", () => {
    const input: TriageInput = {
      source: "email",
      subject: "Ladung zur mündlichen Verhandlung",
      body: "Termin am 15.08.2026 um 09:00 Uhr vor dem Amtsgericht München.",
    };
    const card = triageMessage(input);
    expect(card.urgency).toBe("critical");
    expect(card.actionType).toBe("termin");
  });

  test("classifies mahnung as high", () => {
    const input: TriageInput = {
      source: "email",
      subject: "Mahnung",
      body: "Mahnbescheid über ausstehende Zahlung von 1.500 EUR.",
    };
    const card = triageMessage(input);
    expect(card.urgency).toBe("high");
    expect(card.actionType).toBe("zahlung");
  });

  test("classifies klage as high", () => {
    const input: TriageInput = {
      source: "bea",
      subject: "Klageerwiderung eingegangen",
      body: "Gegenseite hat Klageerwiderung eingereicht.",
    };
    const card = triageMessage(input);
    expect(card.urgency).toBe("high");
    expect(card.actionType).toBe("antwort");
  });

  test("classifies dokumentenanforderung as medium", () => {
    const input: TriageInput = {
      source: "portal",
      subject: "Unterlagen nachreichen",
      body: "Bitte reichen Sie die fehlenden Dokumente ein.",
    };
    const card = triageMessage(input);
    expect(card.urgency).toBe("medium");
    expect(card.actionType).toBe("dokument");
  });

  test("classifies simple question as medium", () => {
    const input: TriageInput = {
      source: "whatsapp",
      subject: "Frage zum Verfahren",
      body: "Können Sie mir bitte mitteilen, wie der aktuelle Stand ist?",
    };
    const card = triageMessage(input);
    expect(card.urgency).toBe("medium");
    expect(card.actionType).toBe("info");
    expect(card.confidence).toBe("medium");
  });

  test("classifies neutral message as low", () => {
    const input: TriageInput = {
      source: "email",
      subject: "Vielen Dank",
      body: "Ich danke Ihnen für die Bearbeitung.",
    };
    const card = triageMessage(input);
    expect(card.urgency).toBe("low");
    expect(card.actionType).toBe("info");
  });

  test("infers legal area for family law", () => {
    const input: TriageInput = {
      source: "portal",
      subject: "Sorgerecht",
      body: "Es geht um das Sorgerecht für mein Kind nach der Scheidung.",
    };
    const card = triageMessage(input);
    expect(card.legalArea).toBe("familienrecht");
  });

  test("infers legal area for tenancy law", () => {
    const input: TriageInput = {
      source: "email",
      subject: "Kündigung Mietvertrag",
      body: "Mein Vermieter hat die Kündigung ausgesprochen.",
    };
    const card = triageMessage(input);
    expect(card.legalArea).toBe("mietrecht");
  });

  test("infers legal area for criminal law", () => {
    const input: TriageInput = {
      source: "bea",
      subject: "Strafanzeige",
      body: "Gegen meinen Mandanten wurde Strafanzeige erstattet.",
    };
    const card = triageMessage(input);
    expect(card.legalArea).toBe("strafrecht");
  });

  test("extracts deadline from text (German format)", () => {
    const input: TriageInput = {
      source: "bea",
      subject: "Fristablauf",
      body: "Die Frist läuft bis 15.08.2026.",
    };
    const card = triageMessage(input);
    expect(card.deadline).toBe("15.08.2026");
    expect(card.urgency).toBe("critical");
  });

  test("extracts deadline from text (ISO format)", () => {
    const input: TriageInput = {
      source: "email",
      subject: "Frist",
      body: "Die Frist endet am 2026-08-15.",
    };
    const card = triageMessage(input);
    expect(card.deadline).toBe("2026-08-15");
  });

  test("boosts urgency when deadline is within 3 days", () => {
    const future = new Date(Date.now() + 2 * 86400000);
    const dateStr = future.toISOString().slice(0, 10);
    const input: TriageInput = {
      source: "bea",
      subject: "Frist",
      body: `Die Frist endet am ${dateStr}.`,
    };
    const card = triageMessage(input);
    expect(card.urgency).toBe("critical");
    expect(card.confidence).toBe("high");
  });

  test("boosts urgency when deadline is within 7 days", () => {
    const future = new Date(Date.now() + 5 * 86400000);
    const dateStr = future.toISOString().slice(0, 10);
    const input: TriageInput = {
      source: "email",
      subject: "Erinnerung",
      body: `Bitte beachten Sie die Frist bis ${dateStr}.`,
    };
    const card = triageMessage(input);
    expect(["high", "critical"]).toContain(card.urgency);
  });

  test("detects conflict of interest", () => {
    const input: TriageInput = {
      source: "portal",
      subject: "Interessenkonflikt",
      body: "Es könnte ein Konflikt mit der Gegenpartei bestehen.",
    };
    const card = triageMessage(input);
    expect(card.urgency).toBe("high");
    expect(card.actionType).toBe("konflikt");
  });

  test("preserves rawSlug in card", () => {
    const input: TriageInput = {
      source: "bea",
      subject: "Test",
      body: "Test body",
      rawSlug: "legal/intake/2026-01-01/test-123",
    };
    const card = triageMessage(input);
    expect(card.rawSlug).toBe("legal/intake/2026-01-01/test-123");
  });

  test("generates unique id per card", () => {
    const input: TriageInput = {
      source: "email",
      subject: "Test",
      body: "Test",
    };
    const card1 = triageMessage(input);
    const card2 = triageMessage(input);
    expect(card1.id).not.toBe(card2.id);
  });
});

describe("triageBatch", () => {
  test("processes multiple messages", () => {
    const inputs: TriageInput[] = [
      { source: "bea", subject: "Frist", body: "Notfrist läuft" },
      { source: "email", subject: "Danke", body: "Vielen Dank" },
      { source: "portal", subject: "Dokumente", body: "Bitte Unterlagen vorlegen" },
    ];
    const cards = triageBatch(inputs);
    expect(cards).toHaveLength(3);
    expect(cards[0].urgency).toBe("critical");
    expect(cards[1].urgency).toBe("low");
    expect(cards[2].urgency).toBe("medium");
  });

  test("empty array returns empty", () => {
    expect(triageBatch([])).toEqual([]);
  });

  test("handles mixed sources", () => {
    const inputs: TriageInput[] = [
      { source: "whatsapp", subject: "Hallo", body: "Haben Sie die Unterlagen?" },
      { source: "bea", subject: "Zustellung", body: "Postzustellungsurkunde eingegangen" },
      { source: "scan", subject: "Vertrag", body: "Eingescannter Vertrag" },
    ];
    const cards = triageBatch(inputs);
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.id)).toBe(true);
  });
});

describe("URGENCY_LABELS", () => {
  test("has labels for all urgency levels", () => {
    expect(URGENCY_LABELS.critical).toBeDefined();
    expect(URGENCY_LABELS.high).toBeDefined();
    expect(URGENCY_LABELS.medium).toBeDefined();
    expect(URGENCY_LABELS.low).toBeDefined();
  });

  test("has German and English labels", () => {
    expect(URGENCY_LABELS.critical.de).toBe("Kritisch");
    expect(URGENCY_LABELS.critical.en).toBe("Critical");
    expect(URGENCY_LABELS.high.de).toBe("Hoch");
    expect(URGENCY_LABELS.high.en).toBe("High");
  });

  test("has color classes", () => {
    expect(URGENCY_LABELS.critical.color).toContain("red");
    expect(URGENCY_LABELS.high.color).toContain("orange");
    expect(URGENCY_LABELS.medium.color).toContain("amber");
    expect(URGENCY_LABELS.low.color).toContain("slate");
  });
});
