/**
 * Central API route handler wrapper.
 *
 * Replaces the ad-hoc pattern of calling requireEngineContext + manual
 * validation + manual error handling + manual audit logging in every
 * route. Instead, declare a route like:
 *
 * ```ts
 * export const POST = createHandler({
 *   action: "legal.contract_draft",
 *   rateTier: "heavy",
 *   quota: "queries",
 *   body: contractDraftSchema,
 *   audit: (ctx, body) => ({
 *     action: "legal.contract_draft",
 *     entityType: "contract",
 *     details: { type: body.type, jurisdiction: body.jurisdiction },
 *   }),
 * }, async (ctx, body, req) => {
 *   // ... handler logic with typed body ...
 *   return apiSuccess(result);
 * });
 * ```
 *
 * Guards applied in order:
 *   1. Engine config check
 *   2. Auth (session → EngineContext)
 *   3. RBAC (can(user, action))
 *   4. CSRF (double-submit token for POST/PUT/PATCH/DELETE)
 *   5. Rate limit (per-user, tier-based)
 *   6. Quota (optional)
 *   7. Input validation (Zod schema → typed body)
 *   8. Handler execution
 *   9. Audit log (after successful handler, fire-and-forget)
 */

import type { NextRequest } from "next/server";
import type { z } from "zod";
import {
  requireEngineContext,
  engineConfigurationResponse,
  ENGINE_URL,
  recordQuota,
  type EngineContext,
} from "@/lib/engine";
import type { RouteAction } from "@/lib/permissions";
import type { RateTier } from "@/lib/rate-limit-api";
import type { QuotaType } from "@/lib/plans";
import { validateCsrf, CSRF_COOKIE_NAME } from "@/lib/csrf";
import { logAudit, type AuditAction } from "@/lib/audit";
import { apiError, apiRateLimited, apiStream } from "@/lib/api-response";
import { isAppError } from "@/lib/errors";
import {
  createCitationGateStream,
  groundJsonResponse,
  emptyGroundingMetadata,
} from "@/lib/citation-gate";
import { sanitizeObjectStrings } from "@/lib/prompt-sanitizer";
import { validateCronAuth } from "@/lib/cron-auth";
import { timingSafeCompare } from "@/lib/crypto-utils";
import { env } from "@/lib/env";
import { verifyApiKey } from "@/lib/auth/api-key-auth";

// ── Types ─────────────────────────────────────────────────────────────

export type HandlerContext = EngineContext;

/**
 * Next.js 15.5 generated route context type.
 * Must be structurally identical to the type Next.js emits in
 * .next/types/.../route.ts for the build-time Diff check to pass.
 */
type SegmentParams<T extends object = object> = T extends Record<string, unknown>
  ? { [K in keyof T]: T[K] extends string ? string | string[] | undefined : never }
  : T;

export type RouteContext = { params: Promise<SegmentParams> };

export interface AuditSpec {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

export interface HandlerOptions<
  B extends z.ZodTypeAny | undefined,
  Q extends z.ZodTypeAny | undefined,
> {
  /** RBAC action required for this route. */
  action: RouteAction;
  /** Rate-limit tier. Default: "standard". */
  rateTier?: RateTier;
  /** Quota field to check before handler runs. */
  quota?: QuotaType;
  /** Zod schema for the request body (POST/PUT/PATCH). */
  body?: B;
  /** Zod schema for query params (GET). */
  query?: Q;
  /** Max request duration in seconds (sets maxDuration export). */
  maxDuration?: number;
  /** Whether to skip CSRF validation. Default: false (CSRF on for all state-changing methods). */
  skipCsrf?: boolean;
  /** Whether this is a public route (no auth required). */
  public?: boolean;
  /** Whether to allow internal service calls via x-internal-secret header (skips auth/CSRF). */
  allowInternal?: boolean;
  /** Whether to add CORS headers for cross-origin access (portal, webhooks). */
  cors?: boolean;
  /** Cache-Control max-age for GET responses (seconds). */
  cacheMaxAge?: number;
  /** Custom auth guard function. If provided, replaces default session auth. */
  customAuth?: (req: NextRequest) => Response | { context: Record<string, unknown> };
  /** Audit spec — logged after successful handler execution. */
  audit?: (
    ctx: HandlerContext,
    body: ValidatedBody<B>,
    query: ValidatedQuery<Q>,
    req?: NextRequest
  ) => AuditSpec | AuditSpec[];
}

export type ValidatedBody<B> = B extends z.ZodTypeAny ? z.infer<B> : undefined;
export type ValidatedQuery<Q> = Q extends z.ZodTypeAny ? z.infer<Q> : undefined;

// ── CORS helper ───────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-csrf-token",
  "Access-Control-Max-Age": "86400",
};

function handleCors(req: NextRequest, cors: boolean): Response | null {
  if (!cors) return null;
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return null;
}

function withCorsHeaders(response: Response, cors: boolean): Response {
  if (!cors) return response;
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

// ── CSRF ──────────────────────────────────────────────────────────────

function isStateChanging(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function checkCsrf(req: NextRequest, skip: boolean): Response | null {
  if (skip || !isStateChanging(req.method)) return null;

  // Import cookies lazily to avoid edge-runtime bundling issues
  // The CSRF cookie is non-httpOnly so client JS can read it
  const cookieValue = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (!validateCsrf(req, cookieValue)) {
    return apiError("csrf_invalid", "CSRF token missing or invalid", 403);
  }
  return null;
}

// ── Validation ────────────────────────────────────────────────────────

async function parseAndValidateBody<B extends z.ZodTypeAny>(
  schema: B,
  req: NextRequest
): Promise<{ data: z.infer<B> } | { error: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: apiError("invalid_json", "Request body is not valid JSON", 400) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      error: apiError("validation_failed", "Request body validation failed", 400, {
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      }),
    };
  }
  return { data: result.data };
}

async function parseAndValidateQuery<Q extends z.ZodTypeAny>(
  schema: Q,
  req: NextRequest
): Promise<{ data: z.infer<Q> } | { error: Response }> {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const result = schema.safeParse(params);
  if (!result.success) {
    return {
      error: apiError("validation_failed", "Query parameter validation failed", 400, {
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      }),
    };
  }
  return { data: result.data };
}

// ── Main handler factory ──────────────────────────────────────────────

/**
 * Create a POST route handler with full guard pipeline.
 */
export function createHandler<
  B extends z.ZodTypeAny | undefined = undefined,
  Q extends z.ZodTypeAny | undefined = undefined,
>(
  options: HandlerOptions<B, Q>,
  handler: (
    ctx: HandlerContext,
    body: ValidatedBody<B>,
    query: ValidatedQuery<Q>,
    req: NextRequest
  ) => Promise<Response>
): (req: NextRequest, routeContext: RouteContext) => Promise<Response> {
  return async (req: NextRequest, routeContext: RouteContext) => {
    // Attach params from Next.js route context to req so handlers can access them
    if (routeContext?.params) {
      (req as unknown as RouteContext).params = routeContext.params;
    }

    // 0. CORS preflight
    const corsResponse = handleCors(req, options.cors ?? false);
    if (corsResponse) return corsResponse;

    // 1. Engine config check — only block state-changing operations.
    //    GET routes have their own try/catch with graceful fallbacks (empty
    //    lists, zeroed stats) so the dashboard remains usable even when the
    //    engine is temporarily unreachable.
    if (isStateChanging(req.method)) {
      const configError = engineConfigurationResponse();
      if (configError) return withCorsHeaders(configError, options.cors ?? false);
    }

    // 1b. Internal service bypass (x-internal-secret)
    let internalContext: EngineContext | null = null;
    if (options.allowInternal) {
      const internalSecret = req.headers.get("x-internal-secret");
      const expected = env("SUBSUMIO_INTERNAL_SECRET");
      if (expected && internalSecret && timingSafeCompare(internalSecret, expected)) {
        const apiKey = env("SUBSUMIO_WEB_API_KEY") || "";
        internalContext = {
          brainId: "internal",
          plan: "enterprise",
          user: {
            id: "internal",
            email: "internal@subsumio",
            name: "Internal Service",
            passwordHash: "",
            role: "admin",
            plan: "enterprise",
            locale: "de",
            referralCode: "",
            referredBy: null,
            brainId: "internal",
            stripeCustomerId: null,
          } as EngineContext["user"],
          headers: apiKey ? { "x-subsumio-api-key": apiKey } : {},
        };
      }
    }

    // 2. Auth + RBAC + Rate-limit + Quota (skip if internal, custom auth, or public)
    let ctx: EngineContext;
    let isApiKeyAuth = false;
    let customContext: Record<string, unknown> | null = null;

    if (internalContext) {
      ctx = internalContext;
    } else if (options.customAuth) {
      // Use custom auth guard (e.g., SCIM Bearer token)
      const customResult = options.customAuth(req);
      if (customResult instanceof Response) {
        return withCorsHeaders(customResult, options.cors ?? false);
      }
      customContext = customResult.context;
      // For custom auth, we don't have a full EngineContext, so create a minimal one
      ctx = {
        brainId: (customContext.brainId as string) || "custom",
        plan: "enterprise",
        user: {
          id: "custom",
          email: "custom@subsumio",
          name: "Custom Auth",
          passwordHash: "",
          role: "admin",
          plan: "enterprise",
          locale: "de",
          referralCode: "",
          referredBy: null,
          brainId: (customContext.brainId as string) || "custom",
          stripeCustomerId: null,
        } as EngineContext["user"],
        headers: {},
        ...customContext,
      } as EngineContext & Record<string, unknown>;
    } else if (options.public) {
      // Public route — no auth required, create a minimal context
      ctx = {
        brainId: "public",
        plan: "free",
        user: {
          id: "anonymous",
          email: "anonymous@subsumio",
          name: "Anonymous",
          passwordHash: "",
          role: "assistant",
          plan: "free",
          locale: "de",
          referralCode: "",
          referredBy: null,
          brainId: "public",
          stripeCustomerId: null,
          createdAt: new Date().toISOString(),
        } as unknown as EngineContext["user"],
        headers: {},
      } as EngineContext;
    } else {
      const authCtx = await requireEngineContext(
        req,
        options.action,
        options.rateTier ?? "standard",
        options.quota
      );
      if (authCtx instanceof Response) {
        // Session auth failed — try API key auth (Bearer token)
        const apiKeyResult = await verifyApiKey(req.headers.get("authorization"));
        if (apiKeyResult) {
          ctx = apiKeyResult.ctx;
          isApiKeyAuth = true;
        } else {
          return withCorsHeaders(authCtx, options.cors ?? false);
        }
      } else {
        ctx = authCtx;
      }
    }

    // 3. CSRF (state-changing methods only, skip for internal, API key, and custom auth)
    if (!internalContext && !isApiKeyAuth && !customContext) {
      const csrfError = checkCsrf(req, options.skipCsrf ?? false);
      if (csrfError) return withCorsHeaders(csrfError, options.cors ?? false);
    }

    // 4. Input validation
    let body: ValidatedBody<B> = undefined as ValidatedBody<B>;
    let query: ValidatedQuery<Q> = undefined as ValidatedQuery<Q>;

    if (options.body && isStateChanging(req.method)) {
      const result = await parseAndValidateBody(options.body, req);
      if ("error" in result) return withCorsHeaders(result.error, options.cors ?? false);
      body = result.data as ValidatedBody<B>;
    }

    if (options.query && req.method === "GET") {
      const result = await parseAndValidateQuery(options.query, req);
      if ("error" in result) return withCorsHeaders(result.error, options.cors ?? false);
      query = result.data as ValidatedQuery<Q>;
    }

    // 5. Handler execution
    let response: Response;
    try {
      response = await handler(ctx, body, query, req);
    } catch (err) {
      if (isAppError(err)) {
        response = apiError(err.code, err.message, err.statusCode, err.details);
      } else {
        console.error(
          `[api-handler] uncaught error for action '${options.action}':`,
          err instanceof Error ? err.message : String(err)
        );
        response = apiError("internal_error", "An unexpected error occurred", 500);
      }
    }

    // 6. Audit log (fire-and-forget, only on success)
    if (response.ok && options.audit) {
      try {
        const spec = options.audit(ctx, body, query, req);
        const specs = Array.isArray(spec) ? spec : [spec];
        for (const s of specs) {
          void logAudit(s.action, s.entityType, {
            entityId: s.entityId,
            details: s.details,
          });
        }
      } catch {
        // Audit logging must never break the response
      }
    }

    // 7. Caching headers for GET
    if (req.method === "GET" && options.cacheMaxAge && response.ok) {
      response.headers.set("Cache-Control", `private, max-age=${options.cacheMaxAge}`);
    }

    return withCorsHeaders(response, options.cors ?? false);
  };
}

/**
 * Lightweight handler for public routes (no auth, no RBAC).
 * Still applies CSRF, validation, CORS, and rate-limiting.
 */
export function createPublicHandler<
  B extends z.ZodTypeAny | undefined = undefined,
  Q extends z.ZodTypeAny | undefined = undefined,
>(
  options: Omit<HandlerOptions<B, Q>, "action" | "public"> & {
    rateLimitKey?: (req: NextRequest) => string;
    rateLimitMax?: number;
    rateLimitWindowMs?: number;
  },
  handler: (
    req: NextRequest,
    body: ValidatedBody<B>,
    query: ValidatedQuery<Q>,
    extra: { params?: Promise<Record<string, unknown>> }
  ) => Promise<Response>
): (
  req: NextRequest,
  routeContext: RouteContext
) => Promise<Response> {
  return createHandler(
    { ...options, action: "public" as RouteAction, public: true },
    async (ctx, body, query, req) => handler(req, body, query, { params: (req as unknown as { params?: Promise<Record<string, unknown>> }).params })
  );
}

/**
 * Handler for SCIM routes with custom Bearer token auth.
 * Skips CSRF, uses custom auth guard, applies validation and CORS.
 */
export function createScimHandler<
  B extends z.ZodTypeAny | undefined = undefined,
  Q extends z.ZodTypeAny | undefined = undefined,
>(
  options: Omit<HandlerOptions<B, Q>, "action" | "public" | "skipCsrf"> & {
    customAuth: (req: NextRequest) => Response | { context: Record<string, unknown> };
  },
  handler: (
    ctx: Record<string, unknown>,
    body: ValidatedBody<B>,
    query: ValidatedQuery<Q>,
    extra: { params?: Promise<Record<string, unknown>> }
  ) => Promise<Response>
): (
  req: NextRequest,
  routeContext: RouteContext
) => Promise<Response> {
  return createHandler(
    { ...options, action: "scim" as RouteAction, skipCsrf: true, customAuth: options.customAuth },
    async (ctx, body, query, req) =>
      handler(ctx as unknown as Record<string, unknown>, body, query, {
        params: (req as unknown as { params?: Promise<Record<string, unknown>> }).params,
      })
  );
}

/**
 * Webhook handler factory.
 * Skips auth/CSRF (webhooks use signature verification instead).
 * Still applies CORS, validation, and audit.
 */
export function createWebhookHandler<B extends z.ZodTypeAny | undefined = undefined>(
  options: {
    body?: B;
    cors?: boolean;
    audit?: (body: ValidatedBody<B>) => AuditSpec | AuditSpec[];
  },
  handler: (body: ValidatedBody<B>, req: NextRequest) => Promise<Response>
): (
  req: NextRequest,
  routeContext: RouteContext
) => Promise<Response> {
  return async (req: NextRequest) => {
    // CORS preflight
    const corsResponse = handleCors(req, options.cors ?? false);
    if (corsResponse) return corsResponse;

    // Validation
    let body: ValidatedBody<B> = undefined as ValidatedBody<B>;
    if (options.body) {
      const result = await parseAndValidateBody(options.body, req);
      if ("error" in result) return withCorsHeaders(result.error, options.cors ?? false);
      body = result.data as ValidatedBody<B>;
    }

    // Handler
    let response: Response;
    try {
      response = await handler(body, req);
    } catch (err) {
      if (isAppError(err)) {
        response = apiError(err.code, err.message, err.statusCode, err.details);
      } else {
        console.error(
          "[api-handler] uncaught error in webhook handler:",
          err instanceof Error ? err.message : String(err)
        );
        response = apiError("internal_error", "Webhook processing failed", 500);
      }
    }

    // Audit (fire-and-forget)
    if (response.ok && options.audit) {
      try {
        const spec = options.audit(body);
        const specs = Array.isArray(spec) ? spec : [spec];
        for (const s of specs) {
          void logAudit(s.action, s.entityType, {
            entityId: s.entityId,
            details: s.details,
          });
        }
      } catch {
        // Audit logging must never break the response
      }
    }

    return withCorsHeaders(response, options.cors ?? false);
  };
}

// ── Cron handler ─────────────────────────────────────────────────────

/**
 * Create a cron route handler with cron-auth guard.
 *
 * All cron endpoints must use this instead of calling validateCronAuth
 * manually. Wraps the handler with auth, error handling, and CORS.
 *
 * ```ts
 * export const GET = createCronHandler(async (req) => {
 *   // ... cron logic ...
 *   return Response.json({ ok: true });
 * });
 * ```
 */
export function createCronHandler(
  handler: (req: NextRequest) => Promise<Response>,
  _options?: { maxDuration?: number }
): (
  req: NextRequest,
  routeContext: RouteContext
) => Promise<Response> {
  return async (req: NextRequest) => {
    // CORS preflight
    const corsResponse = handleCors(req, false);
    if (corsResponse) return corsResponse;

    // Cron auth
    const authError = validateCronAuth(req);
    if (authError) return authError;

    // Handler
    let response: Response;
    try {
      response = await handler(req);
    } catch (err) {
      if (isAppError(err)) {
        response = apiError(err.code, err.message, err.statusCode, err.details);
      } else {
        console.error(
          "[api-handler] uncaught error in cron handler:",
          err instanceof Error ? err.message : String(err)
        );
        response = apiError("internal_error", "Cron job failed", 500);
      }
    }

    return response;
  };
}

// ── Engine proxy helper ───────────────────────────────────────────────

/**
 * Create a POST handler that proxies to the Subsumio Engine.
 *
 * Eliminates the repeated fetch + error-handling + quota + stream pattern
 * across 10+ legal proxy routes. Wraps `createHandler` with a standard
 * engine-fetch handler body.
 *
 * ```ts
 * export const POST = createEngineProxy({
 *   action: "legal.memo",
 *   enginePath: "/api/legal/memo",
 *   body: memoSchema,
 *   quota: "queries",
 *   stream: true,
 *   transformBody: (b) => ({ question: b.question, ... }),
 *   audit: (_ctx, b) => ({ action: "legal.memo", entityType: "document", details: { ... } }),
 * });
 * ```
 */
export function createEngineProxy<B extends z.ZodTypeAny>(options: {
  action: RouteAction;
  enginePath: string;
  body: B;
  rateTier?: RateTier;
  quota?: QuotaType;
  /** Custom quota amount (default: 1). */
  quotaAmount?: (body: z.infer<B>) => number;
  /** Whether to stream the engine response (SSE). Default: false (JSON). */
  stream?: boolean;
  /** When true, wrap SSE streams with createCitationGateStream and inject _grounding into JSON responses. */
  citationGate?: boolean;
  /** When true, sanitize all string fields in the payload before forwarding to the engine (prompt injection defense). Default: true. */
  sanitizeBody?: boolean;
  /** Label for error logging. Default: enginePath. */
  label?: string;
  /** Transform the validated body before sending to the engine. */
  transformBody?: (body: z.infer<B>) => Record<string, unknown>;
  audit?: (ctx: HandlerContext, body: z.infer<B>) => AuditSpec | AuditSpec[];
  /** Cache-Control max-age for GET responses (seconds). */
  cacheMaxAge?: number;
}): (
  req: NextRequest,
  routeContext: RouteContext
) => Promise<Response> {
  const label = options.label ?? options.enginePath;
  return createHandler(
    {
      action: options.action,
      rateTier: options.rateTier ?? "heavy",
      quota: options.quota,
      body: options.body,
      audit: options.audit,
      cacheMaxAge: options.cacheMaxAge,
    },
    async (ctx, body, _query, _req) => {
      const rawPayload = options.transformBody
        ? options.transformBody(body as z.infer<B>)
        : (body as Record<string, unknown>);
      const payload =
        (options.sanitizeBody ?? true) ? sanitizeObjectStrings(rawPayload) : rawPayload;
      try {
        const upstream = await fetch(`${ENGINE_URL}${options.enginePath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(options.stream ? 300_000 : 30_000),
        });

        if (!upstream.ok) {
          const errPayload = await upstream.json().catch(() => ({}));
          return Response.json(
            errPayload.error ? errPayload : { error: `Engine returned ${upstream.status}` },
            { status: upstream.status }
          );
        }

        if (options.quota) {
          const amount = options.quotaAmount ? options.quotaAmount(body as z.infer<B>) : 1;
          void recordQuota(ctx, options.quota, amount);
        }

        if (options.stream) {
          if (!upstream.body) {
            return apiError("engine_error", "Engine returned empty body", 502);
          }
          const streamBody = options.citationGate
            ? createCitationGateStream(upstream.body)
            : upstream.body;
          return apiStream(streamBody, {
            contentType: upstream.headers.get("Content-Type") || "text/event-stream",
            aiGenerated: true,
          });
        }

        const resultText = await upstream.text();
        let result: Record<string, unknown>;
        try {
          result = resultText ? (JSON.parse(resultText) as Record<string, unknown>) : {};
        } catch {
          result = { error: "Invalid JSON from engine", raw: resultText.slice(0, 500) };
        }

        if (options.citationGate) {
          try {
            const grounding = await groundJsonResponse(result);
            result._grounding = grounding;
          } catch (err) {
            console.error(
              `[${label}] citation gate grounding failed:`,
              err instanceof Error ? err.message : String(err)
            );
            result._grounding = emptyGroundingMetadata();
          }
        }

        return Response.json(result);
      } catch (err) {
        console.error(
          `[${label}] engine unreachable:`,
          err instanceof Error ? err.message : String(err)
        );
        return apiError("service_unavailable", "Engine nicht erreichbar", 503);
      }
    }
  );
}

// ── Re-exports for convenience ────────────────────────────────────────

export {
  apiError,
  apiSuccess,
  apiPaginated,
  apiStream,
  apiCached,
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiConflict,
  apiUnprocessable,
  apiRateLimited,
  apiUnavailable,
} from "@/lib/api-response";
export { recordQuota } from "@/lib/engine";
export type { ApiErrorBody, ApiSuccessBody } from "@/lib/api-response";
