import type { NextRequest } from "next/server";
import { createPublicHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/auth/rate-limit";
import { hasValidInternalSecret } from "@/lib/auth/internal";
import { timingSafeCompare } from "@/lib/crypto-utils";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "degraded" | "down" | "unchecked";
type Check = { status: CheckStatus; latencyMs?: number; detail?: string };

/** Operators (CRON_SECRET bearer or internal secret) get the diagnostic details. */
function isOperatorCaller(req: NextRequest): boolean {
  if (hasValidInternalSecret(req)) return true;
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  return Boolean(secret && auth && timingSafeCompare(auth, `Bearer ${secret}`));
}

/**
 * GET /api/readiness — Deep readiness probe.
 *
 * Checks that all critical dependencies are reachable and configured:
 *   1. Engine (Subsumio) — tenant-free GET /health
 *   2. Auth store — one indexed point lookup (no table scan, no decryption)
 *   3. Critical env vars — AUTH_SECRET, SUBSUMIO_API_URL, SUBSUMIO_WEB_API_KEY
 *   4. Optional services — Stripe, Sentry, Resend (degraded, not down)
 *
 * Returns 200 when all critical checks pass, 503 when any critical
 * dependency is down. OCR and SMTP are not probed here and say so
 * ("unchecked") instead of reporting a green they never verified.
 *
 * Public and rate-limited per IP. Anonymous callers see statuses only;
 * error texts and missing configuration are returned only to operators
 * (CRON_SECRET bearer or x-internal-secret).
 */
export const GET = createPublicHandler(
  {
    cacheMaxAge: 0, // Readiness checks should not be cached
    rateLimitKey: (req) => `readiness:ip:${clientIp(req.headers)}`,
    rateLimitMax: 20,
    rateLimitWindowMs: 60_000,
  },
  async (req) => {
    const start = Date.now();
    const checks: Record<string, Check> = {};

    // 1. Engine (Subsumio) — critical. /health needs no tenant, so the probe
    //    never acts on behalf of any firm.
    const engineStart = Date.now();
    try {
      const res = await fetch(`${ENGINE_URL}/health`, { signal: AbortSignal.timeout(4_000) });
      checks.engine = res.ok
        ? { status: "ok", latencyMs: Date.now() - engineStart }
        : {
            status: "down",
            latencyMs: Date.now() - engineStart,
            detail: `Engine /health returned ${res.status}`,
          };
    } catch (err) {
      checks.engine = {
        status: "down",
        latencyMs: Date.now() - engineStart,
        detail: err instanceof Error ? err.message : "unreachable",
      };
    }

    // 2. Auth store — critical. A point lookup by id proves the store answers
    //    without reading (and decrypting) every user row.
    const authStart = Date.now();
    try {
      const { getStore } = await import("@/lib/auth/store");
      await getStore().getById("__readiness_probe__");
      checks.auth = { status: "ok", latencyMs: Date.now() - authStart };
    } catch (err) {
      checks.auth = {
        status: "down",
        latencyMs: Date.now() - authStart,
        detail: err instanceof Error ? err.message : "store unavailable",
      };
    }

    // 3. Critical env vars
    const missingCritical: string[] = [];
    if (!env("AUTH_SECRET")) missingCritical.push("AUTH_SECRET");
    if (!env("SUBSUMIO_API_URL")) missingCritical.push("SUBSUMIO_API_URL");
    if (!env("SUBSUMIO_WEB_API_KEY")) missingCritical.push("SUBSUMIO_WEB_API_KEY");

    checks.config =
      missingCritical.length === 0
        ? { status: "ok" }
        : { status: "down", detail: `Missing: ${missingCritical.join(", ")}` };

    // 4. Optional services — degraded, not down
    checks.stripe = process.env.STRIPE_SECRET_KEY
      ? { status: "ok" }
      : { status: "degraded", detail: "STRIPE_SECRET_KEY not set" };

    checks.sentry =
      process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
        ? { status: "ok" }
        : { status: "degraded", detail: "SENTRY_DSN not set" };

    checks.email = process.env.RESEND_API_KEY
      ? { status: "ok" }
      : { status: "degraded", detail: "RESEND_API_KEY not set" };

    // 5. OCR and 6. SMTP are not probed by this firm-less endpoint (SMTP is
    //    configured per firm — see /api/cron/health). Say so honestly.
    checks.ocr = { status: "unchecked", detail: "not probed by /api/readiness" };
    checks.smtp = { status: "unchecked", detail: "configured per firm — see /api/cron/health" };

    // Determine overall status: critical checks (engine, auth, config) must be ok
    const criticalKeys = ["engine", "auth", "config"];
    const anyCriticalDown = criticalKeys.some((k) => checks[k]?.status === "down");
    const allOk = Object.values(checks).every((c) => c.status === "ok" || c.status === "unchecked");

    const status = anyCriticalDown ? 503 : 200;
    const overall = anyCriticalDown ? "down" : allOk ? "ok" : "degraded";

    // Anonymous callers: statuses only — no error texts, hosts or config gaps.
    const publicChecks = isOperatorCaller(req)
      ? checks
      : Object.fromEntries(Object.entries(checks).map(([k, c]) => [k, { status: c.status }]));

    return Response.json(
      {
        status: overall,
        durationMs: Date.now() - start,
        checks: publicChecks,
      },
      { status }
    );
  }
);
