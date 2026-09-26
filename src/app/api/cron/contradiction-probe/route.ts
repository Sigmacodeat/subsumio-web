import { NextRequest } from "next/server";
import { apiError, createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { billableRecipientsByBrain } from "@/lib/cron-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = logger("cron/contradiction-probe");

/**
 * GET /api/cron/contradiction-probe — contradiction probe.
 *
 * Nightly (no parameters): for every firm brain that pays or is on its
 * trial, the documents changed in the last 24 h are checked against the rest
 * of THAT firm's documents. The engine binds each run to the calling firm's
 * source (search, pairs and the stored run never span two firms) and caps it
 * by the firm's daily probe budget; an exhausted budget skips the firm.
 *
 * Manual: `brain_id` plus exactly one of `doc_type`, `query` or
 * `recent_hours` runs one firm. Anything else is refused (400) without
 * calling the engine.
 */

const DOC_TYPE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const NIGHTLY_RECENT_HOURS = 24;
const RUN_BUDGET_USD = 0.5;
/** Firms probed in parallel during the nightly run. */
const NIGHTLY_CONCURRENCY = 3;
/** No new firm run is started after this much of the route's time. */
const NIGHTLY_DEADLINE_MS = 240_000;
const PER_RUN_TIMEOUT_MS = 90_000;

type ProbeBody = { doc_type: string } | { query: string } | { recent_hours: number };

type ProbeOutcome = "ok" | "no_documents" | "budget_exhausted" | "failed";

async function probeBrain(
  brainId: string,
  scope: ProbeBody,
  timeoutMs: number
): Promise<{ outcome: ProbeOutcome; status: number; message?: string }> {
  const res = await fetch(`${ENGINE_URL}/api/admin/contradiction-probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...engineHeadersForBrain(brainId) },
    body: JSON.stringify({ budget_usd: RUN_BUDGET_USD, top_k: 5, limit: 20, ...scope }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.ok) {
    const result = (await res.json()) as { status?: string; message?: string };
    return {
      outcome: result.status === "ok" ? "ok" : "failed",
      status: res.status,
      message: result.message,
    };
  }
  // 422: the probe found nothing to check (no recent documents).
  if (res.status === 422) return { outcome: "no_documents", status: res.status };
  if (res.status === 429) return { outcome: "budget_exhausted", status: res.status };
  const text = await res.text().catch(() => "");
  return { outcome: "failed", status: res.status, message: text.slice(0, 300) };
}

async function nightly(): Promise<Response> {
  const brains = [...(await billableRecipientsByBrain()).keys()].filter(Boolean);
  const started = Date.now();
  const counts: Record<ProbeOutcome, number> = {
    ok: 0,
    no_documents: 0,
    budget_exhausted: 0,
    failed: 0,
  };
  const deferred: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < brains.length) {
      const brainId = brains[next++]!;
      if (Date.now() - started > NIGHTLY_DEADLINE_MS) {
        deferred.push(brainId);
        continue;
      }
      try {
        const r = await probeBrain(
          brainId,
          { recent_hours: NIGHTLY_RECENT_HOURS },
          PER_RUN_TIMEOUT_MS
        );
        counts[r.outcome]++;
        if (r.outcome === "failed") {
          log.warn("probe failed", { brainId, status: r.status, message: r.message });
        }
      } catch (e) {
        counts.failed++;
        log.warn("probe failed", { brainId, error: e instanceof Error ? e.message : String(e) });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(NIGHTLY_CONCURRENCY, brains.length) }, () => worker())
  );
  // A failed firm run makes the job fail (5xx) so cronjob.sh alerts.
  return Response.json(
    {
      success: counts.failed === 0,
      mode: "nightly",
      brains: brains.length,
      ...counts,
      deferred: deferred.length,
    },
    { status: counts.failed > 0 ? 500 : 200 }
  );
}

export const GET = createCronHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const brainId = url.searchParams.get("brain_id")?.trim();
  const docType = url.searchParams.get("doc_type")?.trim();
  const query = url.searchParams.get("query")?.trim();
  const recentRaw = url.searchParams.get("recent_hours")?.trim();

  if (!brainId && !docType && !query && !recentRaw) return nightly();

  if (!brainId) {
    return apiError("brain_id_required", "brain_id fehlt", 400);
  }
  if ([docType, query, recentRaw].filter(Boolean).length !== 1) {
    return apiError(
      "probe_parameters_required",
      "Genau einer der Parameter doc_type, query oder recent_hours ist erforderlich",
      400
    );
  }
  if (docType && !DOC_TYPE_RE.test(docType)) {
    return apiError("invalid_doc_type", "doc_type ungültig", 400);
  }
  const recentHours = recentRaw ? Number(recentRaw) : undefined;
  if (
    recentRaw &&
    (!Number.isInteger(recentHours) || (recentHours as number) < 1 || (recentHours as number) > 168)
  ) {
    return apiError("invalid_recent_hours", "recent_hours ungültig (1–168)", 400);
  }

  const scope: ProbeBody = docType
    ? { doc_type: docType }
    : query
      ? { query }
      : { recent_hours: recentHours as number };
  const r = await probeBrain(brainId, scope, 280_000);
  if (r.outcome === "failed") {
    throw new Error(`contradiction-probe failed: ${r.status} ${r.message ?? ""}`);
  }
  return Response.json({
    success: r.outcome === "ok",
    status: r.outcome,
    message: r.message ?? r.outcome,
  });
});
