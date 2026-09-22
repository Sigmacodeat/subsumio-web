/**
 * Demo-mode guard — the single enforcement point for public demo sessions
 * (ctx.demo set by engineContext). Runs inside createHandler between RBAC
 * and CSRF for every authenticated route the visitor hits.
 *
 * Two layers:
 *   1. Action + path denylist — anything that could send mail, touch real
 *      billing, spawn background agents/workflows, upload real bytes or
 *      reach into platform/ops surfaces is rejected with 403 demo_restricted.
 *      Writes that stay inside the visitor's isolated demo-s-* source
 *      (pages, deadlines, notes) pass through — that's what makes the demo
 *      feel like the real product.
 *   2. LLM budget — query.submit and every generative legal.* action
 *      consume the session's question budget atomically (consumeDemoBudget).
 *      Exhausted → 429 demo_limit, which the frontend turns into the
 *      progressive e-mail gate / signup CTA.
 */
import type { RouteAction } from "@/lib/permissions";
import { consumeDemoBudget } from "./session";

/** Actions a demo visitor can never trigger, regardless of role. */
export const DEMO_BLOCKED_ACTIONS: ReadonlySet<RouteAction> = new Set([
  "admin.*",
  "admin.user_update",
  "admin.user_deactivate",
  "admin.data_delete",
  "admin.data_export",
  "admin.audit_export",
  "platform.operator",
  "platform.support_session",
  "billing.write",
  "scim.read",
  "scim.write",
  "connector.write",
  "team.role_change",
  "agent.write",
  "agent.control",
  "agent.inbox",
  "workflow.start",
  "workflow.update",
  "workflow.delete",
  "workflow.approve",
  "push.register",
  "push.unregister",
  "share.receive",
  "invoice.write",
  "invoice.e_invoice",
  "settings.write",
  "onboarding.complete",
  "onboarding.progress",
  // The dashboard copilot can dispatch tools with side effects; the demo
  // assistant flow runs through /api/think (query.submit) instead.
  "copilot.tool",
]);

/** Path prefixes denied in demo mode even when their action is allowed —
 *  e.g. uploads are brain.write but must never accept visitor bytes. */
export const DEMO_BLOCKED_PATH_PREFIXES: readonly string[] = [
  "/api/upload",
  "/api/direct-upload",
  "/api/email",
  "/api/docusign",
  "/api/whatsapp",
  "/api/portal",
  "/api/connectors",
  "/api/share",
  "/api/cron",
  "/api/admin",
  "/api/scim",
  // /api/auth is deliberately NOT blocked: logout must end the demo and
  // login/signup is the intended upgrade path (it replaces the session).
];

/**
 * Actions that consume one unit of the demo session's LLM budget.
 * Generative legal.* endpoints plus chat queries. Retrieval-only actions
 * (grounding, statute/judgement/receipt lookups) are free — they are what
 * makes citations work and cost almost nothing.
 */
export const DEMO_BUDGET_ACTIONS: ReadonlySet<RouteAction> = new Set([
  "query.submit",
  "legal.schriftsatz",
  "legal.memo",
  "legal.strategy",
  "legal.research",
  "legal.subsumption",
  "legal.risk_analysis",
  "legal.document_review",
  "legal.case_scanner",
  "legal.contradictions",
  "legal.precedent_search",
  "legal.opponent_simulation",
  "legal.berufungsgruende",
  "legal.case_investigation",
  "legal.case_investigation_review",
  "legal.reorder_gruende",
  "legal.obligation_extract",
  "legal.deep_analysis",
  "legal.portfolio_insights",
  "legal.due_diligence",
  "legal.redline",
  "legal.contract_draft",
  "legal.tabular",
  "legal.fristenreport",
  "legal.playbook",
  "legal.rvg",
  "legal.translate",
  "legal.conflict",
  "legal.anonymize",
]);

export function demoRestricted(action: string): Response {
  return Response.json(
    {
      error: "demo_restricted",
      message:
        "Diese Funktion ist in der Live-Demo nicht verfügbar — sie würde echte Kanzlei-Systeme berühren.",
      action,
    },
    { status: 403 }
  );
}

export function demoLimitReached(
  used: number,
  cap: number,
  reason: "session" | "daily" = "session"
): Response {
  if (reason === "daily") {
    return Response.json(
      {
        error: "demo_daily_limit",
        message:
          "Das Demo-Tagesbudget ist ausgeschöpft — morgen wieder verfügbar, oder starten Sie direkt kostenlos mit Ihrer Kanzlei.",
        used,
        cap,
      },
      { status: 429 }
    );
  }
  return Response.json(
    {
      error: "demo_limit",
      message:
        "Demofragen aufgebraucht — E-Mail hinterlassen für weitere Fragen oder direkt starten.",
      used,
      cap,
    },
    { status: 429 }
  );
}

/**
 * Returns a Response to short-circuit the request, or null to proceed.
 * Budget consumption is atomic at the DB layer (increment-under-cap), so
 * concurrent requests from two demo tabs can't race past the cap.
 */
export async function demoGuard(
  req: { nextUrl?: { pathname?: string } | URL; url?: string },
  action: RouteAction,
  sessionId: string
): Promise<Response | null> {
  if (DEMO_BLOCKED_ACTIONS.has(action)) return demoRestricted(action);
  const pathname = req.nextUrl?.pathname ?? new URL(req.url ?? "/", "http://x").pathname;
  if (DEMO_BLOCKED_PATH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return demoRestricted(action);
  }
  if (DEMO_BUDGET_ACTIONS.has(action)) {
    const budget = await consumeDemoBudget(sessionId);
    if (!budget.allowed) return demoLimitReached(budget.used, budget.cap, budget.reason);
  }
  return null;
}
