/**
 * Audit-Trail Logger für Subsumio.
 * In production: stores audit entries in a dedicated Postgres table (subsumio_audit_log).
 * In dev (no Postgres): falls back to brain pages of type "audit_log".
 * Each tenant's audit trail is isolated by brain_id.
 */

import { api } from "@/lib/api";
import { getSharedPgPool } from "@/lib/auth/store";
import { createHash } from "node:crypto";
import { createSchemaInit } from "@/lib/schema-init";
export type { AuditEntry, AuditAction } from "@/lib/audit-labels";
export { auditLabel } from "@/lib/audit-labels";
import type { AuditEntry, AuditAction } from "@/lib/audit-labels";
import { auditLabel } from "@/lib/audit-labels";

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

export async function logAudit(
  action: AuditAction,
  entityType: string,
  opts?: {
    entityId?: string;
    details?: Record<string, unknown>;
    brainId?: string;
    userId?: string;
    userEmail?: string;
    ip?: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const pool = getSharedPgPool();

  if (pool) {
    try {
      await ensureAuditSchema();
      const brainId = opts?.brainId ?? "system";
      const detailsStr = JSON.stringify(opts?.details ?? {});
      // Get previous hash for chain
      const { rows } = await pool.query<{ hash: string }>(
        "SELECT hash FROM subsumio_audit_log WHERE brain_id = $1 ORDER BY id DESC LIMIT 1",
        [brainId]
      );
      const prevHash = rows[0]?.hash ?? null;
      const hashPayload = `${action}:${entityType}:${opts?.entityId ?? ""}:${opts?.userId ?? ""}:${opts?.userEmail ?? ""}:${detailsStr}:${opts?.ip ?? ""}:${now}`;
      const hash = computeHash(prevHash, hashPayload);
      await pool.query(
        `INSERT INTO subsumio_audit_log (brain_id, action, entity_type, entity_id, user_id, user_email, details, ip, hash, prev_hash, hash_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
        [
          brainId,
          action,
          entityType,
          opts?.entityId,
          opts?.userId,
          opts?.userEmail,
          detailsStr,
          opts?.ip,
          hash,
          prevHash,
          hashPayload,
        ]
      );
      return;
    } catch (err) {
      console.error(
        `[audit] postgres log failed: ${err instanceof Error ? err.message : String(err)}`
      );
      // Fall through to brain-page fallback
    }
  }

  // Dev fallback: store as brain page
  const id = `audit/${now.slice(0, 10)}/${action.replace(/\./g, "-")}-${Date.now()}`;
  try {
    await api.brain.createPage({
      slug: id,
      title: auditLabel(action),
      type: "audit_log",
      content: JSON.stringify({
        action,
        entityType,
        entityId: opts?.entityId,
        details: opts?.details,
        timestamp: now,
      }),
      frontmatter: {
        action,
        entity_type: entityType,
        entity_id: opts?.entityId,
        details: opts?.details,
        timestamp: now,
        date: now.split("T")[0],
      },
    });
  } catch {
    // Audit logging should never break user flows
  }
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
    console.error(
      `[audit] verifyAuditChain failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return empty;
  }
}

export async function listAuditLogs(opts: {
  brainId: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<AuditEntry[]> {
  const pool = getSharedPgPool();

  if (pool) {
    try {
      await ensureAuditSchema();
      const conditions: string[] = [`brain_id = $1`];
      const params: unknown[] = [opts.brainId];
      let paramIdx = 2;

      if (opts?.action) {
        conditions.push(`action LIKE $${paramIdx++}`);
        params.push(`%${opts.action.replace(/[%_]/g, "\\$&")}%`);
      }
      if (opts?.entityType) {
        conditions.push(`entity_type = $${paramIdx++}`);
        params.push(opts.entityType);
      }
      if (opts?.from) {
        conditions.push(`created_at >= $${paramIdx++}`);
        params.push(opts.from);
      }
      if (opts?.to) {
        conditions.push(`created_at <= $${paramIdx++}`);
        params.push(opts.to);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = opts?.limit ?? 200;
      params.push(limit);

      const { rows } = await pool.query(
        `SELECT id::text, action, entity_type, entity_id, user_id, user_email, details, ip,
                hash, prev_hash, created_at::text as timestamp
         FROM subsumio_audit_log
         ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx}`,
        params
      );

      return rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id ?? undefined,
        userId: r.user_id ?? undefined,
        userEmail: r.user_email ?? undefined,
        details: r.details ?? undefined,
        ip: r.ip ?? undefined,
        hash: r.hash ?? undefined,
        prev_hash: r.prev_hash ?? undefined,
        timestamp: r.timestamp,
      }));
    } catch (err) {
      console.error(
        `[audit] postgres list failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Dev fallback: read from brain pages
  try {
    const pages = await api.brain.listPages({ type: "audit_log", limit: opts?.limit || 200 });
    const entries: AuditEntry[] = pages.map((p) => {
      const fm = p.frontmatter || {};
      let details: Record<string, unknown> | undefined;
      if (fm.details && typeof fm.details === "object") {
        details = fm.details as Record<string, unknown>;
      } else {
        try {
          const parsed = JSON.parse(p.content || "{}");
          details = parsed.details;
        } catch {}
      }
      return {
        id: p.slug,
        action: String(fm.action || ""),
        entityType: String(fm.entity_type || ""),
        entityId: fm.entity_id ? String(fm.entity_id) : undefined,
        timestamp: String(fm.timestamp || p.created_at || ""),
        hash: fm.hash ? String(fm.hash) : undefined,
        prev_hash: fm.prev_hash ? String(fm.prev_hash) : undefined,
        details,
      };
    });

    return entries.filter((e) => {
      if (opts?.action && !e.action.includes(opts.action)) return false;
      if (opts?.entityType && e.entityType !== opts.entityType) return false;
      if (opts?.from && e.timestamp < opts.from) return false;
      if (opts?.to && e.timestamp > opts.to) return false;
      return true;
    });
  } catch {
    return [];
  }
}
