import { NextRequest } from "next/server";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Aggregated health/readiness probe. Returns 200 when all critical systems
 * are reachable, 503 when any required service is down.
 *
 * Used by load-balancers, uptime monitors, and deployment pipelines.
 * Does NOT require authentication — kept lightweight and public.
 */
export async function GET(_req: NextRequest) {
  const start = Date.now();
  const checks: Record<
    string,
    { status: "ok" | "degraded" | "down"; latencyMs?: number; detail?: string }
  > = {};

  // 1. Engine (GBrain)
  const engineStart = Date.now();
  try {
    const res = await fetch(`${ENGINE_URL}/api/stats`, {
      signal: AbortSignal.timeout(4_000),
    });
    checks.engine = res.ok
      ? { status: "ok", latencyMs: Date.now() - engineStart }
      : { status: "degraded", latencyMs: Date.now() - engineStart };
  } catch {
    checks.engine = { status: "down", latencyMs: Date.now() - engineStart };
  }

  // 2. Auth store (cold read)
  const authStart = Date.now();
  try {
    const { getStore } = await import("@/lib/auth/store");
    // list() with limit to avoid large scans
    const users = await getStore().list();
    checks.auth = {
      status: Array.isArray(users) ? "ok" : "degraded",
      latencyMs: Date.now() - authStart,
    };
  } catch {
    checks.auth = { status: "down", latencyMs: Date.now() - authStart };
  }

  // 3. Stripe billing configuration
  checks.stripe = process.env.STRIPE_SECRET_KEY
    ? { status: "ok" }
    : { status: "degraded", detail: "STRIPE_SECRET_KEY not set" };

  // 4. Sentry error tracking configuration
  checks.sentry =
    process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
      ? { status: "ok" }
      : { status: "degraded", detail: "SENTRY_DSN not set" };

  // 5. Email service (Resend)
  checks.email = process.env.RESEND_API_KEY
    ? { status: "ok" }
    : { status: "degraded", detail: "RESEND_API_KEY not set" };

  const allOk = Object.values(checks).every((c) => c.status === "ok");
  const anyDown = Object.values(checks).some((c) => c.status === "down");

  const status = anyDown ? 503 : 200;
  const overall = anyDown ? "degraded" : allOk ? "ok" : "degraded";

  return Response.json(
    {
      status: overall,
      durationMs: Date.now() - start,
      checks,
    },
    { status }
  );
}
