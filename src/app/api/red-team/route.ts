import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { engineThink } from "@/lib/engine-think";
import { ENGINE_URL } from "@/lib/engine";
import { createRedTeamPrompt, parseRedTeamOutput } from "@/lib/red-team-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const inputSchema = z.object({
  case_slug: z.string().min(1).max(300),
  draft_slug: z.string().max(300).optional(),
  draft_text: z.string().min(1),
  case_context: z.string().min(1),
  legal_area: z.string().max(200).optional(),
  opponent_perspective: z.string().max(5000).optional(),
});

export const POST = createHandler(
  {
    action: "legal.risk_analysis",
    rateTier: "heavy",
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

    const result = parseRedTeamOutput(rawOutput, body.case_slug);

    await fetch(`${ENGINE_URL}/api/pages`, {
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

    return apiSuccess({ result });
  }
);
