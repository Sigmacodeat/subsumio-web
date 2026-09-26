// Server-side helper for the dashboard's engine proxies.
//
// Multi-tenant V1: every proxy resolves the logged-in user and forwards
// their brainId as `x-subsumio-source` — the engine's web API scopes
// every operation to it (see src/commands/web-api.ts upstream). The header
// is added server-to-server only; the browser can never choose a tenant.

import { cookies } from "next/headers";
import { effectivePlan } from "@/lib/billing/trial";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { getStore, getOrgStore, type Plan, type User } from "@/lib/auth/store";
import { can, forbidden, type RouteAction } from "@/lib/permissions";
import { checkQuota, incQuota, quotaExceeded, type QuotaType } from "@/lib/plans";
import {
  checkCredits,
  ensureTrialCredits,
  deductCredits,
  checkAndSendBudgetAlert,
  getBalance,
  insufficientCreditsResponse,
  CREDIT_COSTS,
  type CreditOperation,
  type OwnerType,
} from "@/lib/billing/credits";
import { requireApiRate, type RateTier } from "@/lib/rate-limit-api";
import {
  isAllowedDuringTwoFactorSetup,
  twoFactorSetupRequiredResponse,
} from "@/lib/auth/two-factor-gate";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { isPlatformOperator } from "@/lib/auth/platform-operator";
import { getActiveSupportSession, type SupportSession } from "@/lib/support-session";
import { supportSessionBlocksRequest } from "@/lib/support-session-policy";
import { getTenant } from "@/lib/tenants";
import { billingAccountFor, type BillingAccount } from "@/lib/billing/billing-account";

import { logger } from "@/lib/logger";
import { MODEL_POLICY_HEADER, modelPolicyHeaderValue } from "@/lib/eu-policy-refusal";
const log = logger("lib/engine");

const CONFIGURED_ENGINE_URL = env("SUBSUMIO_API_URL");

export const ENGINE_URL = CONFIGURED_ENGINE_URL || "http://localhost:3001";

/**
 * P0-SECR-002: Create a signed identity token for engine-side matter-scope enforcement.
 *
 * Called AFTER the web-app has verified the caller's identity (WhatsApp identity
 * DB lookup, session check). The token is HMAC-signed with SUBSUMIO_WEB_API_KEY
 * — the same shared secret the engine uses for API auth.
 *
 * The engine verifies the signature before trusting the matterScope claim,
 * replacing the previous self-asserted header approach.
 */
function createSignedIdentityToken(
  sourceId: string,
  matterScope: string[] | "all",
  caller?: { userId: string; role: string; orgId?: string | null }
): string | undefined {
  const secret = env("SUBSUMIO_WEB_API_KEY");
  if (!secret) return undefined;
  // Minimal HMAC-SHA256 token — no external dependency, matches the
  // engine's verifyIdentityToken in server/src/core/identity-token.ts
  const payload = JSON.stringify({
    sourceId,
    matterScope,
    ...(caller
      ? {
          userId: caller.userId,
          role: caller.role,
          ...(caller.orgId ? { orgId: caller.orgId } : {}),
        }
      : {}),
    exp: Math.floor(Date.now() / 1000) + 300, // 5 min TTL
  });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadB64).digest();
  const sigB64 = sig.toString("base64url");
  return `${payloadB64}.${sigB64}`;
}

export function engineConfigurationResponse(): Response | null {
  // E2E harness: SUBSUMIO_E2E=1 uses the mock engine on :3001 (default
  // ENGINE_URL). Skip the production config gate — the flag is never set
  // in real production. (Previously gated on NODE_ENV !== "production",
  // but `next start` forces NODE_ENV=production which would 503 the e2e
  // production-build server.)
  if (env("SUBSUMIO_E2E") === "1") return null;
  if (process.env.NODE_ENV !== "production" || CONFIGURED_ENGINE_URL) {
    // In production, also verify the API key is set
    if (process.env.NODE_ENV === "production" && CONFIGURED_ENGINE_URL) {
      const apiKey = env("SUBSUMIO_WEB_API_KEY");
      if (!apiKey) {
        return Response.json(
          {
            error: "engine_api_key_missing",
            message: "Server configuration error: SUBSUMIO_WEB_API_KEY is not set.",
            hint: "Set SUBSUMIO_WEB_API_KEY in the environment and restart the engine + web process.",
          },
          { status: 503 }
        );
      }
    }
    return null;
  }
  return Response.json(
    {
      error: "engine_not_configured",
      message: "Server configuration error: SUBSUMIO_API_URL is not set.",
      hint: "Set SUBSUMIO_API_URL to the engine URL (e.g. http://engine:3001) and restart.",
    },
    { status: 503 }
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
  /** Whose credits this request uses — see src/lib/billing/billing-account.ts. */
  billing: BillingAccount;
  /** Registry sid of the current session — lets routes mark it as "Diese
   *  Sitzung" in the active-sessions list and revoke it on logout. */
  sessionId?: string;
  /** Set when the request authenticated with an API key or an add-in token
   *  instead of a browser session (src/lib/auth/api-key-auth.ts). */
  apiKey?: { id: string; kind: "api" | "addin" };
  /** Set only while a platform operator is inside a time-boxed support
   *  session (see src/lib/support-session.ts) — never for firm users. */
  supportSession?: SupportSession;
  /** The session was issued with must2fa (firm requires 2FA, the user has not
   *  set it up). requireEngineContext() confines it to the setup routes —
   *  see src/lib/auth/two-factor-gate.ts. */
  must2fa?: boolean;
  /** Set for public live-demo visitors (POST /api/demo/session). brainId is
   *  the visitor's isolated demo-s-* source; api-handler restricts dangerous
   *  actions and bills LLM use against the session budget, not credits. */
  demo?: {
    sid: string;
    sourceId: string;
    persona: "lawyer" | "assistant";
    jurisdiction: "at" | "de";
    questionsUsed: number;
    questionsCap: number;
    ingested: boolean;
  };
}

/**
 * Full engine-call context for the current session, or null when nobody is
 * signed in. Org membership switches both the brain AND the plan whose
 * fair-use limits apply (the org owner pays; their plan carries the pool).
 *
 * A platform operator with an active support session is switched onto the
 * target firm's brain the same way org membership is — this is the single
 * enforcement point for "support access": every route built on
 * requireEngineContext() (i.e. virtually every API route) automatically
 * operates against the firm's data for the session's duration, and reverts
 * to the operator's own (empty) brain the instant expires_at passes, with no
 * separate expiry job. ctx.user.role is elevated to "admin" and ctx.user.orgId
 * is set to the target org only within this returned, request-scoped object —
 * the operator's real stored account is never modified.
 */
export async function engineContext(): Promise<EngineContext | null> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  // Public live-demo session: no real user row — resolve the per-visitor
  // isolated source and a synthetic demo identity. Same redirect pattern as
  // support sessions: the single enforcement point for every route.
  if (session.demo) {
    const { getDemoSession } = await import("@/lib/demo/session");
    const ds = await getDemoSession(session.demo.sid);
    if (!ds || ds.deletedAt || ds.sourceId !== session.demo.source) return null;
    if (new Date(ds.expiresAt).getTime() <= Date.now()) return null;
    const role = session.demo.persona === "assistant" ? "assistant" : "lawyer";
    const demoUser = {
      id: `demo:${ds.id}`,
      email: `demo@subsumio.invalid`,
      name: "Demo-Kanzlei",
      passwordHash: "",
      role,
      plan: "enterprise",
      locale: "de",
      referralCode: "",
      referredBy: null,
      brainId: ds.sourceId,
      stripeCustomerId: null,
      jurisdiction: ds.jurisdiction === "de" ? "DE" : "AT",
      onboardingCompletedAt: new Date().toISOString(),
      createdAt: ds.createdAt,
    } as User;
    const headers: Record<string, string> = { "x-subsumio-source": ds.sourceId };
    const apiKey = env("SUBSUMIO_WEB_API_KEY");
    if (apiKey) headers["x-subsumio-api-key"] = apiKey;
    if (demoUser.jurisdiction) headers["x-subsumio-jurisdiction"] = demoUser.jurisdiction;
    addCallerIdentity(headers, ds.sourceId, demoUser);
    return {
      headers,
      brainId: ds.sourceId,
      plan: "enterprise",
      user: demoUser,
      billing: { ownerId: `demo:${ds.id}`, ownerType: "user" },
      demo: {
        sid: ds.id,
        sourceId: ds.sourceId,
        persona: session.demo.persona,
        jurisdiction: ds.jurisdiction,
        questionsUsed: ds.questionsUsed,
        questionsCap: ds.questionsCap,
        ingested: ds.ingested,
      },
    };
  }

  const user = await getStore().getById(session.uid);
  if (!user) return null;
  if (user.deactivatedAt) return null;

  let brainId = user.brainId;
  let plan: Plan = effectivePlan(user);
  let effectiveUser = user;
  let supportSession: SupportSession | undefined;
  let billing = billingAccountFor(user, null);
  // The firm's "Nur EU" setting, enforced by the engine for every request.
  let modelPolicy: "any" | "eu_only" | undefined;

  if (isPlatformOperator(user)) {
    const active = await getActiveSupportSession(user.id);
    if (active) {
      // A tenant is a firm or a lawyer working alone (see src/lib/tenants.ts).
      const tenant = await getTenant(active.orgId);
      if (tenant) {
        brainId = tenant.brainId;
        billing = { ownerId: tenant.billing.ownerId, ownerType: tenant.billing.ownerType };
        const payer = await getStore().getById(tenant.billing.ownerId);
        if (payer) plan = effectivePlan(payer);
        supportSession = active;
        modelPolicy = tenant.org?.modelPolicy;
        effectiveUser = { ...user, role: "admin", orgId: tenant.org?.id ?? null };
      }
    }
  }
  if (!supportSession && user.orgId) {
    const org = await getOrgStore().getById(user.orgId);
    // Defence in depth: members are deactivated on suspension, but an account
    // added afterwards (SCIM, invite) must not work in a suspended firm either.
    if (org?.suspendedAt) return null;
    if (org) {
      brainId = org.brainId;
      modelPolicy = org.modelPolicy;
      billing = billingAccountFor(user, org);
      const payer = await getStore().getById(billing.ownerId);
      if (payer) plan = effectivePlan(payer);
    } else {
      // `orgId` without a firm behind it (older Stripe checkouts wrote their
      // billing id here). The person works alone; repair the record.
      effectiveUser = { ...user, orgId: null };
      void getStore()
        .update(user.id, { orgId: null })
        .catch(() => {});
    }
  }

  const headers: Record<string, string> = { "x-subsumio-source": brainId };
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;
  // Thread the user's jurisdiction to the engine so readSourcesFor() can
  // scope the shared statute corpus to the attorney's country only.
  // DE → DE_LAW_SOURCES_ALL, AT → AT_LAW_SOURCES_ALL, CH → CH_LAW_SOURCES_ALL
  // (jeweils Statutes + eigene Judikatur-Source + law-eu).
  // Without this header the engine falls back to all shared sources (backward compat).
  if (user.jurisdiction) {
    headers["x-subsumio-jurisdiction"] = user.jurisdiction;
  }
  // Always stated (eu_only | any): the engine remembers it per source so the
  // firm's server-side work without a session stays under the same policy.
  headers[MODEL_POLICY_HEADER] = modelPolicyHeaderValue(modelPolicy);
  addCallerIdentity(headers, brainId, effectiveUser);
  return {
    headers,
    brainId,
    plan,
    user: effectiveUser,
    billing,
    supportSession,
    ...(session.sid ? { sessionId: session.sid } : {}),
    ...(session.must2fa ? { must2fa: true } : {}),
  };
}

/**
 * Signs who is calling into the engine headers, so the engine applies the
 * matter access rules (walls, restricted matters, grants — see
 * server/src/core/matter-access.ts) to this person. Every engine call made
 * on behalf of a signed-in user or an API key carries it.
 */
export function addCallerIdentity(
  headers: Record<string, string>,
  brainId: string,
  user: Pick<User, "id" | "role" | "orgId">
): Record<string, string> {
  const token = createSignedIdentityToken(brainId, "all", {
    userId: user.id,
    role: user.role,
    orgId: user.orgId,
  });
  if (token) headers["x-subsumio-identity-token"] = token;
  return headers;
}

/**
 * The brain a user's work lives in — the firm's shared brain for a team
 * member (`org.brainId`), otherwise their personal one. Same resolution as
 * engineContext() (minus support sessions, which never apply to a login).
 * A member's own `user.brainId` is the unused personal workspace from their
 * signup (org/join leaves it untouched), so firm-wide settings must never be
 * read from it. Returns null when the firm is suspended. Store errors throw.
 */
export async function firmBrainIdFor(
  user: Pick<User, "brainId" | "orgId">
): Promise<string | null> {
  if (!user.orgId) return user.brainId;
  const org = await getOrgStore().getById(user.orgId);
  if (org?.suspendedAt) return null;
  // `orgId` without a firm behind it: the person works alone (see engineContext).
  return org ? org.brainId : user.brainId;
}

/**
 * Engine headers for a known user WITHOUT a browser session — used by the
 * calendar subscription, where Outlook or Google fetches the feed on its own.
 * Resolves the same brain the person would get when signed in and signs their
 * identity, so the engine applies the matter access rules to the feed too.
 * Returns null for an unknown, deactivated or suspended account.
 */
export async function engineHeadersForUserId(
  userId: string
): Promise<{ headers: Record<string, string>; user: User } | null> {
  const user = await getStore().getById(userId);
  if (!user || user.deactivatedAt) return null;

  const brainId = await firmBrainIdFor(user);
  if (!brainId) return null;

  const headers: Record<string, string> = { "x-subsumio-source": brainId };
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;
  if (user.jurisdiction) headers["x-subsumio-jurisdiction"] = user.jurisdiction;
  addCallerIdentity(headers, brainId, user);
  return { headers, user };
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

// ── Case Jurisdiction Resolution (WP3) ────────────────────────────────

/**
 * In-memory cache for case jurisdiction lookups.
 * Key: `${brainId}:${caseSlug}`, Value: `{ jurisdiction, expiresAt }`.
 * TTL: 60 seconds — balances freshness with performance for rapid
 * successive queries on the same case.
 */
const caseJurisdictionCache = new Map<string, { jurisdiction: string; expiresAt: number }>();
const CASE_JURISDICTION_CACHE_TTL_MS = 60_000;

/**
 * Resolve the jurisdiction of a case from its engine page frontmatter.
 * Used to set `x-subsumio-case-jurisdiction` on engine calls so
 * `readSourcesFor()` scopes the law corpus to the case's country
 * (Case > User > Fail-Closed architecture).
 *
 * Returns undefined when the case page cannot be fetched or has no
 * jurisdiction set — in that case the engine falls back to the user's
 * jurisdiction header (`x-subsumio-jurisdiction`).
 */
export async function resolveCaseJurisdiction(
  caseSlug: string,
  headers: Record<string, string>
): Promise<string | undefined> {
  const cacheKey = `${headers["x-subsumio-source"] ?? "default"}:${caseSlug}`;
  const cached = caseJurisdictionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.jurisdiction;
  }

  try {
    const encodedSlug = caseSlug.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return undefined;
    const page = (await res.json()) as {
      frontmatter?: Record<string, unknown>;
    };
    const fm = page.frontmatter ?? {};
    const jurisdiction =
      typeof fm.jurisdiction === "string" ? fm.jurisdiction.toLowerCase() : undefined;
    if (jurisdiction && ["at", "de", "ch", "eu"].includes(jurisdiction)) {
      caseJurisdictionCache.set(cacheKey, {
        jurisdiction,
        expiresAt: Date.now() + CASE_JURISDICTION_CACHE_TTL_MS,
      });
      return jurisdiction;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build engine headers with case jurisdiction injected.
 *
 * Resolves the case's jurisdiction from the engine page frontmatter and
 * adds `x-subsumio-case-jurisdiction` header. This header takes priority
 * over `x-subsumio-jurisdiction` (user jurisdiction) in the engine's
 * `readSourcesFor()` — implementing the "Case > User > Fail-Closed"
 * jurisdiction isolation architecture.
 *
 * When caseSlug is empty or the case has no jurisdiction, the returned
 * headers are unchanged (user jurisdiction remains active).
 */
export async function engineHeadersWithCaseJurisdiction(
  baseHeaders: Record<string, string>,
  caseSlug: string | undefined
): Promise<Record<string, string>> {
  if (!caseSlug?.trim()) return baseHeaders;
  const caseJur = await resolveCaseJurisdiction(caseSlug.trim(), baseHeaders);
  if (!caseJur) return baseHeaders;
  return { ...baseHeaders, "x-subsumio-case-jurisdiction": caseJur };
}

/**
 * Engine headers for a KNOWN brainId — for trusted server-side jobs (cron,
 * webhooks) that act on behalf of a tenant without a browser session.
 * Never expose to request-derived input: the caller must own the brainId.
 */
/**
 * Headers for deployment-wide probes (queue health, readiness) that belong to
 * no firm. In fail-closed tenant mode the engine rejects every /api call whose
 * source header is missing or "default", so monitoring sends its own marker.
 */
export function engineMonitoringHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "x-subsumio-source": env("SUBSUMIO_MONITORING_SOURCE") || "ops-health-probe",
  };
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;
  return headers;
}

export function engineHeadersForBrain(brainId: string): Record<string, string> {
  const headers: Record<string, string> = { "x-subsumio-source": brainId };
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;
  return headers;
}

/**
 * P0-SECR-002: Engine headers for a KNOWN brainId + verified matter scope.
 *
 * Used by the WhatsApp path (legal-chat/actions.ts) after the caller's
 * identity has been verified via resolveSenderIdentity(). The matter scope
 * is encoded in a signed identity token (HMAC-SHA256) and sent as
 * x-subsumio-identity-token — the engine verifies the signature before
 * trusting the scope claim.
 *
 * This is the ONLY function that should be called for WhatsApp callers.
 * engineHeadersForBrain (without matter scope) is for trusted server-side
 * jobs (cron, webhooks) that don't need per-matter filtering.
 */
export function engineHeadersForBrainWithMatterScope(
  brainId: string,
  matterScope: string[] | "all"
): Record<string, string> {
  const headers = engineHeadersForBrain(brainId);
  const token = createSignedIdentityToken(brainId, matterScope);
  if (token) headers["x-subsumio-identity-token"] = token;
  return headers;
}

/**
 * Merge-update a page's frontmatter (and optionally content/title/type) on the
 * engine.
 *
 * The engine has NO `PATCH` route on `/api/pages`. A partial update is
 * `POST /api/pages` with `merge:true`: the engine loads the existing page, overlays the provided
 * frontmatter keys, and keeps the body/title/type when omitted. This helper is
 * the single correct way for server routes to patch a page. The previous
 * `PATCH ${ENGINE_URL}/api/pages/{slug}` calls hit a non-existent route and
 * 404'd silently, so every frontmatter writeback (case reconciliation, analysis
 * status, archive/restore cascades) was a no-op.
 *
 * Deleting is a separate route: `DELETE /api/pages/{slug}` soft-deletes the
 * page (`deleted_at`, matter write check, restorable; lists leave it out).
 * Some web paths still "delete" by stamping `status: "tombstoned"` through
 * this helper instead — see src/lib/tombstone.ts.
 *
 * Semantics worth knowing:
 *  - Pass a frontmatter key with value `null` to REMOVE it — the engine drops
 *    `null`/`undefined` keys on merge.
 *  - There is NO optimistic locking (no If-Match / version CAS). Callers that
 *    need to read-modify-write an array do a plain read then this write;
 *    concurrent writers race last-writer-wins. Keep such arrays as SECONDARY
 *    truth (the authoritative link is the `case_slug` stamp on the document).
 *  - `slug` goes in the BODY (unencoded) — do NOT URL-encode it.
 *
 * Returns the raw `Response` so callers can branch on status; throws only on
 * network/timeout failure (same contract as a bare `fetch`).
 */
export async function enginePatchPage(
  headers: Record<string, string>,
  body: {
    slug: string;
    frontmatter?: Record<string, unknown>;
    content?: string;
    title?: string;
    type?: string;
  } & Record<string, unknown>,
  opts?: { timeoutMs?: number }
): Promise<Response> {
  return fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ ...body, merge: true }),
    signal: AbortSignal.timeout(opts?.timeoutMs ?? 30_000),
  });
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
  creditOp?: CreditOperation
): Promise<GuardedContext | Response> {
  const ctx = await engineContext();
  if (!ctx) return unauthorized();

  // 0. Firm-wide 2FA requirement: a must2fa session reaches only the 2FA
  //    setup routes (middleware.ts applies the same gate to /api/* at the
  //    edge; this is the per-route enforcement for every createHandler route).
  if (ctx.must2fa) {
    let pathname = "";
    try {
      pathname = new URL(req.url).pathname;
    } catch {
      // Unparseable URL → not on the allowlist → refused below.
    }
    if (!isAllowedDuringTwoFactorSetup(pathname, req.method)) {
      return twoFactorSetupRequiredResponse();
    }
  }

  // 1. RBAC
  if (!can(ctx.user, action)) {
    return forbidden(action);
  }

  // 1b. A read-only support session changes nothing in the firm.
  if (supportSessionBlocksRequest(ctx.supportSession, req.method, action)) {
    return Response.json(
      {
        error: "support_read_only",
        message:
          "Support-Zugriff ist nur lesend. Für Änderungen eine Sitzung mit Schreibzugriff (eigene Begründung) starten.",
      },
      { status: 403 }
    );
  }

  const guard = await applyUsageGuards(ctx, rateTier, quotaField, creditOp);
  if (guard) return guard;
  return ctx;
}

/**
 * Rate limit, credit and quota checks for an already authenticated caller —
 * shared by the session path (requireEngineContext) and the API-key path
 * (createHandler in src/lib/api-handler.ts), so a `sk_live_` key cannot skip
 * what a browser session is held to. The rate-limit bucket is the acting
 * user's: a key shares its owner's budget, and several keys cannot multiply it.
 * Returns the refusal Response, or null when the request may proceed.
 */
export async function applyUsageGuards(
  ctx: EngineContext,
  rateTier: RateTier,
  quotaField?: QuotaType,
  creditOp?: CreditOperation
): Promise<Response | null> {
  // 2. Rate-Limit
  const rateCheck = await requireApiRate(ctx.user.id, rateTier);
  if (rateCheck) return rateCheck;

  // 3. Credits (optional — checked before quota)
  // E2E harness: fresh signup users have zero credits and would 402 every
  // paid op. SUBSUMIO_E2E=1 skips the gate; the flag is never set in real
  // production (previously also gated on NODE_ENV !== "production", but
  // `next start` forces NODE_ENV=production which would block the e2e
  // production-build server).
  const e2eBypass = env("SUBSUMIO_E2E") === "1";
  // Demo sessions bill LLM use against their per-session question budget
  // (demo guard in api-handler) — never against real credits or plan quotas.
  const isDemo = Boolean(ctx.demo);
  if (creditOp && CREDIT_COSTS[creditOp] > 0 && !e2eBypass && !isDemo) {
    const ownerType: OwnerType = ctx.billing.ownerType;
    const ownerId = ctx.billing.ownerId;
    // New accounts start with the 30-day trial balance (idempotent, one-time).
    await ensureTrialCredits(ownerId, ownerType);
    const creditCheck = await checkCredits(ownerId, ownerType, CREDIT_COSTS[creditOp]);
    if (!creditCheck.ok) {
      return insufficientCreditsResponse(creditCheck.balance, creditCheck.required);
    }
  }

  // 4. Quota (optional)
  if (quotaField && !isDemo) {
    const quota = await checkQuota(ctx.brainId, ctx.plan, quotaField);
    if (!quota.ok) {
      return quotaExceeded(quotaField, quota.used, quota.limit);
    }
  }

  return null;
}

/**
 * Record a quota consumption after a successful operation.
 * Fire-and-forget; errors are logged but not thrown.
 */
export async function recordQuota(
  ctx: GuardedContext,
  field: QuotaType,
  amount = 1
): Promise<void> {
  if (ctx.demo) return;
  await incQuota(ctx.brainId, field, amount);
}

/**
 * Record credit consumption after a successful AI operation.
 * Fire-and-forget; errors are logged but not thrown.
 * Credits are only deducted after the operation succeeds (no charge for failed queries).
 */
export interface ActionUsage {
  modelId?: string | null;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
}

export async function recordCreditConsumption(
  ctx: GuardedContext,
  operation: CreditOperation,
  caseSlug?: string,
  usage?: ActionUsage,
  /** Pass one when the usage is only known later — see attachUsageToBooking. */
  idempotencyKey?: string
): Promise<{ ok: boolean; balance?: number; required?: number }> {
  const cost = CREDIT_COSTS[operation];
  if (cost <= 0 || ctx.demo) return { ok: true };
  const ownerType: OwnerType = ctx.billing.ownerType;
  const ownerId = ctx.billing.ownerId;
  let booked = false;
  try {
    const deducted = await deductCredits(ownerId, ownerType, cost, {
      operation,
      caseSlug,
      usage,
      idempotencyKey,
    });
    if (!deducted.ok) {
      // The pre-flight check passed but the booking did not (parallel requests
      // drained the balance, spend cap, or a database error). Never silent:
      // this is AI work that went unpaid.
      log.warn(
        `[credits] booking refused: operation=${operation} owner=${ownerType}:${ownerId} ` +
          `required=${deducted.required} balance=${deducted.balance}`
      );
      return { ok: false, balance: deducted.balance, required: deducted.required };
    }
    booked = true;
    // Budget Alert prüfen (50%/75%/90% wie OpenAI) — non-blocking.
    // Fire-and-forget: don't fail the operation if the alert fails.
    const { balance } = await getBalance(ownerId, ownerType);
    if (ctx.user.email) {
      checkAndSendBudgetAlert(ownerId, ownerType, ctx.user.email, balance).catch(() => {
        // best-effort, ignore errors
      });
    }
    return { ok: true, balance };
  } catch (err) {
    log.error(
      `[credits] consumption record failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { ok: booked };
  }
}

/**
 * Lightweight wrapper: nur Auth + RBAC (für Endpunkte ohne Rate/Quota).
 */
export async function requireAuthAction(action: RouteAction): Promise<GuardedContext | Response> {
  const ctx = await engineContext();
  if (!ctx) return unauthorized();
  // No request path here, so nothing is on the 2FA-setup allowlist.
  if (ctx.must2fa) return twoFactorSetupRequiredResponse();
  if (!can(ctx.user, action)) return forbidden(action);
  return ctx;
}
