// Firm-visible audit trail for support-session start/end — a brain page of
// type "audit_log", the same store the Kanzlei "Audit" workspace reads via
// GET /api/audit. This is deliberately a separate write path from
// src/lib/audit.ts's logAudit() (which records the operator-only, tamper-
// evident Postgres trail): logAudit() defaults to brain_id "system" when the
// caller doesn't pass one, and nothing currently surfaces that table to a
// firm. Writing here directly is what actually makes the entry appear in the
// firm's own audit trail — see
// docs/audits/AUDIT_LOG_BRAIN_SCOPING_GAP_2026-09-13.md for the broader gap
// this works around.
//
// Kept out of src/lib/support-session.ts (and out of src/lib/engine.ts) to
// avoid a module cycle: engine.ts's engineContext() reads active support
// sessions from support-session.ts, and this file needs ENGINE_URL /
// engineHeadersForBrain from engine.ts — only the two support-session API
// routes import this file, never engine.ts itself.
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import type { SupportSession } from "@/lib/support-session";
import { engineWriteBestEffort } from "@/lib/engine-write";

/**
 * Writes the entry and reports whether it was stored. The start route treats
 * `false` as fatal (the session is ended again): a firm is never entered
 * without the entry in its own audit trail.
 */
export async function writeFirmVisibleSupportAuditEntry(
  orgBrainId: string,
  action: "support.session_start" | "support.session_end",
  session: SupportSession
): Promise<boolean> {
  const now = new Date().toISOString();
  const slug = `audit/${now.slice(0, 10)}/${action.replace(/\./g, "-")}-${Date.now()}`;
  const details =
    action === "support.session_start"
      ? {
          reason: session.reason,
          mode: session.mode,
          expiresAt: session.expiresAt,
          by: session.operatorEmail,
        }
      : {
          reason: session.reason,
          mode: session.mode,
          endedAt: session.endedAt,
          by: session.operatorEmail,
        };
  const title =
    action === "support.session_start"
      ? session.mode === "write"
        ? "Subsumio-Support: Zugriff mit Schreibrecht gestartet"
        : "Subsumio-Support: Lesezugriff gestartet"
      : "Subsumio-Support: Zugriff beendet";
  return engineWriteBestEffort(
    `${ENGINE_URL}/api/pages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...engineHeadersForBrain(orgBrainId) },
      body: JSON.stringify({
        slug,
        title,
        type: "audit_log",
        content: JSON.stringify({ action, entityType: "org", details, timestamp: now }),
        frontmatter: {
          action,
          entity_type: "org",
          entity_id: session.orgId,
          details,
          timestamp: now,
          date: now.split("T")[0],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
    "Support-Protokolleintrag"
  );
}

/**
 * One firm-visible entry per accessed path inside a support session (see
 * requireEngineContext). Records method, path and route action — never
 * query strings or bodies. Returns whether it was stored; the caller refuses
 * the request otherwise.
 */
export async function writeSupportAccessAuditEntry(
  orgBrainId: string,
  session: SupportSession,
  access: { method: string; path: string; action: string }
): Promise<boolean> {
  const now = new Date().toISOString();
  const action = "support.access";
  const slug = `audit/${now.slice(0, 10)}/support-access-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const details = {
    method: access.method,
    path: access.path,
    route_action: access.action,
    mode: session.mode,
    session_id: session.id,
    by: session.operatorEmail,
  };
  return engineWriteBestEffort(
    `${ENGINE_URL}/api/pages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...engineHeadersForBrain(orgBrainId) },
      body: JSON.stringify({
        slug,
        title: `Subsumio-Support: Zugriff ${access.method} ${access.path}`,
        type: "audit_log",
        content: JSON.stringify({ action, entityType: "org", details, timestamp: now }),
        frontmatter: {
          action,
          entity_type: "org",
          entity_id: session.orgId,
          details,
          timestamp: now,
          date: now.split("T")[0],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
    "Support-Zugriffsprotokoll"
  );
}
