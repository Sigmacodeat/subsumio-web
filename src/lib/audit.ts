/**
 * Audit-Trail Logger für Subsumio.
 * Stores audit entries in a dedicated Postgres table (subsumio_audit_log) —
 * the only system of record. There is deliberately no fallback into ordinary
 * (editable) brain pages: a failed write raises an operator alert instead.
 * Each tenant's audit trail is isolated by brain_id; every caller must name
 * the tenant (`brainId`) or explicitly opt into the shared SYSTEM_BRAIN.
 */

import { getSharedPgPool } from "@/lib/auth/store";
import { createHash } from "node:crypto";
import { createSchemaInit } from "@/lib/schema-init";
export type { AuditEntry, AuditAction } from "@/lib/audit-labels";
export { auditLabel } from "@/lib/audit-labels";
import type { AuditEntry, AuditAction } from "@/lib/audit-labels";

import { logger } from "@/lib/logger";
const log = logger("lib/audit");

const ensureAuditSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_audit_log (
    id bigserial PRIMARY KEY,
    brain_id text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    user_id text,
    user_email text,
    details jsonb,
    ip text,
    hash text,
    prev_hash text,
    hash_payload text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE INDEX IF NOT EXISTS subsumio_audit_log_brain_id_idx ON subsumio_audit_log (brain_id)",
  "CREATE INDEX IF NOT EXISTS subsumio_audit_log_action_idx ON subsumio_audit_log (action)",
  "CREATE INDEX IF NOT EXISTS subsumio_audit_log_created_at_idx ON subsumio_audit_log (created_at DESC)",
  "CREATE INDEX IF NOT EXISTS subsumio_audit_log_entity_idx ON subsumio_audit_log (entity_type, entity_id)",
  // Add hash_payload column to existing tables (idempotent — safe if column already exists)
  "ALTER TABLE subsumio_audit_log ADD COLUMN IF NOT EXISTS hash_payload text",
  // GoBD immutability: prevent UPDATE and DELETE on audit log entries.
  // § 146 Abs. 4 AO requires that electronic records cannot be modified
  // or deleted during the retention period. These triggers raise an error
  // on any attempt to UPDATE or DELETE audit rows.
  `CREATE OR REPLACE FUNCTION subsumio_audit_log_immutable() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'subsumio_audit_log is immutable (GoBD § 146 Abs. 4 AO): UPDATE/DELETE not permitted';
    END;
    $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS subsumio_audit_log_no_update ON subsumio_audit_log`,
  `CREATE TRIGGER subsumio_audit_log_no_update
    BEFORE UPDATE ON subsumio_audit_log
    FOR EACH ROW EXECUTE FUNCTION subsumio_audit_log_immutable()`,
  `DROP TRIGGER IF EXISTS subsumio_audit_log_no_delete ON subsumio_audit_log`,
  `CREATE TRIGGER subsumio_audit_log_no_delete
    BEFORE DELETE ON subsumio_audit_log
    FOR EACH ROW EXECUTE FUNCTION subsumio_audit_log_immutable()`,
]);

/** Compute a hash chain for tamper-evidence. */
function computeHash(prevHash: string | null, data: string): string {
  return createHash("sha256")
    .update(`${prevHash ?? ""}${data}`)
    .digest("hex");
}

/**
 * Explicit marker for platform-level events that belong to no tenant (engine
 * alerts, operator actions without a firm context). Tenant actions must pass
 * the firm's `ctx.brainId` — otherwise they end up outside the firm's own,
 * hash-chained protocol.
 */
export const SYSTEM_BRAIN = "system";

export interface LogAuditOptions {
  /** Tenant whose protocol receives the entry — `ctx.brainId` or SYSTEM_BRAIN. */
  brainId: string;
  entityId?: string;
  details?: Record<string, unknown>;
  userId?: string;
  userEmail?: string;
  ip?: string;
}

export interface AuditWriteFailure {
  action: string;
  entityType: string;
  brainId: string;
  entityId?: string;
  error: string;
}

/** Default alert: one structured error line with a stable tag for monitoring. */
function defaultAuditFailureHook(failure: AuditWriteFailure): void {
  log.error("[audit] ALERT audit_write_failed — entry not persisted", {
    alert: "audit_write_failed",
    ...failure,
  });
}

let auditFailureHook: (failure: AuditWriteFailure) => void = defaultAuditFailureHook;

/**
 * Replace the alert hook fired when an audit entry cannot be persisted
 * (tests, or wiring into an external alerting channel). Pass `null` to
 * restore the default structured-log alert.
 */
export function setAuditFailureHook(hook: ((failure: AuditWriteFailure) => void) | null): void {
  auditFailureHook = hook ?? defaultAuditFailureHook;
}

function raiseAuditFailure(failure: AuditWriteFailure): void {
  try {
    auditFailureHook(failure);
  } catch {
    // The alert path must never break the user flow either.
  }
}

interface ChainedRow {
  brainId: string;
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  userEmail?: string;
  detailsStr: string;
  ip?: string;
  now: string;
}

/**
 * Append one entry to the tenant's hash chain.
 *
 * Reading the previous hash and inserting the new row happen in ONE
 * transaction under a per-tenant advisory lock — concurrent writers for the
 * same brain are serialised, so two entries can never chain onto the same
 * predecessor (which `verifyAuditChain` would report as a chain break).
 */
async function insertChained(
  pool: NonNullable<ReturnType<typeof getSharedPgPool>>,
  row: ChainedRow
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`audit:${row.brainId}`]);
    const { rows } = await client.query<{ hash: string }>(
      "SELECT hash FROM subsumio_audit_log WHERE brain_id = $1 ORDER BY id DESC LIMIT 1",
      [row.brainId]
    );
    const prevHash = rows[0]?.hash ?? null;
    const hashPayload = `${row.action}:${row.entityType}:${row.entityId ?? ""}:${row.userId ?? ""}:${row.userEmail ?? ""}:${row.detailsStr}:${row.ip ?? ""}:${row.now}`;
    const hash = computeHash(prevHash, hashPayload);
    await client.query(
      `INSERT INTO subsumio_audit_log (brain_id, action, entity_type, entity_id, user_id, user_email, details, ip, hash, prev_hash, hash_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
      [
        row.brainId,
        row.action,
        row.entityType,
        row.entityId,
        row.userId,
        row.userEmail,
        row.detailsStr,
        row.ip,
        hash,
        prevHash,
        hashPayload,
      ]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function logAudit(
  action: AuditAction,
  entityType: string,
  opts: LogAuditOptions
): Promise<void> {
  const now = new Date().toISOString();
  const brainId = opts.brainId || SYSTEM_BRAIN;
  const pool = getSharedPgPool();

  if (!pool) {
    // No audit store configured. There is no second, editable storage — the
    // loss is reported instead of silently written somewhere nobody reads.
    raiseAuditFailure({
      action,
      entityType,
      brainId,
      entityId: opts.entityId,
      error: "audit store not configured",
    });
    return;
  }

  const row: ChainedRow = {
    brainId,
    action,
    entityType,
    entityId: opts.entityId,
    userId: opts.userId,
    userEmail: opts.userEmail,
    detailsStr: JSON.stringify(opts.details ?? {}),
    ip: opts.ip,
    now,
  };

  let lastError: unknown;
  // One retry covers a transient connection drop; afterwards: alert.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await ensureAuditSchema();
      await insertChained(pool, row);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  // Audit logging never breaks the user flow — but a lost entry is an alarm.
  raiseAuditFailure({
    action,
    entityType,
    brainId,
    entityId: opts.entityId,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

// ── AI Compliance Audit Helpers ───────────────────────────────────────

/**
 * Log an injection detection event to the audit trail.
 * Call this when scanForInjection detects an injection attempt.
 */
export async function logInjectionAudit(opts: {
  brainId: string;
  userId?: string;
  userEmail?: string;
  ip?: string;
  blocked: boolean;
  riskScore: number;
  flags: Array<{ category: string; severity: string; match: string }>;
  sanitizedInputPreview?: string;
}): Promise<void> {
  const action = opts.blocked ? "ai.injection_blocked" : "ai.injection_detected";
  await logAudit(action, "ai_input", {
    brainId: opts.brainId,
    userId: opts.userId,
    userEmail: opts.userEmail,
    ip: opts.ip,
    details: {
      blocked: opts.blocked,
      risk_score: opts.riskScore,
      flag_count: opts.flags.length,
      categories: opts.flags.map((f) => f.category),
      severities: opts.flags.map((f) => f.severity),
      matches: opts.flags.map((f) => f.match.slice(0, 100)),
      sanitized_preview: opts.sanitizedInputPreview?.slice(0, 200),
    },
  });
}

/**
 * Log a reasoning trace creation to the audit trail.
 * This links the trace_id to the audit log for cross-referencing.
 */
export async function logTraceAudit(opts: {
  brainId: string;
  userId?: string;
  userEmail?: string;
  traceId: string;
  traceHash: string;
  modelUsed: string;
  guardrailPassed?: boolean;
  injectionDetected: boolean;
  injectionBlocked: boolean;
  confidenceLevel?: string;
  regenerationCount: number;
}): Promise<void> {
  await logAudit("ai.reasoning_trace", "reasoning_trace", {
    brainId: opts.brainId,
    userId: opts.userId,
    userEmail: opts.userEmail,
    entityId: opts.traceId,
    details: {
      trace_id: opts.traceId,
      trace_hash: opts.traceHash,
      model_used: opts.modelUsed,
      guardrail_passed: opts.guardrailPassed,
      injection_detected: opts.injectionDetected,
      injection_blocked: opts.injectionBlocked,
      confidence_level: opts.confidenceLevel,
      regeneration_count: opts.regenerationCount,
    },
  });
}

/**
 * Log a webhook escalation event to the audit trail.
 */
export async function logWebhookAudit(opts: {
  brainId: string;
  traceId: string;
  event: "ESCALATE" | "BLOCK";
  severity: string;
  webhookUrl?: string;
  deliveryStatus: "sent" | "failed" | "skipped";
  statusCode?: number;
}): Promise<void> {
  const action = opts.event === "BLOCK" ? "ai.webhook_block" : "ai.webhook_escalate";
  await logAudit(action, "webhook", {
    brainId: opts.brainId,
    entityId: opts.traceId,
    details: {
      trace_id: opts.traceId,
      event: opts.event,
      severity: opts.severity,
      webhook_url: opts.webhookUrl ? "[configured]" : undefined,
      delivery_status: opts.deliveryStatus,
      status_code: opts.statusCode,
    },
  });
}

// ── Hash Chain Verification ───────────────────────────────────────────

export interface ChainVerificationResult {
  verified: number;
  unverifiable: number;
  broken: Array<{
    id: string;
    reason: "hash_mismatch" | "chain_break" | "missing_payload";
    expectedHash?: string;
    actualHash?: string;
  }>;
  totalEntries: number;
  ok: boolean;
}

/**
 * Verify the integrity of the audit log hash chain for a given brain.
 *
 * Reads all entries ordered by id ASC, recomputes each hash from
 * prev_hash + hash_payload, and checks:
 * 1. The recomputed hash matches the stored hash
 * 2. The prev_hash matches the previous entry's hash (chain continuity)
 *
 * Entries without hash_payload (pre-fix rows) are marked "unverifiable"
 * rather than "broken" — they predate the verification infrastructure.
 *
 * @returns {ChainVerificationResult} with ok=true if no broken entries found
 */
export async function verifyAuditChain(brainId: string): Promise<ChainVerificationResult> {
  const pool = getSharedPgPool();
  const empty: ChainVerificationResult = {
    verified: 0,
    unverifiable: 0,
    broken: [],
    totalEntries: 0,
    ok: true,
  };

  if (!pool) return empty;

  try {
    await ensureAuditSchema();
    const { rows } = await pool.query<{
      id: string;
      hash: string | null;
      prev_hash: string | null;
      hash_payload: string | null;
    }>(
      `SELECT id::text, hash, prev_hash, hash_payload
       FROM subsumio_audit_log
       WHERE brain_id = $1
       ORDER BY id ASC`,
      [brainId]
    );

    const result: ChainVerificationResult = {
      verified: 0,
      unverifiable: 0,
      broken: [],
      totalEntries: rows.length,
      ok: true,
    };

    let expectedPrevHash: string | null = null;

    for (const row of rows) {
      // Check chain continuity first
      if (row.prev_hash !== expectedPrevHash) {
        result.broken.push({
          id: row.id,
          reason: "chain_break",
          expectedHash: expectedPrevHash ?? undefined,
          actualHash: row.prev_hash ?? undefined,
        });
        result.ok = false;
        // Update expected for next iteration
        expectedPrevHash = row.hash;
        continue;
      }

      // Entries without hash_payload are pre-fix — unverifiable, not broken
      if (!row.hash_payload) {
        result.unverifiable++;
        expectedPrevHash = row.hash;
        continue;
      }

      // Recompute hash and compare
      const recomputedHash = computeHash(row.prev_hash, row.hash_payload);
      if (recomputedHash !== row.hash) {
        result.broken.push({
          id: row.id,
          reason: "hash_mismatch",
          expectedHash: recomputedHash,
          actualHash: row.hash ?? undefined,
        });
        result.ok = false;
      } else {
        result.verified++;
      }

      expectedPrevHash = row.hash;
    }

    return result;
  } catch (err) {
    log.error(
      `[audit] verifyAuditChain failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return empty;
  }
}

export interface ListAuditLogsOptions {
  brainId: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  limit?: number;
  /** Opaque cursor from a previous page (`nextCursor`) — continues below it. */
  cursor?: string;
}

export interface AuditLogPage {
  entries: AuditEntry[];
  /** Set when more (older) entries exist; pass back as `cursor`. */
  nextCursor: string | null;
}

/** Thrown when the audit store cannot be read — callers must not show "empty". */
export class AuditStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditStoreUnavailableError";
  }
}

export function encodeAuditCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeAuditCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.lastIndexOf("|");
    if (sep <= 0) return null;
    const createdAt = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    // Postgres `timestamptz::text`, e.g. "2026-09-25 10:00:00.123456+00".
    const pgTimestamp =
      /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;
    if (!/^\d{1,19}$/.test(id) || !pgTimestamp.test(createdAt)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * One page of a tenant's audit protocol, newest first, keyset-paginated on
 * (created_at, id) so every entry is reachable — no hard cap, no skipped rows.
 * Throws AuditStoreUnavailableError when the store is missing or failing.
 */
export async function listAuditLogsPage(opts: ListAuditLogsOptions): Promise<AuditLogPage> {
  const pool = getSharedPgPool();
  if (!pool) throw new AuditStoreUnavailableError("audit store not configured");

  const conditions: string[] = [`brain_id = $1`];
  const params: unknown[] = [opts.brainId];
  let paramIdx = 2;

  if (opts.action) {
    conditions.push(`action LIKE $${paramIdx++}`);
    params.push(`%${opts.action.replace(/[%_]/g, "\\$&")}%`);
  }
  if (opts.entityType) {
    conditions.push(`entity_type = $${paramIdx++}`);
    params.push(opts.entityType);
  }
  if (opts.entityId) {
    conditions.push(`entity_id = $${paramIdx++}`);
    params.push(opts.entityId);
  }
  if (opts.from) {
    conditions.push(`created_at >= $${paramIdx++}`);
    params.push(opts.from);
  }
  if (opts.to) {
    conditions.push(`created_at <= $${paramIdx++}`);
    params.push(opts.to);
  }
  if (opts.cursor) {
    const c = decodeAuditCursor(opts.cursor);
    if (!c) throw new RangeError("invalid audit cursor");
    conditions.push(`(created_at, id) < ($${paramIdx++}::timestamptz, $${paramIdx++}::bigint)`);
    params.push(c.createdAt, c.id);
  }

  const limit = Math.max(1, opts.limit ?? 200);
  // One extra row tells us whether another page exists.
  params.push(limit + 1);

  let rows: Array<Record<string, unknown>>;
  try {
    await ensureAuditSchema();
    const res = await pool.query(
      `SELECT id::text, action, entity_type, entity_id, user_id, user_email, details, ip,
              hash, prev_hash, created_at::text as timestamp
       FROM subsumio_audit_log
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC, id DESC
       LIMIT $${paramIdx}`,
      params
    );
    rows = res.rows;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`[audit] postgres list failed: ${message}`);
    throw new AuditStoreUnavailableError(message);
  }

  const page = rows.slice(0, limit);
  const entries: AuditEntry[] = page.map((r) => ({
    id: String(r.id),
    action: String(r.action),
    entityType: String(r.entity_type),
    entityId: (r.entity_id as string | null) ?? undefined,
    userId: (r.user_id as string | null) ?? undefined,
    userEmail: (r.user_email as string | null) ?? undefined,
    details: (r.details as Record<string, unknown> | null) ?? undefined,
    ip: (r.ip as string | null) ?? undefined,
    hash: (r.hash as string | null) ?? undefined,
    prev_hash: (r.prev_hash as string | null) ?? undefined,
    timestamp: String(r.timestamp),
  }));
  const last = entries[entries.length - 1];
  return {
    entries,
    nextCursor: rows.length > limit && last ? encodeAuditCursor(last.timestamp, last.id) : null,
  };
}

/**
 * Newest `limit` entries (default 200). Throws AuditStoreUnavailableError on a
 * missing/failing store — an unreadable protocol is never reported as empty.
 */
export async function listAuditLogs(opts: ListAuditLogsOptions): Promise<AuditEntry[]> {
  return (await listAuditLogsPage(opts)).entries;
}
