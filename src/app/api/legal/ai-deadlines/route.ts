import { z } from "zod";
import { ENGINE_URL, recordQuota } from "@/lib/engine";
import { detectDeadlines, enrichAllDeadlines, resolveRelativeDeadline } from "@/lib/ai-deadline-detect";
import { hybridDeadlineDetection, isLLMDeadlineExtractionAvailable } from "@/lib/llm-deadline-extract";
import { createHandler } from "@/lib/api-handler";
import { groundAnswerCitations, emptyGroundingMetadata } from "@/lib/citation-gate";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";

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
    const rawDetected = detectDeadlines(safeText);
    const enrichedRegex = enrichAllDeadlines(rawDetected, safeText);

    // LLM Fallback: wenn Regex keine/wenige Fristen findet, rufe LLM an
    const detected = await hybridDeadlineDetection(safeText, enrichedRegex);
    const llmUsed = detected.some((d) => d.matchedRule === "llm_fallback");

    const createdSlugs: string[] = [];
    if (body.caseSlug) {
      for (const d of detected) {
        if (d.confidence === "high" && (d.date || d.daysFromNow)) {
          try {
            const dueDate = d.date || resolveRelativeDeadline(d.daysFromNow!);
            const slug = `legal/deadline/${Date.now()}-${createdSlugs.length}`;
            const fristResult = d.fristResult;
            await fetch(`${ENGINE_URL}/api/pages`, {
              method: "POST",
              headers: { ...ctx.headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                slug,
                title: d.description,
                type: "deadline",
                content: `Erkannt aus Text:\n${d.sourceSnippet}\n\nKonfidenz: ${d.confidence}${fristResult ? `\n\nDeterministische Berechnung:\n${fristResult.hinweise.join("\n")}` : ""}`,
                frontmatter: {
                  type: "deadline",
                  case_slug: body.caseSlug,
                  due_date: dueDate,
                  status: "pending",
                  review_status: "unreviewed",
                  source: d.matchedRule === "llm_fallback" ? "llm_detected" : "ai_detected",
                  matched_rule: d.matchedRule,
                  ai_confidence: d.confidence,
                  // Deterministisch berechnete Frist-Daten
                  ...(fristResult ? {
                    frist_art: fristResult.art.key,
                    frist_regime: fristResult.art.regime,
                    rechtsgrundlage: fristResult.art.rechtsgrundlage,
                    fristbeginn: fristResult.fristbeginn,
                    fristende: fristResult.fristende,
                    vorfrist_date: fristResult.vorfrist,
                    kalendertage: fristResult.kalendertage,
                    notfrist: fristResult.art.notfrist,
                    deterministic: true,
                  } : {
                    deterministic: false,
                  }),
                  ...(d.zustellungsdatum ? { zustellungsdatum: d.zustellungsdatum } : {}),
                },
                signal: AbortSignal.timeout(30_000),
              }),
            });
            createdSlugs.push(slug);
          } catch {
            // Einzelne Fehler nicht abbrechen
          }
        }
      }
    }
    if (createdSlugs.length > 0) {
      void recordQuota(ctx, "pages", createdSlugs.length);
    }

    const response: Record<string, unknown> = {
      detected,
      created: createdSlugs.length > 0 ? createdSlugs : undefined,
      llm_fallback_used: llmUsed,
      llm_available: isLLMDeadlineExtractionAvailable(),
    };

    try {
      const textParts = detected.map((d) => `${d.description} ${d.sourceSnippet}`).join(" ");
      response._grounding = await groundAnswerCitations(textParts);
    } catch (err) {
      console.error(
        "[ai-deadlines] grounding failed:",
        err instanceof Error ? err.message : String(err)
      );
      response._grounding = emptyGroundingMetadata();
    }

    return Response.json(response);
  }
);
