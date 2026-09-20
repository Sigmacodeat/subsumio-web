/**
 * The public chat endpoint: answers arrive as server-sent events, sentence by
 * sentence, and only after the claim check. The engine is replaced by a
 * scripted stream, so this runs without a model or a database.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { BILLABLE_PLANS } from "@/lib/billing/plans";

const engineStream = vi.fn();
const engineComplete = vi.fn();

vi.mock("@/lib/engine-llm", () => ({
  isEngineLLMAvailable: () => true,
  engineStream: (...args: unknown[]) => engineStream(...args),
  engineComplete: (...args: unknown[]) => engineComplete(...args),
}));
vi.mock("@/lib/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine")>()),
  engineHeadersForBrain: () => ({}),
}));
vi.mock("@/lib/concierge/store", () => ({ saveTurn: vi.fn(async () => {}) }));

function answer(text: string) {
  return JSON.stringify({
    intent: "pricing",
    sentences: [
      { text, sources: ["pricing-overview"] },
      { text: "Enterprise rechnen wir auf Anfrage ab.", sources: ["pricing-overview"] },
    ],
    next_step: "show_pricing",
    suggestions: ["Was ist im Kanzlei-Tarif enthalten?"],
    profile: {},
  });
}

async function post(body: unknown): Promise<{ status: number; events: Array<Record<string, unknown>> }> {
  const { POST } = await import("./route");
  const req = new Request("http://localhost/api/concierge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await POST(req as never, { params: Promise.resolve({}) } as never);
  const text = await res.text();
  const events = text
    .split("\n")
    .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
  return { status: res.status, events };
}

const body = (question: string) => ({
  sessionId: "11111111-2222-4333-8444-555555555555",
  page: "/at/pricing",
  messages: [{ role: "user", content: question }],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("POST /api/concierge", () => {
  test("streams checked sentences and a final event", async () => {
    engineStream.mockImplementation(async (_h: unknown, _o: unknown, onChunk: (t: string) => void) => {
      const full = answer(`Solo kostet ${BILLABLE_PLANS.pro.monthlyEur} € pro Monat.`);
      for (let i = 0; i < full.length; i += 20) onChunk(full.slice(i, i + 20));
      return { text: full, model: "test-model" };
    });

    const { status, events } = await post(body("Was kostet Subsumio?"));
    expect(status).toBe(200);

    const sentences = events.filter((e) => e.type === "sentence");
    expect(sentences.length).toBeGreaterThan(0);
    const final = events.at(-1) as { type: string; reply: { nextStep: string } };
    expect(final.type).toBe("final");
    expect(final.reply.nextStep).toBe("show_pricing");
    expect(JSON.stringify(events)).toContain(`${BILLABLE_PLANS.pro.monthlyEur} €`);
  });

  test("never streams a price the source does not carry", async () => {
    engineStream.mockImplementation(async (_h: unknown, _o: unknown, onChunk: (t: string) => void) => {
      const full = answer("Solo kostet 49 € pro Monat.");
      onChunk(full);
      return { text: full, model: "test-model" };
    });

    const { events } = await post(body("Was kostet Subsumio?"));
    expect(JSON.stringify(events)).not.toContain("49 €");
  });

  test("falls back to a single completion when the engine cannot stream", async () => {
    engineStream.mockResolvedValue(null);
    engineComplete.mockResolvedValue({
      text: answer(`Solo kostet ${BILLABLE_PLANS.pro.monthlyEur} € pro Monat.`),
      model: "test-model",
    });

    const { events } = await post(body("Was kostet Subsumio?"));
    expect(engineComplete).toHaveBeenCalled();
    expect(events.at(-1)?.type).toBe("final");
  });

  test("reports itself unavailable when the model is silent", async () => {
    engineStream.mockResolvedValue(null);
    engineComplete.mockResolvedValue(null);

    const { events } = await post(body("Was kostet Subsumio?"));
    // Not "nothing is backed" — the model never answered, and the chat says so.
    expect(events.at(-1)?.type).toBe("unavailable");
  });
});
