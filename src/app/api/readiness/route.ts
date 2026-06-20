import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/readiness — Deep readiness probe.
 *
 * Checks that all critical dependencies are reachable and configured:
 *   1. Engine (Subsumio) — fetches /api/stats with API-Key headers
 *   2. Auth store — cold read via getStore().list()
 *   3. Critical env vars — AUTH_SECRET, ENGINE_URL, SUBSUMIO_WEB_API_KEY
 *   4. Optional services — Stripe, Sentry, Resend (degraded, not down)
 *
 * Returns 200 when all critical checks pass, 503 when any critical
 * dependency is down. Optional services report as "degraded" but
 * do not cause a 503.
 *
 * Used by deployment pipelines, Kubernetes readiness probes, and
 * traffic-routing decisions. Does NOT require authentication —
 * kept public but returns no sensitive data.
 */
export async function GET(_req: NextRequest) {
  const start = Date.now();
  const checks: Record<
    string,
    { status: "ok" | "degraded" | "down"; latencyMs?: number; detail?: string }
  > = {};

  // 1. Engine (Subsumio) — critical
  const engineStart = Date.now();
  try {
    const apiKey = env("SUBSUMIO_WEB_API_KEY");
    const headers: Record<string, string> = {};
    if (apiKey) headers["x-subsumio-api-key"] = apiKey;

    const res = await fetch(`${ENGINE_URL}/api/stats`, {
      headers,
      signal: AbortSignal.timeout(4_000),
    });
    checks.engine = res.ok
      ? { status: "ok", latencyMs: Date.now() - engineStart }
      : { status: "down", latencyMs: Date.now() - engineStart, detail: `Engine returned ${res.status}` };
  } catch (err) {
    checks.engine = {
      status: "down",
      latencyMs: Date.now() - engineStart,
      detail: err instanceof Error ? err.message : "unreachable",
    };
  }

  // 2. Auth store — critical
  const authStart = Date.now();
  try {
    const { getStore } = await import("@/lib/auth/store");
    const users = await getStore().list();
    checks.auth = {
      status: Array.isArray(users) ? "ok" : "degraded",
      latencyMs: Date.now() - authStart,
    };
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

  checks.config = missingCritical.length === 0
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

  // Determine overall status: critical checks (engine, auth, config) must be ok
  const criticalKeys = ["engine", "auth", "config"];
  const anyCriticalDown = criticalKeys.some((k) => checks[k]?.status === "down");
  const allOk = Object.values(checks).every((c) => c.status === "ok");

  const status = anyCriticalDown ? 503 : 200;
  const overall = anyCriticalDown ? "down" : allOk ? "ok" : "degraded";

  return Response.json(
    {
      status: overall,
      durationMs: Date.now() - start,
      checks,
    },
    { status }
  );
}
