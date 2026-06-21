/**
 * Tests for AI-Powered Automatic Time Extraction
 * ================================================
 *
 * Verifies:
 *   1. Substantive conversations → time entry generated
 *   2. Empty/trivial conversations → skipped
 *   3. Activity type detection accuracy
 *   4. Minute estimation heuristics
 *   5. Confidence scoring
 *   6. Description generation
 *   7. Batch extraction
 *   8. Conversion to TimeEntry
 */

import { test, expect, describe } from "vitest";
import {
  extractTimeFromConversation,
  extractTimeFromMultipleConversations,
  extractedToTimeEntry,
  type ConversationMessage,
  type ConversationContext,
} from "@/lib/ai-time-extract";

function makeMessage(
  role: ConversationMessage["role"],
  text: string,
  overrides?: Partial<ConversationMessage>
): ConversationMessage {
  return {
    role,
    text,
    timestamp: new Date().toISOString(),
    word_count: text.split(/\s+/).length,
    ...overrides,
  };
}

function makeContext(
  messages: ConversationMessage[],
  overrides?: Partial<ConversationContext>
): ConversationContext {
  return {
    messages,
    case_slug: "test-case-001",
    case_title: "Test Case",
    lawyer_name: "Test Lawyer",
    default_rate: 220,
    ...overrides,
  };
}

describe("extractTimeFromConversation — basic behavior", () => {
  test("substantive lawyer-client conversation generates time entry", () => {
    const ctx = makeContext([
      makeMessage(
        "client",
        "Herr Rechtsanwalt, ich habe eine Frage zu meinem Vertragsentwurf. Der Arbeitgeber möchte eine Wettbewerbsklausel einfügen und ich bin mir nicht sicher ob das rechtlich zulässig ist."
      ),
      makeMessage(
        "lawyer",
        "Danke für Ihre Nachricht. Die Wettbewerbsklausel ist grundsätzlich zulässig, jedoch müssen die Voraussetzungen nach § 74 HGB gewahrt bleiben. Insbesondere muss die Klausel räumlich und zeitlich angemessen begrenzt sein und Sie müssen eine angemessene Gegenleistung erhalten. Ich werde den Vertrag für Sie prüfen und eine Stellungnahme mit Änderungsvorschlägen erstellen."
      ),
    ]);

    const result = extractTimeFromConversation(ctx);

    expect(result.entries.length).toBe(1);
    expect(result.total_minutes).toBeGreaterThan(0);
    expect(result.billable_minutes).toBeGreaterThan(0);
    expect(result.skipped_reason).toBeUndefined();
  });

  test("empty conversation is skipped", () => {
    const ctx = makeContext([]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries.length).toBe(0);
    expect(result.skipped_reason).toContain("Empty");
  });

  test("only system messages → skipped", () => {
    const ctx = makeContext([
      makeMessage("system", "Message received"),
      makeMessage("system", "Processing"),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries.length).toBe(0);
    expect(result.skipped_reason).toContain("system");
  });

  test("only short messages → skipped", () => {
    const ctx = makeContext([makeMessage("client", "Ja"), makeMessage("lawyer", "Ok")]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries.length).toBe(0);
    expect(result.skipped_reason).toContain("substantive");
  });

  test("only client messages → skipped (no lawyer work)", () => {
    const ctx = makeContext([
      makeMessage(
        "client",
        "Ich habe eine dringende Frage zu meinem Fall und brauche dringend eine Antwort. Können Sie mir bitte helfen?"
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries.length).toBe(0);
    expect(result.skipped_reason).toContain("No lawyer");
  });
});

describe("extractTimeFromConversation — activity type detection", () => {
  test("drafting keywords → drafting activity", () => {
    const ctx = makeContext([
      makeMessage("client", "Können Sie einen Klageschrift Entwurf für mich erstellen?"),
      makeMessage(
        "lawyer",
        "Ich werde einen Entwurf für die Klageschrift erstellen und diesen nach § 253 ZPO strukturieren. Der Sachverhalt wird rechtlich subsumiert und der Antrag wird präzise formuliert."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].activity_type).toBe("drafting");
  });

  test("research keywords → research activity", () => {
    const ctx = makeContext([
      makeMessage("client", "Gibt es aktuelle Rechtsprechung zum Lieferverzug?"),
      makeMessage(
        "lawyer",
        "Ich werde eine Recherche durchführen und die aktuelle Rechtsprechung sowie die einschlägigen Normen im BGB prüfen. Das Urteil des BGH vom 15.03.2023 ist hier relevant."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].activity_type).toBe("research");
  });

  test("review keywords → review activity", () => {
    const ctx = makeContext([
      makeMessage("client", "Bitte prüfen Sie diesen Vertrag für mich."),
      makeMessage(
        "lawyer",
        "Ich werde den Vertrag einer rechtlichen Prüfung unterziehen und eine Redline-Version mit Änderungsvorschlägen erstellen. Die Klauseln müssen genau durchgesehen werden."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].activity_type).toBe("review");
  });

  test("phone call keywords → phone_call activity", () => {
    const ctx = makeContext([
      makeMessage("client", "Haben Sie kurz Zeit für einen Telefonat?"),
      makeMessage(
        "lawyer",
        "Ja, ich rufe Sie gleich an. Das Telefonat sollte nicht lange dauern, ich werde die wichtigsten Punkte notieren."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].activity_type).toBe("phone_call");
  });

  test("deadline keywords → deadline_check activity", () => {
    const ctx = makeContext([
      makeMessage("client", "Bis wann ist die Frist für die Berufung?"),
      makeMessage(
        "lawyer",
        "Die Frist endet am 15. März 2026. Ich werde die Fristberechnung noch einmal kontrollieren und sicherstellen, dass die Frist gewahrt wird."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].activity_type).toBe("deadline_check");
  });

  test("intake keywords → intake activity", () => {
    const ctx = makeContext([
      makeMessage("client", "Ich bin ein neuer Mandant und hätte eine Erstberatung gewünscht."),
      makeMessage(
        "lawyer",
        "Willkommen! Gerne führe ich die Mandatsaufnahme durch. Bitte erzählen Sie mir von Ihrem Fall, damit ich die Erstberatung durchführen kann."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].activity_type).toBe("intake");
  });
});

describe("extractTimeFromConversation — minute estimation", () => {
  test("short conversation → fewer minutes", () => {
    const ctx = makeContext([
      makeMessage("client", "Kurze Frage zum Vertragsentwurf."),
      makeMessage("lawyer", "Die Klausel ist zulässig, keine Änderung nötig."),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.total_minutes).toBeGreaterThanOrEqual(5);
    expect(result.total_minutes).toBeLessThan(30);
  });

  test("long substantive conversation → more minutes", () => {
    const longLawyerText =
      "Ich habe den gesamten Vertrag einer eingehenden Prüfung unterzogen. Zunächst zu Klausel 1: Diese ist nach § 307 BGB unwirksam, da sie den Vertragspartner unangemessen benachteiligt. Klausel 2 bedarf der Anpassung, da die Haftungsbeschränkung nicht den Anforderungen des § 309 Nr. 7 BGB entspricht. Klausel 3 ist zulässig, jedoch empfehle ich eine klarere Formulierung. Insgesamt sind sieben Klauseln zu beanstanden. Ich werde einen überarbeiteten Entwurf mit Redline-Version erstellen und Ihnen diese zur Freigabe übermitteln. Die rechtliche Prüfung umfasst auch die aktuellen Gerichtsurteile zu AGB-Klauseln.";
    const ctx = makeContext([
      makeMessage(
        "client",
        "Bitte prüfen Sie diesen umfangreichen Vertrag. Er hat 15 Seiten und viele Klauseln die ich nicht verstehe."
      ),
      makeMessage("lawyer", longLawyerText),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.total_minutes).toBeGreaterThanOrEqual(30);
  });

  test("voice messages add time", () => {
    const ctx = makeContext([
      makeMessage("client", "Hören Sie meine Sprachnachricht", { media_type: "voice" }),
      makeMessage(
        "lawyer",
        "Ich habe Ihre Sprachnachricht transkribiert und geprüft. Die rechtliche Situation ist wie folgt: Sie haben Anspruch auf Schadensersatz nach § 280 BGB.",
        { media_type: "voice" }
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    // Voice messages add 10 min each
    expect(result.total_minutes).toBeGreaterThanOrEqual(25);
  });

  test("document messages add time", () => {
    const ctx = makeContext([
      makeMessage("client", "Hier ist der Vertrag als PDF", { media_type: "document" }),
      makeMessage(
        "lawyer",
        "Ich habe das Dokument analysiert und folgende Punkte festgestellt: Die Klausel zur Gewährleistung ist unwirksam, die Vertragsstrafe ist überhöht und die Schriftformklausel entspricht nicht den aktuellen Anforderungen."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.total_minutes).toBeGreaterThanOrEqual(30);
  });

  test("minutes are rounded to nearest 5", () => {
    const ctx = makeContext([
      makeMessage("client", "Frage zum Vertrag"),
      makeMessage("lawyer", "Die Antwort ist einfach und kurz."),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.total_minutes % 5).toBe(0);
  });

  test("minimum 5 minutes", () => {
    const ctx = makeContext([
      makeMessage("client", "ok"),
      makeMessage("lawyer", "Verstanden, ich kümmere mich darum."),
    ]);
    // This should be skipped (too short), but if not, min 5
    const result = extractTimeFromConversation(ctx);
    if (result.entries.length > 0) {
      expect(result.total_minutes).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("extractTimeFromConversation — confidence scoring", () => {
  test("high confidence for substantial lawyer response with multiple activities", () => {
    const ctx = makeContext([
      makeMessage(
        "client",
        "Ich brauche Hilfe mit meinem Vertragsentwurf und einer Frist. Können Sie den Vertrag prüfen und die Frist berechnen?"
      ),
      makeMessage(
        "lawyer",
        "Ich werde den Vertrag prüfen und eine Redline-Version erstellen. Außerdem führe ich eine Recherche zur aktuellen Rechtsprechung durch und berechne die Frist nach § 517 ZPO. Der Entwurf wird nach § 253 ZPO strukturiert und ich werde alle relevanten Normen prüfen. Die Fristberechnung ergibt sich aus dem Zustellungsdatum und der Notfrist von einem Monat."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].confidence).toBe("high");
  });

  test("low confidence for very short lawyer response", () => {
    const ctx = makeContext([
      makeMessage(
        "client",
        "Ich habe eine sehr ausführliche Frage zum Vertragsentwurf mit vielen Details und Hintergrundinformationen die wichtig sein könnten für die rechtliche Einschätzung."
      ),
      makeMessage("lawyer", "Ok, prüfe ich."),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].confidence).toBe("low");
  });

  test("confidence reason is always provided", () => {
    const ctx = makeContext([
      makeMessage("client", "Frage zum Vertrag"),
      makeMessage(
        "lawyer",
        "Ich prüfe das und erstelle einen Entwurf mit den entsprechenden rechtlichen Anmerkungen und Änderungsvorschlägen."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].confidence_reason).toBeTruthy();
    expect(result.entries[0].confidence_reason.length).toBeGreaterThan(10);
  });
});

describe("extractTimeFromConversation — description generation", () => {
  test("description includes activity label", () => {
    const ctx = makeContext([
      makeMessage("client", "Bitte erstellen Sie einen Klageschrift Entwurf."),
      makeMessage(
        "lawyer",
        "Ich werde den Entwurf erstellen nach den Anforderungen des § 253 ZPO und den Sachverhalt rechtlich subsumieren."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].description).toContain("Entwurf");
  });

  test("description includes case title when available", () => {
    const ctx = makeContext(
      [
        makeMessage("client", "Frage zum Fall"),
        makeMessage(
          "lawyer",
          "Ich werde die rechtliche Prüfung durchführen und die relevanten Normen analysieren sowie die aktuelle Rechtsprechung berücksichtigen."
        ),
      ],
      { case_title: "Müller vs. Schmidt" }
    );
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].description).toContain("Müller vs. Schmidt");
  });
});

describe("extractTimeFromConversation — billable flag", () => {
  test("normal confidence → billable", () => {
    const ctx = makeContext([
      makeMessage("client", "Bitte prüfen Sie diesen Vertrag für mich."),
      makeMessage(
        "lawyer",
        "Ich werde den Vertrag prüfen und eine rechtliche Bewertung abgeben. Die Klauseln zur Haftung und Gewährleistung müssen genau analysiert werden."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.entries[0].billable).toBe(true);
  });

  test("low confidence with very few minutes → non-billable", () => {
    const ctx = makeContext([makeMessage("client", "ok"), makeMessage("lawyer", "Ja.")]);
    const result = extractTimeFromConversation(ctx);
    if (
      result.entries.length > 0 &&
      result.entries[0].confidence === "low" &&
      result.entries[0].minutes <= 10
    ) {
      expect(result.entries[0].billable).toBe(false);
    }
  });
});

describe("extractedToTimeEntry — conversion", () => {
  test("converts to TimeEntry with correct fields", () => {
    const ctx = makeContext([
      makeMessage("client", "Bitte erstellen Sie einen Vertragsentwurf für mich."),
      makeMessage(
        "lawyer",
        "Ich werde den Entwurf erstellen und dabei die einschlägigen Normen des BGB berücksichtigen. Die Wettbewerbsklausel wird nach § 74 HGB ausgestaltet."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    const entry = result.entries[0];
    const timeEntry = extractedToTimeEntry(entry);

    expect(timeEntry.id).toBe(entry.id);
    expect(timeEntry.description).toBe(entry.description);
    expect(timeEntry.minutes).toBe(entry.minutes);
    expect(timeEntry.billable).toBe(entry.billable);
    expect(timeEntry.billed).toBe(false);
    expect(timeEntry.activity_type).toBe(entry.activity_type);
    expect(timeEntry.note).toContain("Auto-extracted");
    expect(timeEntry.note).toContain(entry.source);
  });

  test("overrides are respected", () => {
    const ctx = makeContext([
      makeMessage("client", "Frage"),
      makeMessage(
        "lawyer",
        "Ich werde das rechtlich prüfen und eine ausführliche Stellungnahme erstellen mit allen relevanten Normen."
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    const timeEntry = extractedToTimeEntry(result.entries[0], {
      description: "Custom description",
      minutes: 999,
      rate: 300,
    });
    expect(timeEntry.description).toBe("Custom description");
    expect(timeEntry.minutes).toBe(999);
    expect(timeEntry.rate).toBe(300);
  });
});

describe("extractTimeFromMultipleConversations — batch", () => {
  test("multiple conversations → multiple entries", () => {
    const conversations = [
      {
        context: makeContext([
          makeMessage("client", "Bitte Vertrag prüfen."),
          makeMessage(
            "lawyer",
            "Ich prüfe den Vertrag und erstelle eine Redline-Version mit allen rechtlichen Anmerkungen."
          ),
        ]),
      },
      {
        context: makeContext([
          makeMessage("client", "Frist für Berufung?"),
          makeMessage(
            "lawyer",
            "Die Frist beträgt einen Monat ab Zustellung. Ich werde die Fristberechnung kontrollieren und sicherstellen dass die Frist gewahrt wird."
          ),
        ]),
      },
    ];

    const result = extractTimeFromMultipleConversations(conversations);
    expect(result.entries.length).toBe(2);
    expect(result.total_minutes).toBeGreaterThan(0);
  });

  test("mixed valid/invalid conversations → only valid entries", () => {
    const conversations = [
      {
        context: makeContext([
          makeMessage("client", "Bitte helfen Sie mir mit dem Vertragsentwurf."),
          makeMessage(
            "lawyer",
            "Ich erstelle den Entwurf nach § 253 ZPO und berücksichtige alle relevanten Normen des BGB."
          ),
        ]),
      },
      {
        context: makeContext([]), // empty → skipped
      },
      {
        context: makeContext([
          makeMessage("client", "ok"), // too short → skipped
        ]),
      },
    ];

    const result = extractTimeFromMultipleConversations(conversations);
    expect(result.entries.length).toBe(1);
  });
});

describe("extractTimeFromConversation — conversation summary", () => {
  test("summary includes message count and role breakdown", () => {
    const ctx = makeContext([
      makeMessage("client", "Eine Frage zum Vertrag"),
      makeMessage(
        "lawyer",
        "Ich prüfe das rechtlich und erstelle eine ausführliche Stellungnahme mit allen Normen."
      ),
      makeMessage("client", "Danke"),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.conversation_summary).toContain("3 Nachrichten");
    expect(result.conversation_summary).toContain("Mandant");
    expect(result.conversation_summary).toContain("Kanzlei");
  });

  test("summary includes voice message count", () => {
    const ctx = makeContext([
      makeMessage("client", "Sprachnachricht", { media_type: "voice" }),
      makeMessage(
        "lawyer",
        "Ich habe die Sprachnachricht transkribiert und rechtlich geprüft. Die Einschätzung umfasst alle relevanten Normen.",
        { media_type: "voice" }
      ),
    ]);
    const result = extractTimeFromConversation(ctx);
    expect(result.conversation_summary).toContain("Sprachnachricht");
  });
});
