import { POST as triggerPipeline } from "@/app/api/legal/trigger-pipeline/route";
import { NextRequest } from "next/server";
import { apiError } from "@/lib/api-response";

export const maxDuration = 60;

/**
 * Resume a case analysis from a layer (review-queue "Fortsetzen").
 *
 * The engine has no /api/pipeline/resume — this used to proxy into a 404 and
 * the button always failed. Resuming is a pipeline trigger with
 * `resume_from_layer`, and it must go through the same route that reserves
 * credits and signs the billing owner.
 */
export async function POST(req: NextRequest, routeCtx: Parameters<typeof triggerPipeline>[1]) {
  const body = (await req.json().catch(() => null)) as {
    case_slug?: unknown;
    resume_from_layer?: unknown;
  } | null;
  if (!body || typeof body.case_slug !== "string" || !body.case_slug.trim()) {
    return apiError("case_slug_required", "case_slug fehlt", 400);
  }
  const layer =
    typeof body.resume_from_layer === "number" && Number.isInteger(body.resume_from_layer)
      ? Math.min(Math.max(body.resume_from_layer, 1), 6)
      : 3;
  const forwarded = new NextRequest(new URL("/api/legal/trigger-pipeline", req.url), {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ case_slug: body.case_slug.trim(), resume_from_layer: layer }),
  });
  return triggerPipeline(forwarded, routeCtx);
}
