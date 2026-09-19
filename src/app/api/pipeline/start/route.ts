import { POST as triggerPipeline } from "@/app/api/legal/trigger-pipeline/route";
import { NextRequest } from "next/server";
import { apiError } from "@/lib/api-response";

export const maxDuration = 60;

/**
 * Start a case analysis. The engine has no /api/pipeline/start; starting is
 * a pipeline trigger and must reserve credits like every other trigger.
 */
export async function POST(req: NextRequest, routeCtx: Parameters<typeof triggerPipeline>[1]) {
  const body = (await req.json().catch(() => null)) as { case_slug?: unknown } | null;
  if (!body || typeof body.case_slug !== "string" || !body.case_slug.trim()) {
    return apiError("case_slug_required", "case_slug fehlt", 400);
  }
  const forwarded = new NextRequest(new URL("/api/legal/trigger-pipeline", req.url), {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ case_slug: body.case_slug.trim() }),
  });
  return triggerPipeline(forwarded, routeCtx);
}
