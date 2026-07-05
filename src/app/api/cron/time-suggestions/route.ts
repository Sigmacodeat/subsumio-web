import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import {
  generateTimeSuggestions,
  type ActivityEvent,
  type TimeSuggestion,
} from "@/lib/passive-time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function timeSuggestionsHandler(_req: NextRequest): Promise<Response> {
  const suggestions: TimeSuggestion[] = [];
  const headers = engineHeadersForBrain("system");

  // 1. Load all activity events from the last 24h
  const params = new URLSearchParams({ type: "activity_event", limit: "500" });
  const listRes = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!listRes.ok) {
    return NextResponse.json({
      processedAt: new Date().toISOString(),
      totalSuggestions: 0,
      suggestions: [],
    });
  }
  const listData = await listRes.json();
  const pages = (Array.isArray(listData) ? listData : (listData.pages ?? [])) as Array<{
    frontmatter: Record<string, unknown>;
  }>;
  const events: ActivityEvent[] = pages.map((p) => p.frontmatter as unknown as ActivityEvent);

  // Privacy invariant: passive tracking is opt-in per user. No preference means off.
  const preferenceParams = new URLSearchParams({ type: "passive_time_preference", limit: "500" });
  const preferenceRes = await fetch(`${ENGINE_URL}/api/pages?${preferenceParams}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const preferenceData = preferenceRes.ok ? await preferenceRes.json() : [];
  const preferencePages = (
    Array.isArray(preferenceData) ? preferenceData : (preferenceData.pages ?? [])
  ) as Array<{ frontmatter: Record<string, unknown> }>;
  const optedInUsers = new Set(
    preferencePages
      .map((page) => page.frontmatter)
      .filter((preference) => preference.enabled === true)
      .map((preference) => String(preference.user_email ?? ""))
      .filter(Boolean)
  );

  // 2. Filter to last 24h
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recentEvents = events.filter(
    (e) => optedInUsers.has(e.user_email) && new Date(e.started_at).getTime() >= cutoff
  );

  // 3. Group by user and generate suggestions
  const userGroups = new Map<string, ActivityEvent[]>();
  for (const event of recentEvents) {
    const existing = userGroups.get(event.user_email) ?? [];
    existing.push(event);
    userGroups.set(event.user_email, existing);
  }

  for (const [userEmail, userEvents] of userGroups) {
    const userSuggestions = generateTimeSuggestions(userEvents, userEmail);
    suggestions.push(...userSuggestions);

    // 4. Persist suggestions
    for (const suggestion of userSuggestions) {
      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: `legal/time-suggestions/${suggestion.id}`,
          title: `Zeitvorschlag: ${suggestion.date} ${suggestion.start_time}-${suggestion.end_time}`,
          type: "time_suggestion",
          frontmatter: suggestion,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    }
  }

  return NextResponse.json({
    processedAt: new Date().toISOString(),
    totalSuggestions: suggestions.length,
    suggestions,
  });
}

export const POST = createCronHandler(timeSuggestionsHandler, { maxDuration: 60 });
