/**
 * Berechtigungs-Matrix für Kanzlei-Rollen.
 * Jede Funktion prüft, ob die gegebene Rolle eine Aktion ausführen darf.
 *
 * Route-Level Actions: jede API-Route deklariert eine requiredAction;
 * engineContext() bzw. ein Route-Wrapper prüft diese zentral.
 */

import type { KanzleiRole, User } from "./auth/store";
import type { AuditAction } from "./audit";

export const PERMISSIONS = {
  canCreateInvoice: (role: KanzleiRole) => role === "admin" || role === "lawyer",

  canCancelInvoice: (role: KanzleiRole) => role === "admin" || role === "lawyer",

  canSendInvoice: (role: KanzleiRole) =>
    role === "admin" || role === "lawyer" || role === "assistant",

  canCreateTimeEntry: (role: KanzleiRole) =>
    role === "admin" || role === "lawyer" || role === "assistant",

  canEditDeadlines: (role: KanzleiRole) =>
    role === "admin" || role === "lawyer" || role === "assistant",

  canManageContacts: (role: KanzleiRole) =>
    role === "admin" || role === "lawyer" || role === "assistant",

  canGeneratePortalLink: (role: KanzleiRole) => role === "admin" || role === "lawyer",

  canEditSettings: (role: KanzleiRole) => role === "admin",

  canManageTeam: (role: KanzleiRole) => role === "admin",

  canViewBrain: (role: KanzleiRole) => role !== "client_viewer",

  canUseAI: (role: KanzleiRole) => role === "admin" || role === "lawyer" || role === "assistant",
} as const;

/** API-Route-Level Actions für RBAC + Audit */
export type RouteAction =
  | "brain.read" // GET /api/stats, /api/pages, /api/search, /api/graph
  | "brain.write" // POST /api/pages, /api/upload
  | "brain.delete" // DELETE /api/pages/:slug
  | "query.submit" // POST /api/think, /api/search
  | "agent.read" // GET /api/agents
  | "agent.write" // POST /api/agents (supervisor)
  | "agent.control" // POST /api/agents/:id/pause|resume|cancel|replay
  | "agent.inbox" // GET/POST /api/agents/:id/inbox
  | "connector.read" // GET /api/connectors
  | "connector.write" // POST /api/connectors/:service/sync|toggle
  | "settings.read" // GET /api/settings/*
  | "settings.write" // POST /api/settings/*
  | "invoice.read"
  | "invoice.write"
  | "legal.conflict"
  | "legal.anonymize"
  | "legal.judgements"
  | "legal.tabular"
  | "legal.contract_draft"
  | "legal.document_review"
  | "legal.deep_analysis"
  | "legal.portfolio_insights"
  | "legal.due_diligence"
  | "legal.risk_analysis"
  | "legal.memo"
  | "legal.redline"
  | "legal.playbook"
  | "legal.rvg"
  | "legal.statute"
  | "team.role_change"
  | "billing.read"
  | "billing.write"
  | "scim.read" // GET /api/scim/*
  | "scim.write" // POST/PUT/PATCH/DELETE /api/scim/*
  | "onboarding.complete" // POST /api/onboarding — all roles
  | "copilot.tool" // POST /api/copilot/tools — all authenticated roles
  | "push.register" // POST /api/push/register — all authenticated roles
  | "push.unregister" // DELETE /api/push/register — all authenticated roles
  | "presence.update" // POST /api/realtime/presence — all authenticated roles
  | "presence.list" // GET /api/realtime/presence — all authenticated roles
  | "admin.*" // nur admin
  | "admin.user_update"
  | "admin.user_deactivate"; // nur admin

const ACTION_ROLES: Record<RouteAction, KanzleiRole[]> = {
  "brain.read": ["admin", "lawyer", "assistant", "client_viewer"],
  "brain.write": ["admin", "lawyer", "assistant"],
  "brain.delete": ["admin", "lawyer"],
  "query.submit": ["admin", "lawyer", "assistant"],
  "agent.read": ["admin", "lawyer", "assistant"],
  "agent.write": ["admin", "lawyer", "assistant"],
  "agent.control": ["admin", "lawyer", "assistant"],
  "agent.inbox": ["admin", "lawyer", "assistant"],
  "connector.read": ["admin"],
  "connector.write": ["admin"],
  "settings.read": ["admin", "lawyer", "assistant", "client_viewer"],
  "settings.write": ["admin"],
  "invoice.read": ["admin", "lawyer", "assistant"],
  "invoice.write": ["admin", "lawyer", "assistant"],
  "legal.conflict": ["admin", "lawyer", "assistant"],
  "legal.anonymize": ["admin", "lawyer", "assistant"],
  "legal.judgements": ["admin", "lawyer", "assistant"],
  "legal.tabular": ["admin", "lawyer", "assistant"],
  "legal.contract_draft": ["admin", "lawyer"],
  "legal.document_review": ["admin", "lawyer", "assistant"],
  "legal.deep_analysis": ["admin", "lawyer", "assistant"],
  "legal.portfolio_insights": ["admin", "lawyer", "assistant"],
  "legal.due_diligence": ["admin", "lawyer"],
  "legal.risk_analysis": ["admin", "lawyer", "assistant"],
  "legal.memo": ["admin", "lawyer", "assistant"],
  "legal.redline": ["admin", "lawyer"],
  "legal.playbook": ["admin", "lawyer"],
  "legal.rvg": ["admin", "lawyer", "assistant"],
  "legal.statute": ["admin", "lawyer", "assistant"],
  "team.role_change": ["admin"],
  "billing.read": ["admin", "lawyer"],
  "billing.write": ["admin"],
  "scim.read": ["admin"],
  "scim.write": ["admin"],
  "onboarding.complete": ["admin", "lawyer", "assistant", "client_viewer"],
  "copilot.tool": ["admin", "lawyer", "assistant"],
  "push.register": ["admin", "lawyer", "assistant", "client_viewer"],
  "push.unregister": ["admin", "lawyer", "assistant", "client_viewer"],
  "presence.update": ["admin", "lawyer", "assistant", "client_viewer"],
  "presence.list": ["admin", "lawyer", "assistant", "client_viewer"],
  "admin.*": ["admin"],
  "admin.user_update": ["admin"],
  "admin.user_deactivate": ["admin"],
};

/** Prüft, ob ein User eine Aktion ausführen darf. */
export function can(user: User, action: RouteAction): boolean {
  if (action.startsWith("admin.") && user.role === "admin") return true;
  const allowed = ACTION_ROLES[action];
  if (!allowed) return false;
  return allowed.includes(user.role);
}

/** HTTP-Response für Forbidden (403). */
export function forbidden(action?: string): Response {
  return Response.json(
    {
      error: "forbidden",
      message: action ? `Action '${action}' not permitted` : "Insufficient permissions",
    },
    { status: 403 }
  );
}

/** AuditAction-Mapping für Route-Action → Audit-Action (für server-seitiges Logging). */
export function auditActionFor(routeAction: RouteAction): AuditAction {
  const map: Record<RouteAction, AuditAction> = {
    "brain.read": "case.view",
    "brain.write": "case.create",
    "brain.delete": "document.delete",
    "query.submit": "query.submit",
    "agent.read": "case.view",
    "agent.write": "query.submit",
    "agent.control": "query.submit",
    "agent.inbox": "query.submit",
    "connector.read": "connector.add",
    "connector.write": "connector.sync",
    "settings.read": "settings.update",
    "settings.write": "settings.update",
    "invoice.read": "invoice.create",
    "invoice.write": "invoice.create",
    "legal.conflict": "conflict.check",
    "legal.anonymize": "legal.anonymize",
    "legal.judgements": "judgements.search",
    "legal.tabular": "query.submit",
    "legal.contract_draft": "legal.contract_draft",
    "legal.document_review": "legal.document_review",
    "legal.deep_analysis": "legal.deep_analysis",
    "legal.portfolio_insights": "legal.deep_analysis",
    "legal.due_diligence": "legal.due_diligence",
    "legal.risk_analysis": "legal.risk_analysis",
    "legal.memo": "legal.memo",
    "legal.redline": "legal.redline",
    "legal.playbook": "legal.playbook",
    "legal.rvg": "legal.rvg",
    "legal.statute": "legal.statute",
    "team.role_change": "team.role_change",
    "billing.read": "billing.upgrade",
    "billing.write": "billing.upgrade",
    "scim.read": "settings.update",
    "scim.write": "settings.update",
    "onboarding.complete": "settings.update",
    "copilot.tool": "query.submit",
    "push.register": "settings.update",
    "push.unregister": "settings.update",
    "presence.update": "case.view",
    "presence.list": "case.view",
    "admin.*": "settings.update",
    "admin.user_update": "admin.user_update",
    "admin.user_deactivate": "admin.user_deactivate",
  };
  return map[routeAction] ?? "settings.update";
}
