/**
 * Settlement Retry Cron — räumt failed pipeline settlements automatisch ab.
 *
 * GET /api/cron/settlement-retry  (Cron-only, via CRON_SECRET)
 *
 * Wird alle 15 Minuten aufgerufen (Vercel Cron). Lädt alle pending
 * Settlement-Retries vom Engine und retried sie automatisch.
 *
 * Industry-Standard (Stripe, AWS, OpenAI): failed billing events werden
 * automatisch retried mit exponential backoff. Manuelle Admin-Intervention
 * ist nur für exhausted retries nötig (≥5 fehlgeschlagene Versuche).
 *
 * Flow:
 *   1. GET engine /api/admin/settlement-queue?status=pending
 *   2. Für jedes pending item: POST engine /api/admin/settlement-queue/retry
 *   3. Engine ruft settlePipeline() → web-app /api/billing/pipeline-settle
 *   4. Bei Erfolg: status=succeeded, bei Fehlern: attempts++ (auto-exhausted bei ≥5)
 */

import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Overlap protection: timestamp of the last cron run start.
// In-memory only — sufficient for Vercel serverless (warm instance reuse).
let lastRunAt: number | null = null;

async function settlementRetryHandler(_req: NextRequest): Promise<Response> {
  const headers = engineHeadersForBrain("system");

  // Overlap protection: if the previous cron run is still in progress
  // (15min schedule, but 50 items × 60s timeout can exceed that), skip
  // this run to avoid double-retrying the same pending settlements.
  // Uses an in-memory timestamp lock — sufficient for Vercel serverless
  // where each cron invocation is a fresh instance, but the lock prevents
  // overlap when Vercel reuses warm instances.
  if (lastRunAt && Date.now() - lastRunAt < 10 * 60 * 1000) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "previous run still in progress",
      lockAge: `${Math.round((Date.now() - lastRunAt) / 1000)}s`,
    });
  }
  lastRunAt = Date.now();

  // 1. Load all pending settlement retries from engine
  let pending: Array<{ pipeline_key: string }> = [];
  try {
    const listRes = await fetch(
      `${ENGINE_URL}/api/admin/settlement-queue?status=pending&limit=50`,
      {
        headers,
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!listRes.ok) {
      const text = await listRes.text().catch(() => "");
      return NextResponse.json({
        ok: false,
        error: `engine list returned ${listRes.status}: ${text}`,
        retried: 0,
      });
    }
    const data = (await listRes.json()) as { queue?: Array<{ pipeline_key: string }> };
    pending = data.queue ?? [];
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      retried: 0,
    });
  }

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, retried: 0, message: "no pending settlements" });
  }

  // 2. Retry each pending settlement (sequential — avoids hammering the web app)
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of pending) {
    try {
      const retryRes = await fetch(`${ENGINE_URL}/api/admin/settlement-queue/retry`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_key: item.pipeline_key }),
        signal: AbortSignal.timeout(60_000),
      });
      if (retryRes.ok) {
        succeeded++;
      } else {
        failed++;
        const text = await retryRes.text().catch(() => "");
        errors.push(`${item.pipeline_key}: ${retryRes.status} ${text}`);
      }
    } catch (err) {
      failed++;
      errors.push(`${item.pipeline_key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Release the overlap lock
  lastRunAt = null;

  return NextResponse.json({
    ok: true,
    pending: pending.length,
    succeeded,
    failed,
    ...(errors.length > 0 ? { errors: errors.slice(0, 10) } : {}),
  });
}

export const GET = createCronHandler(settlementRetryHandler, { maxDuration: 120 });
