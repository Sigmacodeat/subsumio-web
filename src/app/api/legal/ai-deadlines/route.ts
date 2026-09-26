import { z } from "zod";
import { resolveCaseJurisdiction } from "@/lib/engine";
import { recognizeDeadlines, type Rechtsraum } from "@/lib/ai-deadline-detect";
import {
  hybridDeadlineDetection,
  isLLMDeadlineExtractionAvailable,
  type LlmCallMeta,
} from "@/lib/llm-deadline-extract";
import { createHandler, recordCreditConsumption } from "@/lib/api-handler";
import { canAffordOptionalLlm } from "@/lib/billing/optional-llm-credits";
import { groundAnswerCitations, emptyGroundingMetadata } from "@/lib/citation-gate";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";

import { logger } from "@/lib/logger";
const log = logger("api/legal/ai-deadlines");

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const aiDeadlinesSchema = z.object({
  text: z.string().min(1, "text_required").max(50_000, "text_too_long"),
  caseSlug: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: aiDeadlinesSchema,
    audit: (_ctx, body) => ({
      action: "legal.ai_deadlines" as const,
      entityType: "deadline",
      details: { caseSlug: body.caseSlug, textLength: body.text.length },
    }),
  },
  async (ctx, body, _query, _req) => {
    const safeText = sanitizeUserInput(body.text);
    // The matter's Rechtsraum picks the engine: a German matter is not
    // computed with Austrian rules (and vice versa). Without a matter: AT.
    const rechtsraum = await rechtsraumFor(body.caseSlug, ctx.headers);
    const enrichedRegex = recognizeDeadlines(safeText, { rechtsraum });

    // LLM Fallback: wenn Regex keine/wenige Fristen findet, rufe LLM an.
    // Kostenpflichtig (deadline_detect) — ohne Guthaben bleibt es beim
    // kostenlosen Regex-Ergebnis statt die ganze Erkennung abzulehnen.
    const llmAffordable = await canAffordOptionalLlm(ctx, "deadline_detect");
    const llmMeta: LlmCallMeta = {};
    const detected = llmAffordable
      ? await hybridDeadlineDetection(safeText, enrichedRegex, ctx.headers, {
          meta: llmMeta,
          rechtsraum,
        })
      : enrichedRegex;
    if (llmMeta.modelCalled) void recordCreditConsumption(ctx, "deadline_detect", body.caseSlug);
    const llmUsed = detected.some((d) => d.matchedRule === "llm_fallback");

    // Nothing is written here. Every result is a suggestion the lawyer adopts
    // explicitly (Akte → Fristen, Fristenbuch), where it is stored as an
    // unreviewed deadline the Fristenbuch reads.
    const response: Record<string, unknown> = {
      detected,
      rechtsraum,
      llm_fallback_used: llmUsed,
      llm_available: isLLMDeadlineExtractionAvailable(),
      ...(llmAffordable ? {} : { llm_skipped: "insufficient_credits" }),
    };

    try {
      const textParts = detected.map((d) => `${d.description} ${d.sourceSnippet}`).join(" ");
      response._grounding = await groundAnswerCitations(textParts);
    } catch (err) {
      log.error(
        "[ai-deadlines] grounding failed:",
        err instanceof Error ? err.message : String(err)
      );
      response._grounding = emptyGroundingMetadata();
    }

    return Response.json(response);
  }
);

async function rechtsraumFor(
  caseSlug: string | undefined,
  headers: Record<string, string>
): Promise<Rechtsraum> {
  if (!caseSlug?.trim()) return "AT";
  const j = await resolveCaseJurisdiction(caseSlug.trim(), headers).catch(() => undefined);
  return j === "de" ? "DE" : j === "ch" ? "CH" : "AT";
}
