/**
 * Demo-funnel analytics — the operator-facing measurement layer for the
 * public live demo (/ops/demo). All computation is pure over a dataset of
 * { sessions, events } loaded via loadDemoDataset(), so Postgres and the
 * in-memory dev fallback share one code path and the unit tests exercise
 * the exact production logic.
 *
 * Metric definitions follow the interactive-demo industry standard
 * (Navattic/HowdyGo funnel definitions):
 *   engagement  = sessions with ≥1 event beyond "started" / sessions
 *   completion  = sessions that saw the last tour chapter / sessions
 *   ctaCtr      = sessions with a CTA click / engaged sessions
 *   gateLeads   = sessions that submitted the e-mail gate
 *   signups     = sessions attributed to a created account
 *
 * The funnel is STRICT-ORDERED: a stage counts only if the session reached
 * every previous stage first (first-occurrence timestamps). That makes
 * drop-off honest — a visitor who skips the question step and goes
 * straight to intake shows up as drop-off at "question", not as a silent
 * stage-3 success.
 */
import { getSharedPgPool } from "@/lib/auth/store";
import {
  DEMO_COST_PER_QUESTION_EUR,
  DEMO_DAILY_MAX_QUESTIONS,
  DEMO_MAX_ACTIVE_SESSIONS,
  countActiveDemoSessions,
  countDemoQuestionsToday,
  loadDemoDataset,
  type DemoEventRow,
  type DemoSession,
} from "./session";

// ── Ranges ────────────────────────────────────────────────────────────

export type DemoRangeKey = "24h" | "7d" | "30d" | "90d";
export const DEMO_RANGE_KEYS: DemoRangeKey[] = ["24h", "7d", "30d", "90d"];

export interface DemoRange {
  key: DemoRangeKey;
  from: Date;
  to: Date;
  /** Previous window of equal length — the delta baseline. */
  prevFrom: Date;
  prevTo: Date;
}

export function demoRangeFor(key: DemoRangeKey, now: Date = new Date()): DemoRange {
  const ms =
    key === "24h"
      ? 86_400_000
      : key === "7d"
        ? 7 * 86_400_000
        : key === "30d"
          ? 30 * 86_400_000
          : 90 * 86_400_000;
  const to = now;
  const from = new Date(now.getTime() - ms);
  return { key, from, to, prevFrom: new Date(from.getTime() - ms), prevTo: from };
}

/** Top-quartile industry benchmarks for interactive demos (HowdyGo,
 *  Navattic 2026 benchmark reports) — surfaced as tooltips in the UI so
 *  operators can grade the funnel without leaving the page. */
export const DEMO_BENCHMARKS = {
  engagementPct: 55,
  completionPct: 30,
  ctaCtrPct: 15,
} as const;

// ── Funnel ────────────────────────────────────────────────────────────

export const FUNNEL_STAGES = [
  "started",
  "question",
  "ingest",
  "deadline_confirmed",
  "cta",
  "signup",
] as const;
export type FunnelStageKey = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_STAGE_LABELS: Record<FunnelStageKey, string> = {
  started: "Demo gestartet",
  question: "Frage gestellt",
  ingest: "Dokument aufgenommen",
  deadline_confirmed: "Frist bestätigt",
  cta: "Signup geklickt",
  signup: "Registriert",
};

export interface FunnelStage {
  key: FunnelStageKey;
  label: string;
  count: number;
  /** Conversion from the previous stage (null for the first stage). */
  stepConvPct: number | null;
  /** Conversion relative to stage 1 (sessions). */
  cumConvPct: number;
  /** Median seconds from session start until this stage was reached. */
  medianSecondsToReach: number | null;
}

interface SessionTimeline {
  first: Map<string, number>; // event → first occurrence (ms)
  maxTourStep: number;
}

function timelines(events: DemoEventRow[]): Map<string, SessionTimeline> {
  const map = new Map<string, SessionTimeline>();
  for (const e of events) {
    let tl = map.get(e.sid);
    if (!tl) {
      tl = { first: new Map(), maxTourStep: -1 };
      map.set(e.sid, tl);
    }
    const t = new Date(e.createdAt).getTime();
    const prev = tl.first.get(e.event);
    if (prev === undefined || t < prev) tl.first.set(e.event, t);
    if (e.event === "tour_step" && e.step !== null && e.step > tl.maxTourStep) {
      tl.maxTourStep = e.step;
    }
  }
  return map;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeFunnel(sessions: DemoSession[], events: DemoEventRow[]): FunnelStage[] {
  const tl = timelines(events);
  // Strict ordering: session counts at stage i iff it reached all stages
  // 0..i in non-decreasing time order.
  const reached: Map<FunnelStageKey, string[]> = new Map(FUNNEL_STAGES.map((s) => [s, []]));
  for (const s of sessions) {
    const t = tl.get(s.id);
    if (!t) continue; // session exists but wrote no events — impossible in practice
    let lastT = -Infinity;
    for (const stage of FUNNEL_STAGES) {
      const at = t.first.get(stage);
      if (at === undefined || at < lastT) break;
      reached.get(stage)!.push(s.id);
      lastT = at;
    }
  }
  const base = Math.max(1, reached.get("started")!.length);
  return FUNNEL_STAGES.map((key, i) => {
    const ids = reached.get(key)!;
    const prevCount = i === 0 ? null : Math.max(1, reached.get(FUNNEL_STAGES[i - 1])!.length);
    const deltas: number[] = [];
    for (const sid of ids) {
      const t = tl.get(sid)!;
      const t0 = t.first.get("started")!;
      deltas.push((t.first.get(key)! - t0) / 1000);
    }
    return {
      key,
      label: FUNNEL_STAGE_LABELS[key],
      count: ids.length,
      stepConvPct: prevCount === null ? null : Math.round((ids.length / prevCount) * 1000) / 10,
      cumConvPct: Math.round((ids.length / base) * 1000) / 10,
      medianSecondsToReach: median(deltas),
    };
  });
}

// ── Scorecards ────────────────────────────────────────────────────────

export interface DemoSummary {
  sessions: number;
  engagedSessions: number;
  engagementPct: number | null;
  completedSessions: number;
  completionPct: number | null;
  ctaClicks: number;
  ctaCtrPct: number | null;
  gateLeads: number;
  signups: number;
  signupRatePct: number | null;
  questions: number;
}

export function computeSummary(sessions: DemoSession[], events: DemoEventRow[]): DemoSummary {
  const tl = timelines(events);
  let engaged = 0;
  let completed = 0;
  let cta = 0;
  let signups = 0;
  let gateLeads = 0;
  let questions = 0;
  for (const s of sessions) {
    const t = tl.get(s.id);
    const evs = t?.first;
    const hasEngagement = !!evs && [...evs.keys()].some((k) => k !== "started");
    if (hasEngagement) engaged++;
    if ((t?.maxTourStep ?? -1) >= 3 || evs?.has("cta") || evs?.has("signup")) completed++;
    if (evs?.has("cta") || evs?.has("signup")) cta++;
    if (evs?.has("signup") || s.convertedUserId) signups++;
    if (evs?.has("gate") || s.email) gateLeads++;
    questions += s.questionsUsed;
  }
  const n = sessions.length;
  const pct = (x: number, d: number) => (d > 0 ? Math.round((x / d) * 1000) / 10 : null);
  return {
    sessions: n,
    engagedSessions: engaged,
    engagementPct: pct(engaged, n),
    completedSessions: completed,
    completionPct: pct(completed, n),
    ctaClicks: cta,
    ctaCtrPct: pct(cta, engaged),
    gateLeads,
    signups,
    signupRatePct: pct(signups, n),
    questions,
  };
}

export interface DemoSummaryDelta {
  current: DemoSummary;
  previous: DemoSummary;
}

// ── Segments ──────────────────────────────────────────────────────────

export type DemoSegmentBy = "persona" | "jurisdiction" | "ref";

export interface DemoSegmentRow {
  key: string;
  sessions: number;
  engagementPct: number | null;
  completionPct: number | null;
  gateLeads: number;
  signups: number;
}

export function computeSegments(
  sessions: DemoSession[],
  events: DemoEventRow[],
  by: DemoSegmentBy
): DemoSegmentRow[] {
  const groups = new Map<string, DemoSession[]>();
  for (const s of sessions) {
    const key =
      by === "persona" ? s.persona : by === "jurisdiction" ? s.jurisdiction : (s.ref ?? "direkt");
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  const rows: DemoSegmentRow[] = [];
  for (const [key, group] of groups) {
    const ids = new Set(group.map((s) => s.id));
    const sum = computeSummary(
      group,
      events.filter((e) => ids.has(e.sid))
    );
    rows.push({
      key,
      sessions: sum.sessions,
      engagementPct: sum.engagementPct,
      completionPct: sum.completionPct,
      gateLeads: sum.gateLeads,
      signups: sum.signups,
    });
  }
  return rows.sort((a, b) => b.sessions - a.sessions);
}

// ── Timeseries (Europe/Vienna day buckets) ────────────────────────────

export interface DemoDayBucket {
  day: string; // YYYY-MM-DD in Europe/Vienna
  sessions: number;
  questions: number;
  gateLeads: number;
  signups: number;
}

const viennaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Vienna",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function computeTimeseries(
  sessions: DemoSession[],
  events: DemoEventRow[],
  range: DemoRange
): DemoDayBucket[] {
  const buckets = new Map<string, DemoDayBucket>();
  const bucket = (isoTs: string): DemoDayBucket => {
    const day = viennaDay.format(new Date(isoTs));
    let b = buckets.get(day);
    if (!b) {
      b = { day, sessions: 0, questions: 0, gateLeads: 0, signups: 0 };
      buckets.set(day, b);
    }
    return b;
  };
  // Pre-fill every day in range so the chart has no gaps.
  for (let t = range.from.getTime(); t < range.to.getTime(); t += 86_400_000) {
    bucket(new Date(t).toISOString());
  }
  for (const s of sessions) {
    bucket(s.createdAt).sessions++;
  }
  // Gate/signup count at the day they HAPPENED (event time), not at
  // session start — a session can convert hours after creation.
  for (const e of events) {
    if (e.event === "question") bucket(e.createdAt).questions++;
    else if (e.event === "gate") bucket(e.createdAt).gateLeads++;
    else if (e.event === "signup") bucket(e.createdAt).signups++;
  }
  return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// ── Capacity & cost ───────────────────────────────────────────────────

export interface DemoCapacity {
  activeSessions: number;
  maxActiveSessions: number;
  questionsToday: number;
  dailyQuestionCap: number;
  estimatedCostTodayEur: number;
  pendingPurge: number;
  /** true when the dataset came from Postgres; false = in-memory dev. */
  persistent: boolean;
}

export async function getDemoCapacity(): Promise<DemoCapacity> {
  const pool = getSharedPgPool();
  let pendingPurge = 0;
  if (pool) {
    try {
      const { rows } = await pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM subsumio_demo_sessions
         WHERE deleted_at IS NULL AND expires_at <= now()`
      );
      pendingPurge = Number(rows[0]?.n ?? 0);
    } catch {
      pendingPurge = 0;
    }
  }
  const questionsToday = await countDemoQuestionsToday();
  return {
    activeSessions: await countActiveDemoSessions(),
    maxActiveSessions: DEMO_MAX_ACTIVE_SESSIONS,
    questionsToday,
    dailyQuestionCap: DEMO_DAILY_MAX_QUESTIONS(),
    estimatedCostTodayEur: Math.round(questionsToday * DEMO_COST_PER_QUESTION_EUR * 100) / 100,
    pendingPurge,
    persistent: Boolean(pool),
  };
}

// ── Recent sessions & leads ───────────────────────────────────────────

export interface RecentDemoSession {
  sid: string;
  startedAt: string;
  durationSec: number;
  persona: string;
  jurisdiction: string;
  ref: string | null;
  questionsUsed: number;
  /** Deepest funnel stage reached (strict order). */
  stage: FunnelStageKey | null;
  gate: boolean;
  converted: boolean;
  expired: boolean;
}

function deepestStage(s: DemoSession, tl: SessionTimeline | undefined): FunnelStageKey | null {
  if (!tl) return null;
  let lastT = -Infinity;
  let deepest: FunnelStageKey | null = null;
  for (const stage of FUNNEL_STAGES) {
    const at = tl.first.get(stage);
    if (at === undefined || at < lastT) break;
    deepest = stage;
    lastT = at;
  }
  return deepest;
}

export function computeRecent(
  sessions: DemoSession[],
  events: DemoEventRow[],
  limit = 50
): RecentDemoSession[] {
  const tl = timelines(events);
  return [...sessions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((s) => ({
      sid: s.id,
      startedAt: s.createdAt,
      durationSec: Math.max(
        0,
        Math.round((new Date(s.lastSeenAt).getTime() - new Date(s.createdAt).getTime()) / 1000)
      ),
      persona: s.persona,
      jurisdiction: s.jurisdiction,
      ref: s.ref,
      questionsUsed: s.questionsUsed,
      stage: deepestStage(s, tl.get(s.id)),
      gate: Boolean(s.email),
      converted: Boolean(s.convertedUserId),
      expired: Boolean(s.deletedAt) || new Date(s.expiresAt).getTime() <= Date.now(),
    }));
}

export interface DemoLead {
  sid: string;
  email: string;
  persona: string;
  jurisdiction: string;
  ref: string | null;
  questionsUsed: number;
  score: number;
  converted: boolean;
  createdAt: string;
}

/**
 * Intent score 0–100: gate +15, ingest +10, deadline confirm +10,
 * CTA +15, each question +2, signup +50. Mirrors the "engagement depth
 * predicts pipeline" pattern from interactive-demo benchmarks.
 */
export function computeLeads(sessions: DemoSession[], events: DemoEventRow[]): DemoLead[] {
  const tl = timelines(events);
  return sessions
    .filter((s) => s.email)
    .map((s) => {
      const evs = tl.get(s.id)?.first;
      let score = Math.min(20, s.questionsUsed * 2);
      if (evs?.has("gate") || s.email) score += 15;
      if (evs?.has("ingest")) score += 10;
      if (evs?.has("deadline_confirmed")) score += 10;
      if (evs?.has("cta")) score += 15;
      if (evs?.has("signup") || s.convertedUserId) score += 50;
      return {
        sid: s.id,
        email: s.email!,
        persona: s.persona,
        jurisdiction: s.jurisdiction,
        ref: s.ref,
        questionsUsed: s.questionsUsed,
        score: Math.min(100, score),
        converted: Boolean(s.convertedUserId),
        createdAt: s.createdAt,
      };
    })
    .sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
}

// ── Orchestrator ──────────────────────────────────────────────────────

export interface DemoAnalytics {
  range: DemoRange;
  persistent: boolean;
  summary: DemoSummary;
  previous: DemoSummary;
  funnel: FunnelStage[];
  segments: Record<DemoSegmentBy, DemoSegmentRow[]>;
  timeseries: DemoDayBucket[];
  recent: RecentDemoSession[];
  leads: DemoLead[];
}

export async function getDemoAnalytics(
  rangeKey: DemoRangeKey = "7d",
  now: Date = new Date()
): Promise<DemoAnalytics> {
  const range = demoRangeFor(rangeKey, now);
  const [cur, prev] = await Promise.all([
    loadDemoDataset({ from: range.from, to: range.to }),
    loadDemoDataset({ from: range.prevFrom, to: range.prevTo }),
  ]);
  return {
    range,
    persistent: Boolean(getSharedPgPool()),
    summary: computeSummary(cur.sessions, cur.events),
    previous: computeSummary(prev.sessions, prev.events),
    funnel: computeFunnel(cur.sessions, cur.events),
    segments: {
      persona: computeSegments(cur.sessions, cur.events, "persona"),
      jurisdiction: computeSegments(cur.sessions, cur.events, "jurisdiction"),
      ref: computeSegments(cur.sessions, cur.events, "ref"),
    },
    timeseries: computeTimeseries(cur.sessions, cur.events, range),
    recent: computeRecent(cur.sessions, cur.events, 50),
    leads: computeLeads(cur.sessions, cur.events),
  };
}
