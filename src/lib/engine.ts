// Server-side helper for the dashboard's engine proxies.
//
// Multi-tenant V1: every proxy resolves the logged-in user and forwards
// their brainId as `x-sigmabrain-source` — the engine's web API scopes
// every operation to it (see src/commands/web-api.ts upstream). The header
// is added server-to-server only; the browser can never choose a tenant.

import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { getStore, getOrgStore, type Plan, type User } from "@/lib/auth/store";
import { can, forbidden, type RouteAction } from "@/lib/permissions";
import { checkQuota, incQuota, quotaExceeded, type QuotaType } from "@/lib/plans";
import { requireApiRate, type RateTier } from "@/lib/rate-limit-api";

const CONFIGURED_ENGINE_URL = process.env.SIGMABRAIN_API_URL || process.env.GBRAIN_API_URL;

export const ENGINE_URL = CONFIGURED_ENGINE_URL || "http://localhost:3001";

export function engineConfigurationResponse(): Response | null {
  if (process.env.NODE_ENV !== "production" || CONFIGURED_ENGINE_URL) return null;
  return Response.json(
    {
      error: "engine_not_configured",
      message: "Set SIGMABRAIN_API_URL or GBRAIN_API_URL in the production environment.",
    },
    { status: 503 },
  );
}

export interface EngineContext {
  headers: Record<string, string>;
  /** The brain all engine calls scope to: the org's shared brain when the
   *  user is a team member, otherwise their personal one. */
  brainId: string;
  /** Plan whose limits apply to this brain (org → the OWNER's plan). */
  plan: Plan;
  user: User;
}

/**
 * Full engine-call context for the current session, or null when nobody is
 * signed in. Org membership switches both the brain AND the plan whose
 * fair-use limits apply (the org owner pays; their plan carries the pool).
 */
export async function engineContext(): Promise<EngineContext | null> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await getStore().getById(session.uid);
  if (!user) return null;

  let brainId = user.brainId;
  let plan: Plan = user.plan;
  if (user.orgId) {
    const org = await getOrgStore().getById(user.orgId);
    if (org) {
      brainId = org.brainId;
      const owner = await getStore().getById(org.ownerId);
      if (owner) plan = owner.plan;
    }
  }

  const headers: Record<string, string> = { "x-sigmabrain-source": brainId };
  const apiKey = process.env.SIGMABRAIN_WEB_API_KEY || process.env.GBRAIN_WEB_API_KEY;
  if (apiKey) headers["x-sigmabrain-api-key"] = apiKey;
  return { headers, brainId, plan, user };
}

/**
 * Headers for an engine call on behalf of the current session, or null when
 * nobody is signed in (proxies answer 401 then — the dashboard middleware
 * normally prevents that from ever happening).
 */
export async function engineHeaders(): Promise<Record<string, string> | null> {
  const ctx = await engineContext();
  return ctx?.headers ?? null;
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

/**
 * Engine headers for a KNOWN brainId — for trusted server-side jobs (cron,
 * webhooks) that act on behalf of a tenant without a browser session.
 * Never expose to request-derived input: the caller must own the brainId.
 */
export function engineHeadersForBrain(brainId: string): Record<string, string> {
  const headers: Record<string, string> = { "x-sigmabrain-source": brainId };
  const apiKey = process.env.SIGMABRAIN_WEB_API_KEY || process.env.GBRAIN_WEB_API_KEY;
  if (apiKey) headers["x-sigmabrain-api-key"] = apiKey;
  return headers;
}

// ── Hardened wrappers (RBAC + Rate Limit + Quota) ─────────────────────────

export type GuardedContext = EngineContext;

/**
 * Full context mit RBAC, Rate-Limit und optionaler Quota-Prüfung.
 * Gibt direkt eine Response zurück, wenn eine Prüfung fehlschlägt.
 *
 * Usage in route handlers:
 *   const ctx = await requireEngineContext(req, "brain.read", "standard", "queries");
 *   if (ctx instanceof Response) return ctx;
 */
export async function requireEngineContext(
  req: Request,
  action: RouteAction,
  rateTier: RateTier,
  quotaField?: QuotaType,
): Promise<GuardedContext | Response> {
  const ctx = await engineContext();
  if (!ctx) return unauthorized();

  // 1. RBAC
  if (!can(ctx.user, action)) {
    return forbidden(action);
  }

  // 2. Rate-Limit
  const rateCheck = await requireApiRate(ctx.user.id, rateTier);
  if (rateCheck) return rateCheck;

  // 3. Quota (optional)
  if (quotaField) {
    const quota = await checkQuota(ctx.brainId, ctx.plan, quotaField);
    if (!quota.ok) {
      return quotaExceeded(quotaField, quota.used, quota.limit);
    }
  }

  return ctx;
}

/**
 * Record a quota consumption after a successful operation.
 * Fire-and-forget; errors are logged but not thrown.
 */
export async function recordQuota(ctx: GuardedContext, field: QuotaType, amount = 1): Promise<void> {
  await incQuota(ctx.brainId, field, amount);
}

/**
 * Lightweight wrapper: nur Auth + RBAC (für Endpunkte ohne Rate/Quota).
 */
export async function requireAuthAction(
  action: RouteAction,
): Promise<GuardedContext | Response> {
  const ctx = await engineContext();
  if (!ctx) return unauthorized();
  if (!can(ctx.user, action)) return forbidden(action);
  return ctx;
}
