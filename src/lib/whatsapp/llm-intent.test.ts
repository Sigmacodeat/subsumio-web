import { describe, it, expect, vi, beforeEach } from "vitest";
import { isLLMIntentParserAvailable, parseIntentWithLLM } from "./llm-intent";

// Intent parsing goes through the engine gateway client; mock it, keep the
// JSON parser real.
vi.mock("@/lib/engine-llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine-llm")>()),
  engineComplete: vi.fn(),
  isEngineLLMAvailable: vi.fn(() => true),
}));
vi.mock("@/lib/engine", () => ({
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
}));
import { engineComplete } from "@/lib/engine-llm";

const mockFetch = vi.mocked(engineComplete);
const BRAIN = "brain_test";
const stubResult = (text: string) => ({
  text,
  model: "stub",
  provider: "stub",
  stop_reason: "end",
  usage: { input_tokens: 1, output_tokens: 1 },
  latency_ms: 1,
});

describe("isLLMIntentParserAvailable", () => {
  it("returns true when the engine is configured", () => {
    expect(isLLMIntentParserAvailable()).toBe(true);
  });
});

describe("parseIntentWithLLM", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("parses appointment from natural language", async () => {
    mockFetch.mockResolvedValueOnce(
      stubResult(
        JSON.stringify({
          kind: "appointment",
          caseRef: "2026-014",
          title: "Verhandlung LG München",
          date: "2026-07-15",
          time: "14:00",
          reminderHours: 24,
        })
      )
    );

    const result = await parseIntentWithLLM("termin morgen 14 uhr verhandlung", BRAIN);
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
    mockFetch.mockResolvedValueOnce(
      stubResult(
        JSON.stringify({
          kind: "time_entry",
          minutes: 90,
          caseRef: "2026-014",
          description: "Telefonat mit Mandant",
          billable: true,
        })
      )
    );

    const result = await parseIntentWithLLM("1,5 stunden telefoniert mit müller", BRAIN);
    expect(result?.kind).toBe("time_entry");
    if (result?.kind === "time_entry") {
      expect(result.minutes).toBe(90);
      expect(result.billable).toBe(true);
    }
  });

  it("parses expense from natural language", async () => {
    mockFetch.mockResolvedValueOnce(
      stubResult(
        JSON.stringify({
          kind: "expense",
          amount: 12.5,
          caseRef: "",
          description: "Kopien",
          billable: true,
        })
      )
    );

    const result = await parseIntentWithLLM("12,50 euro für kopien ausgelegt", BRAIN);
    expect(result?.kind).toBe("expense");
    if (result?.kind === "expense") {
      expect(result.amount).toBe(12.5);
    }
  });

  it("parses deadline from natural language", async () => {
    mockFetch.mockResolvedValueOnce(
      stubResult(
        JSON.stringify({
          kind: "deadline",
          caseRef: "2026-014",
          title: "Berufung",
          dueDate: "2026-08-01",
        })
      )
    );

    const result = await parseIntentWithLLM("frist berufung bis august", BRAIN);
    expect(result?.kind).toBe("deadline");
    if (result?.kind === "deadline") {
      expect(result.dueDate).toBe("2026-08-01");
    }
  });

  it("returns free_text for non-actionable messages", async () => {
    mockFetch.mockResolvedValueOnce(
      stubResult(
        JSON.stringify({
          kind: "free_text",
          text: "wie ist das wetter morgen",
        })
      )
    );

    const result = await parseIntentWithLLM("wie ist das wetter morgen", BRAIN);
    expect(result?.kind).toBe("free_text");
  });

  it("returns null on API error", async () => {
    mockFetch.mockResolvedValueOnce(null);

    const result = await parseIntentWithLLM("termin morgen", BRAIN);
    expect(result).toBeNull();
  });

  it("returns null on invalid JSON response", async () => {
    mockFetch.mockResolvedValueOnce(stubResult("this is not json"));

    const result = await parseIntentWithLLM("termin morgen", BRAIN);
    expect(result).toBeNull();
  });

  it("returns null on unknown intent kind", async () => {
    mockFetch.mockResolvedValueOnce(stubResult(JSON.stringify({ kind: "unknown_type" })));

    const result = await parseIntentWithLLM("something weird", BRAIN);
    expect(result).toBeNull();
  });

  it("handles JSON embedded in text", async () => {
    mockFetch.mockResolvedValueOnce(stubResult('Here is the result: {"kind":"today"}'));

    const result = await parseIntentWithLLM("was steht heute an", BRAIN);
    expect(result?.kind).toBe("today");
  });

  it("coerces string numbers to proper types", async () => {
    mockFetch.mockResolvedValueOnce(
      stubResult(
        JSON.stringify({
          kind: "time_entry",
          minutes: "45",
          caseRef: "2026-014",
          description: "Besprechung",
          billable: "true",
        })
      )
    );

    const result = await parseIntentWithLLM("45 minuten besprechung", BRAIN);
    if (result?.kind === "time_entry") {
      expect(result.minutes).toBe(45);
      expect(typeof result.minutes).toBe("number");
    }
  });

  it("clamps minutes to minimum 1", async () => {
    mockFetch.mockResolvedValueOnce(
      stubResult(
        JSON.stringify({
          kind: "time_entry",
          minutes: 0,
          caseRef: "",
          description: "",
          billable: true,
        })
      )
    );

    const result = await parseIntentWithLLM("0 minuten", BRAIN);
    if (result?.kind === "time_entry") {
      expect(result.minutes).toBe(1);
    }
  });

  it("returns null on fetch timeout", async () => {
    mockFetch.mockResolvedValueOnce(null);
    const result = await parseIntentWithLLM("termin morgen", BRAIN);
    expect(result).toBeNull();
  });
});
