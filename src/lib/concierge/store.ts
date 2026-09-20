/**
 * Website concierge records: one row per chat turn (redacted question, the
 * answer as shown, its sources, what the claim check removed) and one row per
 * contact request a visitor submitted. Turns are for quality review and the
 * content-gap report; leads are sales follow-up. Web-app Postgres, in memory
 * without a database.
 *
 * Retention: turns are anonymous (random session id, no IP) and pruned after
 * 90 days; leads are kept until handled and then for the sales cycle.
 */
import { randomUUID } from "node:crypto";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";

export interface ConciergeTurnRecord {
  sessionId: string;
  page: string | null;
  question: string;
  answer: string;
  sources: string[];
  intent: string;
  nextStep: string | null;
  dropped: Array<{ text: string; reason: string }>;
  redacted: string[];
  model: string | null;
  /** True when no substantive, sourced answer could be given — the content-gap signal. */
  unanswered: boolean;
}

export type LeadKind = "callback" | "meeting" | "question" | "enterprise";
export type LeadStatus = "new" | "contacted" | "won" | "lost";

export interface LeadInput {
  kind: LeadKind;
  name: string;
  email: string;
  firm?: string;
  phone?: string;
  message?: string;
  preferredTime?: string;
  firmSize?: string;
  sessionId?: string;
  page?: string;
  profile?: Record<string, string>;
}

export interface Lead extends LeadInput {
  id: string;
  status: LeadStatus;
  createdAt: string;
  consentAt: string;
}

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_concierge_turns (
     id bigserial PRIMARY KEY,
     session_id text NOT NULL,
     page text,
     question text NOT NULL,
     answer text NOT NULL,
     sources jsonb NOT NULL DEFAULT '[]',
     intent text NOT NULL,
     next_step text,
     dropped jsonb NOT NULL DEFAULT '[]',
     redacted jsonb NOT NULL DEFAULT '[]',
     model text,
     unanswered boolean NOT NULL DEFAULT false,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS subsumio_concierge_turns_created ON subsumio_concierge_turns (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS subsumio_concierge_turns_session ON subsumio_concierge_turns (session_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS subsumio_leads (
     id text PRIMARY KEY,
     kind text NOT NULL,
     status text NOT NULL DEFAULT 'new',
     name text NOT NULL,
     email text NOT NULL,
     firm text,
     phone text,
     message text,
     preferred_time text,
     firm_size text,
     session_id text,
     page text,
     profile jsonb NOT NULL DEFAULT '{}',
     consent_at timestamptz NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS subsumio_leads_created ON subsumio_leads (created_at DESC)`,
]);

const memoryTurns: Array<ConciergeTurnRecord & { createdAt: string }> = [];
const memoryLeads: Lead[] = [];

const RETENTION_DAYS = 90;

export async function saveTurn(t: ConciergeTurnRecord): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    memoryTurns.push({ ...t, createdAt: new Date().toISOString() });
    if (memoryTurns.length > 2000) memoryTurns.shift();
    return;
  }
  await ensureSchema();
  await pool.query(
    `INSERT INTO subsumio_concierge_turns
       (session_id, page, question, answer, sources, intent, next_step, dropped, redacted, model, unanswered)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, $10, $11)`,
    [
      t.sessionId,
      t.page,
      t.question,
      t.answer,
      // node-postgres sends JS arrays as Postgres arrays; jsonb needs the JSON text.
      JSON.stringify(t.sources),
      t.intent,
      t.nextStep,
      JSON.stringify(t.dropped),
      JSON.stringify(t.redacted),
      t.model,
      t.unanswered,
    ]
  );
  // Cheap retention: prune occasionally instead of running a job.
  if (Math.random() < 0.01) {
    await pool
      .query(
        `DELETE FROM subsumio_concierge_turns WHERE created_at < now() - ($1 || ' days')::interval`,
        [String(RETENTION_DAYS)]
      )
      .catch(() => {});
  }
}

export async function sessionTranscript(
  sessionId: string
): Promise<Array<{ question: string; answer: string }>> {
  const pool = getSharedPgPool();
  if (!pool) {
    return memoryTurns
      .filter((t) => t.sessionId === sessionId)
      .map(({ question, answer }) => ({ question, answer }));
  }
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT question, answer FROM subsumio_concierge_turns
      WHERE session_id = $1 ORDER BY created_at ASC LIMIT 40`,
    [sessionId]
  );
  return rows as Array<{ question: string; answer: string }>;
}

export async function saveLead(input: LeadInput): Promise<Lead> {
  const lead: Lead = {
    ...input,
    id: randomUUID(),
    status: "new",
    createdAt: new Date().toISOString(),
    consentAt: new Date().toISOString(),
  };
  const pool = getSharedPgPool();
  if (!pool) {
    memoryLeads.unshift(lead);
    return lead;
  }
  await ensureSchema();
  await pool.query(
    `INSERT INTO subsumio_leads
       (id, kind, name, email, firm, phone, message, preferred_time, firm_size, session_id, page, profile, consent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
    [
      lead.id,
      lead.kind,
      lead.name,
      lead.email,
      lead.firm ?? null,
      lead.phone ?? null,
      lead.message ?? null,
      lead.preferredTime ?? null,
      lead.firmSize ?? null,
      lead.sessionId ?? null,
      lead.page ?? null,
      JSON.stringify(lead.profile ?? {}),
      lead.consentAt,
    ]
  );
  return lead;
}

interface LeadRow {
  id: string;
  kind: LeadKind;
  status: LeadStatus;
  name: string;
  email: string;
  firm: string | null;
  phone: string | null;
  message: string | null;
  preferred_time: string | null;
  firm_size: string | null;
  session_id: string | null;
  page: string | null;
  profile: Record<string, string> | null;
  consent_at: Date | string;
  created_at: Date | string;
}

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : String(v));

export async function listLeads(limit = 200): Promise<Lead[]> {
  const pool = getSharedPgPool();
  if (!pool) return memoryLeads.slice(0, limit);
  await ensureSchema();
  const { rows } = await pool.query<LeadRow>(
    `SELECT * FROM subsumio_leads ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    name: r.name,
    email: r.email,
    firm: r.firm ?? undefined,
    phone: r.phone ?? undefined,
    message: r.message ?? undefined,
    preferredTime: r.preferred_time ?? undefined,
    firmSize: r.firm_size ?? undefined,
    sessionId: r.session_id ?? undefined,
    page: r.page ?? undefined,
    profile: r.profile ?? undefined,
    consentAt: iso(r.consent_at),
    createdAt: iso(r.created_at),
  }));
}

export async function setLeadStatus(id: string, status: LeadStatus): Promise<boolean> {
  const pool = getSharedPgPool();
  if (!pool) {
    const lead = memoryLeads.find((l) => l.id === id);
    if (lead) lead.status = status;
    return Boolean(lead);
  }
  await ensureSchema();
  const res = await pool.query(`UPDATE subsumio_leads SET status = $2 WHERE id = $1`, [id, status]);
  return (res.rowCount ?? 0) > 0;
}

/** A visitor's own contact requests — for a data subject request (Art. 15). */
export async function leadsForEmail(email: string): Promise<Lead[]> {
  const needle = email.trim().toLowerCase();
  if (!needle) return [];
  const all = await listLeads(500);
  return all.filter((l) => l.email.trim().toLowerCase() === needle);
}

/** Delete one contact request (Art. 17). Returns false when it was already gone. */
export async function deleteLead(id: string): Promise<boolean> {
  const pool = getSharedPgPool();
  if (!pool) {
    const i = memoryLeads.findIndex((l) => l.id === id);
    if (i >= 0) memoryLeads.splice(i, 1);
    return i >= 0;
  }
  await ensureSchema();
  const res = await pool.query(`DELETE FROM subsumio_leads WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

export interface ConciergeStats {
  turns: number;
  unanswered: number;
  dropped: number;
  topUnanswered: Array<{ question: string; createdAt: string }>;
}

/** Last 30 days: volume, how often no sourced answer was possible, and the questions behind it. */
export async function conciergeStats(): Promise<ConciergeStats> {
  const pool = getSharedPgPool();
  if (!pool) {
    const unanswered = memoryTurns.filter((t) => t.unanswered);
    return {
      turns: memoryTurns.length,
      unanswered: unanswered.length,
      dropped: memoryTurns.reduce((s, t) => s + t.dropped.length, 0),
      topUnanswered: unanswered
        .slice(-20)
        .reverse()
        .map((t) => ({ question: t.question, createdAt: t.createdAt })),
    };
  }
  await ensureSchema();
  const [agg, gaps] = await Promise.all([
    pool.query<{ turns: string; unanswered: string; dropped: string }>(
      `SELECT count(*) AS turns,
              count(*) FILTER (WHERE unanswered) AS unanswered,
              coalesce(sum(jsonb_array_length(dropped)), 0) AS dropped
         FROM subsumio_concierge_turns WHERE created_at > now() - interval '30 days'`
    ),
    pool.query<{ question: string; created_at: Date | string }>(
      `SELECT question, created_at FROM subsumio_concierge_turns
        WHERE unanswered AND created_at > now() - interval '30 days'
        ORDER BY created_at DESC LIMIT 20`
    ),
  ]);
  const a = agg.rows[0];
  return {
    turns: Number(a?.turns ?? 0),
    unanswered: Number(a?.unanswered ?? 0),
    dropped: Number(a?.dropped ?? 0),
    topUnanswered: gaps.rows.map((r) => ({ question: r.question, createdAt: iso(r.created_at) })),
  };
}
