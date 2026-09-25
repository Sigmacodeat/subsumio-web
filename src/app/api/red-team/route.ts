import { z } from "zod";
import { createHandler, apiSuccess, apiError, recordCreditConsumption } from "@/lib/api-handler";
import { engineThink } from "@/lib/engine-think";
import { ENGINE_URL } from "@/lib/engine";
import { engineWriteBestEffort } from "@/lib/engine-write";
import {
  createRedTeamPrompt,
  parseRedTeamOutput,
  RED_TEAM_MAX_CONTEXT_CHARS,
  RED_TEAM_MAX_DRAFT_CHARS,
} from "@/lib/red-team-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const inputSchema = z.object({
  case_slug: z.string().min(1).max(300),
  draft_slug: z.string().max(300).optional(),
  draft_text: z
    .string()
    .min(1)
    .max(
      RED_TEAM_MAX_DRAFT_CHARS,
      `Der Entwurf ist zu lang (höchstens ${RED_TEAM_MAX_DRAFT_CHARS.toLocaleString("de-AT")} Zeichen). Bitte in Abschnitten prüfen.`
    ),
  case_context: z
    .string()
    .min(1)
    .max(
      RED_TEAM_MAX_CONTEXT_CHARS,
      `Der Kontext ist zu lang (höchstens ${RED_TEAM_MAX_CONTEXT_CHARS.toLocaleString("de-AT")} Zeichen).`
    ),
  legal_area: z.string().max(200).optional(),
  opponent_perspective: z.string().max(5000).optional(),
});

export const POST = createHandler(
  {
    action: "legal.risk_analysis",
    rateTier: "heavy",
    // One balanced reasoning call over the whole draft — priced like the
    // opponent simulation / contract redline (adversarial analysis).
    credits: "subsumption",
    body: inputSchema,
    audit: (ctx, body) => ({
      action: "legal.risk_analysis" as const,
      entityType: "red_team_analysis",
      entityId: body.case_slug,
      details: { draftSlug: body.draft_slug },
    }),
  },
  async (ctx, body) => {
    const prompt = createRedTeamPrompt(body);
    const headers = ctx.headers;

    // A failed engine call must surface as an error — it used to fall back to
    // "" and store an empty red-team result as if the draft had no weaknesses.
    let rawOutput: string;
    try {
      rawOutput = (
        await engineThink(headers, {
          query: prompt,
          caseSlug: body.case_slug,
          mode: "balanced",
          timeoutMs: 55_000,
        })
      ).answer;
    } catch {
      return apiError(
        "engine_unavailable",
        "Die Red-Team-Analyse konnte nicht erstellt werden. Bitte erneut versuchen.",
        502
      );
    }
    if (!rawOutput.trim()) {
      return apiError("empty_analysis", "Die KI hat keine Analyse geliefert.", 502);
    }
    // Charged once the model delivered an analysis (a failed call is free).
    void recordCreditConsumption(ctx, "subsumption", body.case_slug);

    const result = parseRedTeamOutput(rawOutput, body.case_slug);

    // The analysis must not look filed when it was not: a failed save is an
    // error (the result travels along so it is not lost for the user).
    let saved = false;
    try {
      const saveRes = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...ctx.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: `legal/red-team/${result.id}`,
          title: `Red-Team: ${body.case_slug}`,
          type: "red_team_result",
          frontmatter: result,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      saved = saveRes.ok;
    } catch {
      saved = false;
    }
    if (!saved) {
      return apiError(
        "save_failed",
        "Die Analyse wurde erstellt, konnte aber nicht in der Akte gespeichert werden.",
        502,
        { result }
      );
    }

    // `saved: false`: the analysis is shown but did not land in the history.
    return apiSuccess({ result, saved });
  }
);
