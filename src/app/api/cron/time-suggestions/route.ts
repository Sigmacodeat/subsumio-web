import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { listAuditLogs } from "@/lib/audit";
import { fetchPages, getRecipientsByBrain, mapWithConcurrency } from "@/lib/cron-utils";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { generateTimeSuggestions, type TimeSuggestion } from "@/lib/passive-time";
import { activitiesFromAudit } from "@/lib/time-capture";
import { logger } from "@/lib/logger";

const log = logger("cron.time-suggestions");

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Builds time suggestions per firm from the last 24 hours of its audit log.
 *
 * Opt-in per user: the preference lives in the firm's brain
 * (passive_time_preference); no preference means nothing is suggested.
 * Suggestions are written to the same brain the time-suggestions page reads.
 * A suggestion the lawyer already accepted or rejected is never rewritten.
 */
async function suggestForBrain(brainId: string): Promise<TimeSuggestion[]> {
  const preferences = await fetchPages(brainId, "passive_time_preference", 500);
  const optedIn = new Set(
    preferences
      .map((p) => p.frontmatter ?? {})
      .filter((f) => f.enabled === true && typeof f.user_email === "string")
      .map((f) => String(f.user_email).toLowerCase())
  );
  if (optedIn.size === 0) return [];

  const entries = await listAuditLogs({
    brainId,
    from: new Date(Date.now() - LOOKBACK_MS).toISOString(),
    limit: 5000,
  });
  const activities = activitiesFromAudit(
    entries.filter((e) => e.userEmail && optedIn.has(e.userEmail.toLowerCase()))
  );
  if (activities.length === 0) return [];

  const existing = await fetchPages(brainId, "time_suggestion", 2000);
  const decided = new Set(
    existing
      .map((p) => p.frontmatter ?? {})
      .filter((f) => f.status && f.status !== "suggested")
      .map((f) => String(f.id))
  );

  const users = new Set(activities.map((a) => a.user_email));
  const suggestions = [...users]
    .flatMap((email) => generateTimeSuggestions(activities, email))
    .filter((s) => !decided.has(s.id));

  const headers = { ...engineHeadersForBrain(brainId), "Content-Type": "application/json" };
  for (const suggestion of suggestions) {
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug: `legal/time-suggestions/${suggestion.id}`,
        title: `Zeitvorschlag: ${suggestion.date} ${suggestion.start_time}–${suggestion.end_time}`,
        type: "time_suggestion",
        frontmatter: { ...suggestion, type: "time_suggestion" },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      log.warn("[time-suggestions] could not store suggestion", {
        brainId,
        id: suggestion.id,
        status: res.status,
      });
    }
  }
  return suggestions;
}

async function timeSuggestionsHandler(_req: NextRequest): Promise<Response> {
  const brainIds = [...(await getRecipientsByBrain()).keys()];
  const perBrain = await mapWithConcurrency(brainIds, async (brainId) => {
    try {
      return { brainId, count: (await suggestForBrain(brainId)).length };
    } catch (err) {
      log.error("[time-suggestions] brain failed", {
        brainId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { brainId, count: 0, error: true };
    }
  });

  const done = perBrain.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  return NextResponse.json({
    processedAt: new Date().toISOString(),
    brains: brainIds.length,
    totalSuggestions: done.reduce((sum, b) => sum + b.count, 0),
    failedBrains: brainIds.length - done.filter((b) => !b.error).length,
  });
}

// The server crontab calls every job with a plain GET (curl -fsS).
export const GET = createCronHandler(timeSuggestionsHandler, { maxDuration: 120 });
export const POST = GET;
