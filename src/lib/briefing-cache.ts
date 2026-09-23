import { csrfFetch } from "@/lib/csrf";

/**
 * Same-day cache for the cockpit briefing (`POST /api/dashboard/briefing`).
 *
 * The briefing costs an LLM call. The morning briefing card and the copilot
 * sidebar both need it, so they share one localStorage entry instead of each
 * generating their own on every page load.
 */

export interface BriefingData {
  criticalDeadlines: number;
  overdueDeadlines: number;
  inboxItems: number;
  pendingReviews: number;
  pendingSignatures: number;
  openInvoices: number;
  activeCases: number;
  unassignedDocs: number;
  reviewGaps: number;
  overdueReconciliations: number;
  followUpsToday: number;
  activeDelegations: Array<{ name: string; delegate: string; until: string }>;
  topDeadlines: Array<{ title: string; due: string; daysLeft: number }>;
  topCases: Array<{ title: string; status: string }>;
}

export interface BriefingResponse {
  narrative: string;
  data: BriefingData;
  generatedAt: string;
  usedFallback: boolean;
}

export const BRIEFING_CACHE_KEY = "subsumio:morning-briefing";
export const BRIEFING_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export function readBriefingCache(now = Date.now()): BriefingResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BRIEFING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BriefingResponse & { cachedAt?: string };
    const age = now - new Date(parsed.cachedAt ?? 0).getTime();
    if (!Number.isFinite(age) || age > BRIEFING_CACHE_TTL_MS) return null;
    if (!parsed.data || typeof parsed.data !== "object") return null;
    parsed.data.activeDelegations ??= [];
    return parsed;
  } catch {
    return null;
  }
}

export function writeBriefingCache(briefing: BriefingResponse): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      BRIEFING_CACHE_KEY,
      JSON.stringify({ ...briefing, cachedAt: new Date().toISOString() })
    );
  } catch {
    // quota errors: the next load simply fetches again
  }
}

/** Unwrap the handler envelope (`{ data: BriefingResponse }`) or a bare response. */
export function briefingFromPayload(json: unknown): BriefingResponse | null {
  const outer = (json ?? {}) as { data?: unknown; narrative?: unknown };
  const candidate = (
    outer.data && typeof outer.data === "object" && "data" in (outer.data as object)
      ? outer.data
      : typeof outer.narrative === "string" || "data" in outer
        ? outer
        : null
  ) as BriefingResponse | null;
  if (!candidate || !candidate.data || typeof candidate.data !== "object") return null;
  candidate.data.activeDelegations ??= [];
  return candidate;
}

// One generation at a time: the morning-briefing card and the copilot mount
// together on the cockpit and would otherwise both miss the cache and both
// pay for an LLM call.
let briefingInflight: { lang: string; promise: Promise<BriefingResponse | null> } | null = null;

/**
 * Load today's briefing: cache first, then one shared request. `force`
 * bypasses the cache (the "neu erstellen" button) but still shares a request
 * that is already running.
 */
export function loadBriefing(
  lang: string,
  opts: { force?: boolean; timeoutMs?: number } = {}
): Promise<BriefingResponse | null> {
  if (!opts.force) {
    const cached = readBriefingCache();
    if (cached) return Promise.resolve(cached);
  }
  if (briefingInflight && briefingInflight.lang === lang) return briefingInflight.promise;
  const promise = (async () => {
    const res = await csrfFetch("/api/dashboard/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: lang }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 50_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const briefing = briefingFromPayload(await res.json());
    if (briefing) writeBriefingCache(briefing);
    return briefing;
  })().finally(() => {
    if (briefingInflight?.promise === promise) briefingInflight = null;
  });
  briefingInflight = { lang, promise };
  return promise;
}
