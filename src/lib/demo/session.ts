/**
 * Public live-demo sessions — one row per anonymous visitor who opened
 * the product sandbox at /demo. Every session owns an isolated engine
 * source (demo-s-*) cloned from the demo-template source, so two visitors
 * can never see or mutate each other's data. Sessions expire after
 * DEMO_SESSION_TTL_SECONDS and their engine data is purged by the
 * demo-cleanup cron.
 *
 * Storage: web-app Postgres (subsumio_demo_sessions), in-memory fallback
 * for dev without a database — mirrors src/lib/concierge/store.ts.
 *
 * Budget: LLM-costly actions (chat queries, legal.* generators) consume
 * the per-session question budget; the cap doubles after the progressive
 * e-mail gate. This is the demo's denial-of-wallet guard on top of the
 * per-IP rate limits.
 */
import { randomUUID, createHash } from "node:crypto";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { env } from "@/lib/env";

// ENGINE_URL lives in @/lib/engine, but importing it here would create a
// module cycle (engine.ts → demo/session.ts → engine.ts) because
// engineContext() resolves demo sessions through this module.
const DEMO_ENGINE_URL = () => env("SUBSUMIO_API_URL") || "http://localhost:3001";

export const DEMO_SESSION_TTL_SECONDS = 60 * 60; // 1 hour
// Canonical value lives in src/content/demo-matter.ts (client-safe module);
// re-exported here so server callers keep their existing import site.
export { DEMO_QUESTIONS_FREE } from "@/content/demo-matter";
import { DEMO_QUESTIONS_FREE } from "@/content/demo-matter";
export const DEMO_QUESTIONS_AFTER_GATE = 15; // cap = 8 + 15 = 23
export const DEMO_MAX_ACTIVE_SESSIONS = 300;
/**
 * Global daily LLM budget across ALL demo sessions — the denial-of-wallet
 * ceiling. 3.000 questions ≈ 30 €/day at ~0,01 €/answer. Override via env.
 */
export const DEMO_DAILY_MAX_QUESTIONS = (): number => {
  const n = Number(env("DEMO_DAILY_MAX_QUESTIONS"));
  return Number.isFinite(n) && n > 0 ? n : 3000;
};
/** Cost assumption per answered question, for the ops cost estimate. */
export const DEMO_COST_PER_QUESTION_EUR = 0.01;

export type DemoPersona = "lawyer" | "assistant";
export type DemoJurisdiction = "at" | "de";

/**
 * Server-authoritative funnel events (first-party, no consent dependency —
 * session-scoped, no PII in props). Strictly ordered for the funnel:
 *   started → question → ingest → deadline_confirmed → cta → signup
 * The remaining events are side signals (drop-off diagnostics, budget).
 */
export const DEMO_EVENTS = [
  "started",
  "tour_step",
  "tour_skipped",
  "question",
  "cap_reached",
  "ingest",
  "deadline_confirmed",
  "gate",
  "cta",
  "reset",
  "expired",
  "signup",
] as const;
export type DemoEvent = (typeof DEMO_EVENTS)[number];

/** Events the browser may report via POST /api/demo/event (everything else
 * is written by the server route that performs the action). */
export const DEMO_CLIENT_EVENTS: readonly DemoEvent[] = [
  "tour_step",
  "tour_skipped",
  "deadline_confirmed",
  "cta",
];

export interface DemoSession {
  id: string;
  sourceId: string;
  persona: DemoPersona;
  jurisdiction: DemoJurisdiction;
  ref: string | null;
  questionsUsed: number;
  questionsCap: number;
  ingested: boolean;
  step: number;
  email: string | null;
  convertedUserId: string | null;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  deletedAt: string | null;
}

export interface DemoEventRow {
  sid: string;
  event: DemoEvent;
  step: number | null;
  props: Record<string, unknown>;
  createdAt: string;
}

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_demo_sessions (
     id text PRIMARY KEY,
     source_id text NOT NULL UNIQUE,
     persona text NOT NULL DEFAULT 'lawyer',
     ip_hash text,
     questions_used integer NOT NULL DEFAULT 0,
     questions_cap integer NOT NULL DEFAULT ${DEMO_QUESTIONS_FREE},
     ingested boolean NOT NULL DEFAULT false,
     step integer NOT NULL DEFAULT 0,
     email text,
     created_at timestamptz NOT NULL DEFAULT now(),
     expires_at timestamptz NOT NULL,
     deleted_at timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS subsumio_demo_sessions_expiry
     ON subsumio_demo_sessions (expires_at) WHERE deleted_at IS NULL`,
  // Additive columns (analytics segmentation + conversion attribution).
  `ALTER TABLE subsumio_demo_sessions ADD COLUMN IF NOT EXISTS jurisdiction text NOT NULL DEFAULT 'at'`,
  `ALTER TABLE subsumio_demo_sessions ADD COLUMN IF NOT EXISTS ref text`,
  `ALTER TABLE subsumio_demo_sessions ADD COLUMN IF NOT EXISTS converted_user_id text`,
  `ALTER TABLE subsumio_demo_sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now()`,
  `CREATE INDEX IF NOT EXISTS subsumio_demo_sessions_created
     ON subsumio_demo_sessions (created_at)`,
  `CREATE TABLE IF NOT EXISTS subsumio_demo_events (
     id bigserial PRIMARY KEY,
     sid text NOT NULL,
     event text NOT NULL,
     step integer,
     props jsonb NOT NULL DEFAULT '{}'::jsonb,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS subsumio_demo_events_created
     ON subsumio_demo_events (created_at)`,
  `CREATE INDEX IF NOT EXISTS subsumio_demo_events_sid
     ON subsumio_demo_events (sid, event)`,
  // Tour steps are idempotent per session — a reload must not double-count.
  `CREATE UNIQUE INDEX IF NOT EXISTS subsumio_demo_events_tour_step_uniq
     ON subsumio_demo_events (sid, step) WHERE event = 'tour_step'`,
]);

const memorySessions = new Map<string, DemoSession>();
const memoryEvents: DemoEventRow[] = [];

interface SessionRow {
  id: string;
  source_id: string;
  persona: string;
  jurisdiction: string | null;
  ref: string | null;
  questions_used: number;
  questions_cap: number;
  ingested: boolean;
  step: number;
  email: string | null;
  converted_user_id: string | null;
  created_at: Date | string;
  expires_at: Date | string;
  last_seen_at: Date | string | null;
  deleted_at: Date | string | null;
}

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : String(v));

function rowToSession(r: SessionRow): DemoSession {
  return {
    id: r.id,
    sourceId: r.source_id,
    persona: r.persona === "assistant" ? "assistant" : "lawyer",
    jurisdiction: r.jurisdiction === "de" ? "de" : "at",
    ref: r.ref ?? null,
    questionsUsed: Number(r.questions_used),
    questionsCap: Number(r.questions_cap),
    ingested: Boolean(r.ingested),
    step: Number(r.step),
    email: r.email,
    convertedUserId: r.converted_user_id ?? null,
    createdAt: iso(r.created_at),
    expiresAt: iso(r.expires_at),
    lastSeenAt: r.last_seen_at ? iso(r.last_seen_at) : iso(r.created_at),
    deletedAt: r.deleted_at ? iso(r.deleted_at) : null,
  };
}

/**
 * Sales/campaign attribution tag from `/demo?ref=…`. Whitelist-sanitized
 * (lowercase slug, ≤32 chars) so it can be grouped safely in the ops UI.
 */
export function sanitizeDemoRef(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(v) ? v : null;
}

/**
 * Append a funnel event. Never throws — analytics must not break the demo.
 * `tour_step` is deduplicated per (sid, step) via the partial unique index.
 */
export async function recordDemoEvent(
  sid: string,
  event: DemoEvent,
  opts: { step?: number | null; props?: Record<string, unknown> } = {}
): Promise<void> {
  const row: DemoEventRow = {
    sid,
    event,
    step: opts.step ?? null,
    props: opts.props ?? {},
    createdAt: new Date().toISOString(),
  };
  const pool = getSharedPgPool();
  if (!pool) {
    if (
      event === "tour_step" &&
      memoryEvents.some((e) => e.sid === sid && e.event === "tour_step" && e.step === row.step)
    ) {
      return;
    }
    memoryEvents.push(row);
    const s = memorySessions.get(sid);
    if (s) s.lastSeenAt = row.createdAt;
    return;
  }
  try {
    await ensureSchema();
    await pool.query(
      `INSERT INTO subsumio_demo_events (sid, event, step, props)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT DO NOTHING`,
      [sid, event, row.step, JSON.stringify(row.props)]
    );
    await pool.query(`UPDATE subsumio_demo_sessions SET last_seen_at = now() WHERE id = $1`, [sid]);
  } catch {
    // analytics is best-effort
  }
}

/** Test/dev accessor for the memory fallback (analytics unit tests). */
export function __memoryDemoState(): { sessions: DemoSession[]; events: DemoEventRow[] } {
  return { sessions: [...memorySessions.values()], events: [...memoryEvents] };
}

export function __resetMemoryDemoState(): void {
  memorySessions.clear();
  memoryEvents.length = 0;
}

/** Stable, non-reversible IP fingerprint for the daily per-IP budget. */
export function hashDemoIp(ip: string): string {
  return createHash("sha256")
    .update(`${ip}:${env("AUTH_SECRET") ?? "demo"}`)
    .digest("hex")
    .slice(0, 24);
}

export async function createDemoSessionRecord(
  persona: DemoPersona,
  ipHash: string,
  opts: { jurisdiction?: DemoJurisdiction; ref?: string | null } = {}
): Promise<DemoSession> {
  const id = randomUUID();
  const sourceId = `demo-s-${id.replace(/-/g, "").slice(0, 12)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEMO_SESSION_TTL_SECONDS * 1000);
  const jurisdiction: DemoJurisdiction = opts.jurisdiction === "de" ? "de" : "at";
  const ref = sanitizeDemoRef(opts.ref);
  const session: DemoSession = {
    id,
    sourceId,
    persona,
    jurisdiction,
    ref,
    questionsUsed: 0,
    questionsCap: DEMO_QUESTIONS_FREE,
    ingested: false,
    step: 0,
    email: null,
    convertedUserId: null,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastSeenAt: now.toISOString(),
    deletedAt: null,
  };
  const pool = getSharedPgPool();
  if (!pool) {
    memorySessions.set(id, session);
  } else {
    await ensureSchema();
    await pool.query(
      `INSERT INTO subsumio_demo_sessions
         (id, source_id, persona, jurisdiction, ref, ip_hash, questions_cap, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        sourceId,
        persona,
        jurisdiction,
        ref,
        ipHash,
        DEMO_QUESTIONS_FREE,
        expiresAt.toISOString(),
      ]
    );
  }
  await recordDemoEvent(id, "started", { props: { persona, jurisdiction, ref } });
  return session;
}

/** Questions answered across all demo sessions today (Europe/Vienna day). */
export async function countDemoQuestionsToday(): Promise<number> {
  const pool = getSharedPgPool();
  if (!pool) {
    const start = viennaDayStart(new Date()).getTime();
    return memoryEvents.filter(
      (e) => e.event === "question" && new Date(e.createdAt).getTime() >= start
    ).length;
  }
  await ensureSchema();
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM subsumio_demo_events
     WHERE event = 'question'
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Vienna') AT TIME ZONE 'Europe/Vienna'`
  );
  return Number(rows[0]?.n ?? 0);
}

/** Midnight of the given instant in Europe/Vienna, as a UTC Date. */
export function viennaDayStart(d: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // YYYY-MM-DD
  // Offset lookup: format the same instant's hour in Vienna vs UTC.
  const local = new Date(`${parts}T00:00:00Z`);
  const viennaHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Vienna",
      hour: "2-digit",
      hour12: false,
    }).format(local)
  );
  return new Date(local.getTime() - viennaHour * 3_600_000);
}

export async function getDemoSession(id: string): Promise<DemoSession | null> {
  const pool = getSharedPgPool();
  if (!pool) return memorySessions.get(id) ?? null;
  await ensureSchema();
  const { rows } = await pool.query<SessionRow>(
    `SELECT * FROM subsumio_demo_sessions WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function updateDemoSession(
  id: string,
  patch: Partial<
    Pick<
      DemoSession,
      "questionsCap" | "ingested" | "step" | "email" | "deletedAt" | "convertedUserId"
    >
  >
): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    const s = memorySessions.get(id);
    if (s) Object.assign(s, patch);
    return;
  }
  await ensureSchema();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.questionsCap !== undefined) {
    sets.push(`questions_cap = $${vals.length + 2}`);
    vals.push(patch.questionsCap);
  }
  if (patch.ingested !== undefined) {
    sets.push(`ingested = $${vals.length + 2}`);
    vals.push(patch.ingested);
  }
  if (patch.step !== undefined) {
    sets.push(`step = $${vals.length + 2}`);
    vals.push(patch.step);
  }
  if (patch.email !== undefined) {
    sets.push(`email = $${vals.length + 2}`);
    vals.push(patch.email);
  }
  if (patch.deletedAt !== undefined) {
    sets.push(`deleted_at = $${vals.length + 2}`);
    vals.push(patch.deletedAt);
  }
  if (patch.convertedUserId !== undefined) {
    sets.push(`converted_user_id = $${vals.length + 2}`);
    vals.push(patch.convertedUserId);
  }
  if (sets.length === 0) return;
  await pool.query(`UPDATE subsumio_demo_sessions SET ${sets.join(", ")} WHERE id = $1`, [
    id,
    ...vals,
  ]);
}

/**
 * Consume one unit of the session's LLM budget. Returns the post-call
 * state; when allowed is false nothing was consumed.
 */
export async function consumeDemoBudget(
  id: string
): Promise<{ allowed: boolean; used: number; cap: number; reason?: "session" | "daily" }> {
  // Global ceiling first — cheap count, protects the wallet even if a
  // single session's cap were somehow bypassed.
  if ((await countDemoQuestionsToday()) >= DEMO_DAILY_MAX_QUESTIONS()) {
    const s = await getDemoSession(id);
    return {
      allowed: false,
      reason: "daily",
      used: s?.questionsUsed ?? 0,
      cap: s?.questionsCap ?? DEMO_QUESTIONS_FREE,
    };
  }
  const pool = getSharedPgPool();
  if (!pool) {
    const s = memorySessions.get(id);
    if (!s) return { allowed: false, used: 0, cap: 0, reason: "session" };
    if (s.questionsUsed >= s.questionsCap) {
      await recordDemoEvent(id, "cap_reached", { props: { cap: s.questionsCap } });
      return { allowed: false, used: s.questionsUsed, cap: s.questionsCap, reason: "session" };
    }
    s.questionsUsed += 1;
    await recordDemoEvent(id, "question", { props: { n: s.questionsUsed } });
    return { allowed: true, used: s.questionsUsed, cap: s.questionsCap };
  }
  await ensureSchema();
  // Atomic increment-under-cap: the WHERE clause is the budget check.
  const { rows } = await pool.query<{ questions_used: number; questions_cap: number }>(
    `UPDATE subsumio_demo_sessions
       SET questions_used = questions_used + 1
     WHERE id = $1 AND questions_used < questions_cap AND deleted_at IS NULL
     RETURNING questions_used, questions_cap`,
    [id]
  );
  if (!rows[0]) {
    const s = await getDemoSession(id);
    if (s) await recordDemoEvent(id, "cap_reached", { props: { cap: s.questionsCap } });
    return {
      allowed: false,
      reason: "session",
      used: s?.questionsUsed ?? 0,
      cap: s?.questionsCap ?? DEMO_QUESTIONS_FREE,
    };
  }
  const used = Number(rows[0].questions_used);
  await recordDemoEvent(id, "question", { props: { n: used } });
  return { allowed: true, used, cap: Number(rows[0].questions_cap) };
}

/** Active (non-deleted, non-expired) sessions — for the capacity gate. */
export async function countActiveDemoSessions(): Promise<number> {
  const pool = getSharedPgPool();
  if (!pool) {
    const now = Date.now();
    let n = 0;
    for (const s of memorySessions.values()) {
      if (!s.deletedAt && new Date(s.expiresAt).getTime() > now) n++;
    }
    return n;
  }
  await ensureSchema();
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM subsumio_demo_sessions
     WHERE deleted_at IS NULL AND expires_at > now()`
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Raw dataset for analytics — sessions created inside `range` plus every
 * event belonging to them (events may postdate `range.to` by up to the
 * session TTL; that's fine for funnel attribution). Shared PG/memory
 * shapes keep the ops dashboard and the unit tests on one code path.
 */
export async function loadDemoDataset(range?: {
  from: Date;
  to: Date;
}): Promise<{ sessions: DemoSession[]; events: DemoEventRow[] }> {
  const pool = getSharedPgPool();
  if (!pool) {
    const inRange = (isoDate: string) => {
      if (!range) return true;
      const t = new Date(isoDate).getTime();
      return t >= range.from.getTime() && t < range.to.getTime();
    };
    const sessions = [...memorySessions.values()].filter((s) => inRange(s.createdAt));
    const sids = new Set(sessions.map((s) => s.id));
    return { sessions, events: memoryEvents.filter((e) => sids.has(e.sid)) };
  }
  await ensureSchema();
  const from = range?.from.toISOString() ?? "1970-01-01T00:00:00Z";
  const to = range?.to.toISOString() ?? "2999-01-01T00:00:00Z";
  const { rows: sessionRows } = await pool.query<SessionRow>(
    `SELECT * FROM subsumio_demo_sessions
     WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at DESC`,
    [from, to]
  );
  const sessions = sessionRows.map(rowToSession);
  if (sessions.length === 0) return { sessions, events: [] };
  const { rows: eventRows } = await pool.query<{
    sid: string;
    event: string;
    step: number | null;
    props: Record<string, unknown> | string;
    created_at: Date | string;
  }>(
    `SELECT e.sid, e.event, e.step, e.props, e.created_at
       FROM subsumio_demo_events e
       JOIN subsumio_demo_sessions s ON s.id = e.sid
      WHERE s.created_at >= $1 AND s.created_at < $2
      ORDER BY e.created_at ASC`,
    [from, to]
  );
  const events: DemoEventRow[] = eventRows.map((r) => ({
    sid: r.sid,
    event: (DEMO_EVENTS as readonly string[]).includes(r.event)
      ? (r.event as DemoEvent)
      : "started",
    step: r.step,
    props: typeof r.props === "string" ? JSON.parse(r.props) : (r.props ?? {}),
    createdAt: iso(r.created_at),
  }));
  return { sessions, events };
}

/** Ordered event timeline for one session — powers the expandable
 * per-session view in /ops/demo (why did this visitor drop off?). */
export async function listDemoSessionEvents(sid: string): Promise<DemoEventRow[]> {
  const pool = getSharedPgPool();
  if (!pool) {
    return memoryEvents.filter((e) => e.sid === sid);
  }
  await ensureSchema();
  const { rows } = await pool.query<{
    sid: string;
    event: string;
    step: number | null;
    props: Record<string, unknown> | string;
    created_at: Date | string;
  }>(
    `SELECT sid, event, step, props, created_at
       FROM subsumio_demo_events WHERE sid = $1 ORDER BY created_at ASC`,
    [sid]
  );
  return rows.map((r) => ({
    sid: r.sid,
    event: (DEMO_EVENTS as readonly string[]).includes(r.event)
      ? (r.event as DemoEvent)
      : "started",
    step: r.step,
    props: typeof r.props === "string" ? JSON.parse(r.props) : (r.props ?? {}),
    createdAt: iso(r.created_at),
  }));
}

/** Sessions past their TTL that still have engine data — for the cron. */
export async function listExpiredDemoSessions(limit = 100): Promise<DemoSession[]> {
  const pool = getSharedPgPool();
  if (!pool) {
    const now = Date.now();
    return [...memorySessions.values()]
      .filter((s) => !s.deletedAt && new Date(s.expiresAt).getTime() <= now)
      .slice(0, limit);
  }
  await ensureSchema();
  const { rows } = await pool.query<SessionRow>(
    `SELECT * FROM subsumio_demo_sessions
     WHERE deleted_at IS NULL AND expires_at <= now()
     ORDER BY expires_at ASC LIMIT $1`,
    [limit]
  );
  return rows.map(rowToSession);
}

// ── Engine helpers ──────────────────────────────────────────────────

function engineApiHeaders(source: string): Record<string, string> {
  const headers: Record<string, string> = { "x-subsumio-source": source };
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;
  return headers;
}

/**
 * Clone the demo-template source into a fresh per-session source.
 * `slugs` restricts the copy (e.g. only the inbox stage on the guided
 * intake step). Pure SQL on the engine side — no embeddings, no LLM.
 */
export async function cloneDemoSource(
  targetSourceId: string,
  slugs?: string[],
  template: string = env("SUBSUMIO_DEMO_TEMPLATE") || "demo-template"
): Promise<boolean> {
  try {
    const res = await fetch(`${DEMO_ENGINE_URL()}/api/sources/clone`, {
      method: "POST",
      headers: { ...engineApiHeaders(targetSourceId), "Content-Type": "application/json" },
      body: JSON.stringify({ from: template, to: targetSourceId, ...(slugs ? { slugs } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { cloned?: { pages?: number } };
    return (data.cloned?.pages ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Hard-delete every page of a demo source (reset + expiry cleanup). */
export async function purgeDemoSource(sourceId: string): Promise<void> {
  try {
    await fetch(`${DEMO_ENGINE_URL()}/api/source-data`, {
      method: "DELETE",
      headers: engineApiHeaders(sourceId),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // best-effort — the cron retries on the next run for expired rows
  }
}
