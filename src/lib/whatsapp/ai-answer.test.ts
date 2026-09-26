// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// A plain holder instead of vi.fn(): vitest reports a rejection from a
// vi.fn() implementation as a test error even when the caller catches it.
const ground = vi.hoisted(() => ({ impl: async (): Promise<unknown> => undefined }));
vi.mock("@/lib/citation-gate", () => ({
  groundAnswerCitations: () => ground.impl(),
}));

import {
  finalizeWhatsAppAiAnswer,
  WHATSAPP_AI_NOTICE,
  WHATSAPP_ANSWER_MAX_CHARS,
  WHATSAPP_GROUNDING_UNAVAILABLE_NOTE,
  WHATSAPP_RETRIEVAL_FAILED_NOTE,
} from "./ai-answer";

function grounding(unverified: number) {
  return {
    citations_verified: 1,
    citations_unverified: unverified,
    corpus_checked: true,
    grounded_citations: [],
    analyzed_at: "2026-09-26T00:00:00.000Z",
    has_unverified: unverified > 0,
  };
}

beforeEach(() => {
  ground.impl = async () => grounding(0);
});

// KI5-02: WhatsApp answers carry grounding, search-failure note and KI label.
describe("finalizeWhatsAppAiAnswer", () => {
  it("always adds the KI label in Sie-form", async () => {
    ground.impl = async () => grounding(0);
    const out = await finalizeWhatsAppAiAnswer("Antwort.");
    expect(out).toBe(`Antwort.\n\n${WHATSAPP_AI_NOTICE}`);
    expect(out).toContain("Art. 50 KI-VO");
    expect(out).toContain("anwaltlich prüfen");
  });

  it("names unverified citations", async () => {
    ground.impl = async () => grounding(2);
    const out = await finalizeWhatsAppAiAnswer("Nach § 999 ABGB gilt …");
    expect(out).toContain("2 Zitat(e) nicht verifiziert");
  });

  it("fails closed when the grounding check itself fails", async () => {
    ground.impl = async () => {
      throw new Error("corpus unavailable");
    };
    const out = await finalizeWhatsAppAiAnswer("Antwort.");
    expect(out).toContain(WHATSAPP_GROUNDING_UNAVAILABLE_NOTE);
    expect(out).toContain(WHATSAPP_AI_NOTICE);
  });

  it("adds the search-failure note unless the engine already put its own", async () => {
    ground.impl = async () => grounding(0);
    const warnings = ["RETRIEVAL_FAILED: page search unavailable — answer is not source-backed"];
    expect(await finalizeWhatsAppAiAnswer("Antwort.", { warnings })).toContain(
      WHATSAPP_RETRIEVAL_FAILED_NOTE
    );
    const engineNoted =
      "⚠️ Hinweis: Die Suche in Akten und Rechtsquellen war bei dieser Anfrage nicht erreichbar. …";
    expect(await finalizeWhatsAppAiAnswer(engineNoted, { warnings })).not.toContain(
      WHATSAPP_RETRIEVAL_FAILED_NOTE
    );
  });

  it("cuts a long answer so the notes still fit", async () => {
    ground.impl = async () => grounding(1);
    const out = await finalizeWhatsAppAiAnswer("x".repeat(5000));
    expect(out.length).toBeLessThanOrEqual(WHATSAPP_ANSWER_MAX_CHARS);
    expect(out.endsWith(WHATSAPP_AI_NOTICE)).toBe(true);
    expect(out).toContain("1 Zitat(e) nicht verifiziert");
  });
});
