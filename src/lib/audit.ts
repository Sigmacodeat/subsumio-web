/**
 * Audit-Trail Logger für SigmaBrain.
 * Speichert Aktionen als Brain-Pages vom Typ "audit_log".
 * Jeder Tenant hat seinen eigenen Audit-Trail isoliert durch Brain-Routing.
 */

import { api } from "@/lib/api";

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  userEmail?: string;
  details?: Record<string, unknown>;
  ip?: string;
  timestamp: string;
}

export type AuditAction =
  | "user.login" | "user.logout" | "user.signup"
  | "case.create" | "case.update" | "case.delete" | "case.view"
  | "invoice.create" | "invoice.update" | "invoice.delete" | "invoice.send" | "invoice.remind"
  | "document.upload" | "document.delete"
  | "deadline.create" | "deadline.update" | "deadline.delete"
  | "evidence.create" | "evidence.update" | "evidence.delete"
  | "drafting.generate" | "drafting.export"
  | "conflict.check" | "judgements.search"
  | "legal.contract_draft" | "legal.document_review" | "legal.due_diligence"
  | "legal.risk_analysis" | "legal.memo" | "legal.redline" | "legal.anonymize"
  | "settings.update" | "billing.upgrade"
  | "team.invite" | "team.remove" | "team.role_change"
  | "connector.add" | "connector.remove" | "connector.sync"
  | "query.submit";

const ACTION_LABELS: Record<string, string> = {
  "user.login": "Login",
  "user.logout": "Logout",
  "user.signup": "Registrierung",
  "case.create": "Akte angelegt",
  "case.update": "Akte aktualisiert",
  "case.delete": "Akte gelöscht",
  "case.view": "Akte geöffnet",
  "invoice.create": "Rechnung erstellt",
  "invoice.update": "Rechnung aktualisiert",
  "invoice.delete": "Rechnung gelöscht",
  "document.upload": "Dokument hochgeladen",
  "document.delete": "Dokument gelöscht",
  "deadline.create": "Frist erstellt",
  "deadline.update": "Frist aktualisiert",
  "deadline.delete": "Frist gelöscht",
  "evidence.create": "Beweismittel erstellt",
  "evidence.update": "Beweismittel aktualisiert",
  "evidence.delete": "Beweismittel gelöscht",
  "drafting.generate": "Schriftsatz generiert",
  "drafting.export": "Schriftsatz exportiert",
  "conflict.check": "Kollisionsprüfung",
  "judgements.search": "Rechtsprechung gesucht",
  "settings.update": "Einstellungen geändert",
  "billing.upgrade": "Plan geändert",
  "team.invite": "Team-Einladung",
  "team.remove": "Team-Mitglied entfernt",
  "connector.add": "Konnektor hinzugefügt",
  "connector.remove": "Konnektor entfernt",
  "connector.sync": "Konnektor synchronisiert",
  "query.submit": "KI-Query",
};

export function auditLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

export async function logAudit(
  action: AuditAction,
  entityType: string,
  opts?: {
    entityId?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const now = new Date().toISOString();
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
        // details must live in the frontmatter: the list API doesn't return
        // page bodies, so frontmatter is the only place list views can read.
        details: opts?.details,
        timestamp: now,
        date: now.split("T")[0],
      },
    });
  } catch {
    // Audit logging should never break user flows
  }
}

export async function listAuditLogs(opts?: {
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<AuditEntry[]> {
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

    // Client-side filtering (brain list doesn't support all filters)
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
