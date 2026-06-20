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
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE INDEX IF NOT EXISTS subsumio_audit_log_brain_id_idx ON subsumio_audit_log (brain_id)",
  "CREATE INDEX IF NOT EXISTS subsumio_audit_log_action_idx ON subsumio_audit_log (action)",
  "CREATE INDEX IF NOT EXISTS subsumio_audit_log_created_at_idx ON subsumio_audit_log (created_at DESC)",
  "CREATE INDEX IF NOT EXISTS subsumio_audit_log_entity_idx ON subsumio_audit_log (entity_type, entity_id)",
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
      const hash = computeHash(
        prevHash,
        `${action}:${entityType}:${opts?.entityId ?? ""}:${opts?.userId ?? ""}:${opts?.userEmail ?? ""}:${detailsStr}:${opts?.ip ?? ""}:${now}`
      );
      await pool.query(
        `INSERT INTO subsumio_audit_log (brain_id, action, entity_type, entity_id, user_id, user_email, details, ip, hash, prev_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
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
        params.push(`%${opts.action}%`);
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
                created_at::text as timestamp
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
