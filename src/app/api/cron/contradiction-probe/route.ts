import { NextRequest } from "next/server";
import { apiError, createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/contradiction-probe — manual contradiction probe.
 *
 * Not scheduled. The engine's probe searches and records its runs across the
 * whole database, not per firm source, so a nightly run per firm would mix
 * firms' data. Contradictions in a firm's matters are checked after each
 * upload (post-upload outbox → /api/legal/contradictions, per matter).
 *
 * An operator may still start a run explicitly: `brain_id` plus exactly one
 * of `doc_type` or `query` are required. Without them the request is
 * refused (400) and the engine is not called.
 */

const DOC_TYPE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export const GET = createCronHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const brainId = url.searchParams.get("brain_id")?.trim();
  const docType = url.searchParams.get("doc_type")?.trim();
  const query = url.searchParams.get("query")?.trim();

  if (!brainId) {
    return apiError("brain_id_required", "brain_id fehlt", 400);
  }
  if (!docType === !query) {
    return apiError(
      "probe_parameters_required",
      "Genau einer der Parameter doc_type oder query ist erforderlich",
      400
    );
  }
  if (docType && !DOC_TYPE_RE.test(docType)) {
    return apiError("invalid_doc_type", "doc_type ungültig", 400);
  }

  const res = await fetch(`${ENGINE_URL}/api/admin/contradiction-probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...engineHeadersForBrain(brainId) },
    body: JSON.stringify({
      budget_usd: 0.5,
      top_k: 5,
      limit: 20,
      ...(docType ? { doc_type: docType } : { query }),
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
