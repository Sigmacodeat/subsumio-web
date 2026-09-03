import { describe, it, expect, vi, beforeEach } from "vitest";
import { isLLMIntentParserAvailable, parseIntentWithLLM } from "./llm-intent";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock env
vi.mock("@/lib/env", () => ({
  env: (key: string) => {
    if (key === "OPENROUTER_API_KEY") return "test-key";
    if (key === "OPENROUTER_API_KEY_FALLBACK") return "";
    return "";
  },
}));

describe("isLLMIntentParserAvailable", () => {
  it("returns true when OPENROUTER_API_KEY is set", () => {
    expect(isLLMIntentParserAvailable()).toBe(true);
  });
});

describe("parseIntentWithLLM", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("parses appointment from natural language", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "appointment",
                caseRef: "2026-014",
                title: "Verhandlung LG München",
                date: "2026-07-15",
                time: "14:00",
                reminderHours: 24,
              }),
            },
          },
        ],
      }),
    });

    const result = await parseIntentWithLLM("termin morgen 14 uhr verhandlung");
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("appointment");
    if (result?.kind === "appointment") {
      expect(result.caseRef).toBe("2026-014");
      expect(result.title).toBe("Verhandlung LG München");
      expect(result.date).toBe("2026-07-15");
      expect(result.time).toBe("14:00");
    }
  });

  it("parses time_entry from natural language", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "time_entry",
                minutes: 90,
                caseRef: "2026-014",
                description: "Telefonat mit Mandant",
                billable: true,
              }),
            },
          },
        ],
      }),
    });

    const result = await parseIntentWithLLM("1,5 stunden telefoniert mit müller");
    expect(result?.kind).toBe("time_entry");
    if (result?.kind === "time_entry") {
      expect(result.minutes).toBe(90);
      expect(result.billable).toBe(true);
    }
  });

  it("parses expense from natural language", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "expense",
                amount: 12.5,
                caseRef: "",
                description: "Kopien",
                billable: true,
              }),
            },
          },
        ],
      }),
    });

    const result = await parseIntentWithLLM("12,50 euro für kopien ausgelegt");
    expect(result?.kind).toBe("expense");
    if (result?.kind === "expense") {
      expect(result.amount).toBe(12.5);
    }
  });

  it("parses deadline from natural language", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "deadline",
                caseRef: "2026-014",
                title: "Berufung",
                dueDate: "2026-08-01",
              }),
            },
          },
        ],
      }),
    });

    const result = await parseIntentWithLLM("frist berufung bis august");
    expect(result?.kind).toBe("deadline");
    if (result?.kind === "deadline") {
      expect(result.dueDate).toBe("2026-08-01");
    }
  });

  it("returns free_text for non-actionable messages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "free_text",
                text: "wie ist das wetter morgen",
              }),
            },
          },
        ],
      }),
    });

    const result = await parseIntentWithLLM("wie ist das wetter morgen");
    expect(result?.kind).toBe("free_text");
  });

  it("returns null on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    const result = await parseIntentWithLLM("termin morgen");
    expect(result).toBeNull();
  });

  it("returns null on invalid JSON response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "this is not json",
            },
          },
        ],
      }),
    });

    const result = await parseIntentWithLLM("termin morgen");
    expect(result).toBeNull();
  });

  it("returns null on unknown intent kind", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ kind: "unknown_type" }),
            },
          },
        ],
      }),
    });

    const result = await parseIntentWithLLM("something weird");
    expect(result).toBeNull();
  });

  it("handles JSON embedded in text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Here is the result: {"kind":"today"}',
            },
          },
        ],
      }),
    });

    const result = await parseIntentWithLLM("was steht heute an");
    expect(result?.kind).toBe("today");
  });

  it("coerces string numbers to proper types", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "time_entry",
                minutes: "45",
                caseRef: "2026-014",
                description: "Besprechung",
                billable: "true",
              }),
            },
          },
        ],
      }),
    });

    const result = await parseIntentWithLLM("45 minuten besprechung");
    if (result?.kind === "time_entry") {
      expect(result.minutes).toBe(45);
      expect(typeof result.minutes).toBe("number");
    }
  });

  it("clamps minutes to minimum 1", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "time_entry",
                minutes: 0,
                caseRef: "",
                description: "",
                billable: true,
              }),
            },
          },
        ],
      }),
    });

    const result = await parseIntentWithLLM("0 minuten");
    if (result?.kind === "time_entry") {
      expect(result.minutes).toBe(1);
    }
  });

  it("returns null on fetch timeout", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));
    const result = await parseIntentWithLLM("termin morgen");
    expect(result).toBeNull();
  });
});
