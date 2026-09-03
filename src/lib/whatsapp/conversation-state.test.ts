import { describe, it, expect } from "vitest";
import {
  missingFieldsForIntent,
  buildClarifyingQuestion,
  mergePartialIntent,
  type ConversationState,
} from "./conversation-state";
import type { ParsedIntent } from "@/lib/legal-chat/actions";

describe("missingFieldsForIntent", () => {
  it("detects missing date and time for appointment", () => {
    const intent: ParsedIntent = {
      kind: "appointment",
      caseRef: "2026-014",
      title: "Verhandlung",
      date: "",
      time: "",
      reminderHours: 24,
    };
    expect(missingFieldsForIntent(intent).sort()).toEqual(["date", "time"]);
  });

  it("detects no missing fields for complete appointment", () => {
    const intent: ParsedIntent = {
      kind: "appointment",
      caseRef: "2026-014",
      title: "Verhandlung",
      date: "2026-07-15",
      time: "14:00",
      reminderHours: 24,
    };
    expect(missingFieldsForIntent(intent)).toEqual([]);
  });

  it("detects missing dueDate for deadline", () => {
    const intent: ParsedIntent = {
      kind: "deadline",
      caseRef: "2026-014",
      title: "Berufung",
      dueDate: "",
    };
    expect(missingFieldsForIntent(intent)).toEqual(["dueDate"]);
  });

  it("detects missing title for task", () => {
    const intent: ParsedIntent = {
      kind: "task",
      caseRef: "2026-014",
      title: "",
    };
    expect(missingFieldsForIntent(intent)).toEqual(["title"]);
  });

  it("detects missing minutes for time_entry", () => {
    const intent: ParsedIntent = {
      kind: "time_entry",
      minutes: 0,
      caseRef: "2026-014",
      description: "Telefonat",
      billable: true,
    };
    expect(missingFieldsForIntent(intent)).toEqual(["minutes"]);
  });

  it("detects missing amount for expense", () => {
    const intent: ParsedIntent = {
      kind: "expense",
      amount: 0,
      caseRef: "",
      description: "Kopien",
      billable: true,
    };
    expect(missingFieldsForIntent(intent)).toEqual(["amount"]);
  });

  it("returns empty for list commands", () => {
    expect(missingFieldsForIntent({ kind: "list_cases" })).toEqual([]);
    expect(missingFieldsForIntent({ kind: "today" })).toEqual([]);
  });
});

describe("buildClarifyingQuestion", () => {
  it("asks for date and time when both missing", () => {
    const q = buildClarifyingQuestion("appointment", ["date", "time"]);
    expect(q).toContain("Wann soll der Termin sein?");
    expect(q).toContain("Zu welcher Uhrzeit?");
  });

  it("asks for dueDate when missing for deadline", () => {
    const q = buildClarifyingQuestion("deadline", ["dueDate"]);
    expect(q).toContain("Bis wann ist die Frist?");
  });

  it("asks for minutes when missing for time_entry", () => {
    const q = buildClarifyingQuestion("time_entry", ["minutes"]);
    expect(q).toContain("Wie lange hast du gearbeitet?");
  });

  it("asks for amount when missing for expense", () => {
    const q = buildClarifyingQuestion("expense", ["amount"]);
    expect(q).toContain("Wie hoch ist die Auslage?");
  });

  it("returns generic message for empty missing list", () => {
    const q = buildClarifyingQuestion("appointment", []);
    expect(q).toContain("Bitte ergänze die fehlenden Informationen");
  });
});

describe("mergePartialIntent", () => {
  it("merges date from follow-up into appointment state", () => {
    const state: ConversationState = {
      expectedKind: "appointment",
      missingFields: ["date"],
      partial: {
        caseRef: "2026-014",
        title: "Verhandlung",
        time: "14:00",
        reminderHours: 24,
      },
      createdAt: new Date().toISOString(),
      originalText: "termin akt 2026-014: verhandlung 14:00",
    };

    const newIntent: ParsedIntent = {
      kind: "appointment",
      caseRef: "",
      title: "",
      date: "2026-07-15",
      time: "",
      reminderHours: 24,
    };

    const { merged, stillMissing } = mergePartialIntent(state, newIntent);
    expect(merged.date).toBe("2026-07-15");
    expect(merged.caseRef).toBe("2026-014");
    expect(merged.time).toBe("14:00");
    expect(stillMissing).toEqual([]);
  });

  it("merges time from follow-up", () => {
    const state: ConversationState = {
      expectedKind: "appointment",
      missingFields: ["time"],
      partial: {
        caseRef: "2026-014",
        title: "Verhandlung",
        date: "2026-07-15",
        reminderHours: 24,
      },
      createdAt: new Date().toISOString(),
      originalText: "termin akt 2026-014: 15.07.2026 verhandlung",
    };

    const newIntent: ParsedIntent = {
      kind: "appointment",
      caseRef: "",
      title: "",
      date: "",
      time: "14:00",
      reminderHours: 24,
    };

    const { merged, stillMissing } = mergePartialIntent(state, newIntent);
    expect(merged.time).toBe("14:00");
    expect(stillMissing).toEqual([]);
  });

  it("does not overwrite existing fields with empty values", () => {
    const state: ConversationState = {
      expectedKind: "deadline",
      missingFields: ["dueDate"],
      partial: {
        caseRef: "2026-014",
        title: "Berufung",
      },
      createdAt: new Date().toISOString(),
      originalText: "frist akt 2026-014: berufung",
    };

    const newIntent: ParsedIntent = {
      kind: "deadline",
      caseRef: "",
      title: "",
      dueDate: "2026-08-01",
    };

    const { merged, stillMissing } = mergePartialIntent(state, newIntent);
    expect(merged.caseRef).toBe("2026-014");
    expect(merged.title).toBe("Berufung");
    expect(merged.dueDate).toBe("2026-08-01");
    expect(stillMissing).toEqual([]);
  });

  it("reports still-missing fields when follow-up doesn't provide them", () => {
    const state: ConversationState = {
      expectedKind: "appointment",
      missingFields: ["date", "time"],
      partial: {
        caseRef: "2026-014",
        title: "Verhandlung",
        reminderHours: 24,
      },
      createdAt: new Date().toISOString(),
      originalText: "termin akt 2026-014: verhandlung",
    };

    const newIntent: ParsedIntent = {
      kind: "free_text",
      text: "ich meine nächte woche",
    };

    const { merged, stillMissing } = mergePartialIntent(state, newIntent);
    expect(stillMissing).toContain("date");
    expect(stillMissing).toContain("time");
  });
});
