import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
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

    const engineRes = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        context: { type: "case", caseSlug: body.case_slug },
        grounding: true,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    let rawOutput = "";
    if (engineRes.ok) {
      const data = await engineRes.json();
      rawOutput = data.answer ?? data.output ?? data.text ?? "";
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
