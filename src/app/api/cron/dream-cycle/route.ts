import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { env } from "@/lib/env";
import { learningDisabledBrainIds } from "@/lib/brain-learning";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/dream-cycle — nightly Subsumio engine dream cycle.
 *
 * Triggers the engine's internal dream/maintenance cycle which runs
 * all phases: extract, embed stale, consolidate, legal phases, orphans, etc.
 * Keeps the knowledge graph fresh and the brain score high.
 *
 * Firm setting "Kanzlei-Gehirn lernt mit": the body carries the COMPLETE list
 * of firms that switched learning off. The engine reconciles its per-firm
 * flags to this list and skips every learning phase for those firms, while
 * housekeeping (embedding, cleanup) keeps running for everyone. See
 * docs/architecture/BRAIN_LEARNING.md.
 */

export const GET = createCronHandler(async (_req: NextRequest) => {
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;
  headers["x-subsumio-source"] = "law-de";
  headers["Content-Type"] = "application/json";

  // Server-side truth from the auth store — never from a request.
  const learningExcluded = await learningDisabledBrainIds();

  const res = await fetch(`${ENGINE_URL}/api/admin/dream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ learning_excluded_sources: learningExcluded }),
    signal: AbortSignal.timeout(280_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`dream-cycle failed: ${res.status} ${text}`);
  }

  const result = (await res.json()) as {
    status: string;
    duration_ms: number;
    phases?: Array<{ phase: string; status: string; summary: string }>;
  };

  const phases = result.phases ?? [];
  const ok = phases.filter((p) => p.status === "ok").length;
  const skipped = phases.filter((p) => p.status === "skipped").length;
  const warn = phases.filter((p) => p.status === "warn").length;

  return Response.json({
    success: result.status === "ok" || result.status === "partial",
    status: result.status,
    duration_ms: result.duration_ms,
    phases_ok: ok,
    phases_skipped: skipped,
    phases_warn: warn,
    phases_total: phases.length,
    learning_excluded_firms: learningExcluded.length,
  });
});
