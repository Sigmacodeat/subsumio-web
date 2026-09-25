import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/contradiction-probe — manual contradiction probe for one firm.
 *
 * Triggers the engine's eval suspected-contradictions with Haiku judge
 * (low cost, ~$0.50 budget cap) scoped to one doc_type. Results are stored in
 * eval_contradictions_runs and can be read by the find_contradictions
 * MCP operation / subagent tool.
 *
 * Not scheduled: the contradiction check for firm documents runs after each
 * upload (post-upload outbox). This route needs an explicit brain_id and
 * doc_type — no default brain, so it never silently probes the law corpus.
 */

export const GET = createCronHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const brainId = url.searchParams.get("brain_id")?.trim();
  const docType = url.searchParams.get("doc_type")?.trim();
  const caseSlug = url.searchParams.get("case_slug")?.trim();
  if (!brainId || !docType) {
    return Response.json(
      { success: false, error: "brain_id und doc_type sind erforderlich." },
      { status: 400 }
    );
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...engineHeadersForBrain(brainId),
  };

  const res = await fetch(`${ENGINE_URL}/api/admin/contradiction-probe`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      budget_usd: 0.5,
      top_k: 5,
      limit: 20,
      doc_type: docType,
      ...(caseSlug ? { case_slug: caseSlug } : {}),
    }),
    signal: AbortSignal.timeout(280_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`contradiction-probe failed: ${res.status} ${text}`);
  }

  const result = (await res.json()) as { status: string; message: string };

  return Response.json({
    success: result.status === "ok",
    status: result.status,
    message: result.message,
  });
});
