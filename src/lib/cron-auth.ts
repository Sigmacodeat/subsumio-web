/**
 * Shared cron auth guard — timing-safe Bearer token validation.
 * All cron endpoints must use this instead of raw string comparison.
 *
 * Also rate-limits by IP before checking the secret: every /api/cron/*
 * route (whether wired via createCronHandler or calling this directly)
 * shares a single CRON_SECRET, so without a limiter here an attacker gets
 * unlimited guesses against that one secret across ~30 endpoints. This is
 * the single choke point all of them pass through.
 */

import { timingSafeCompare } from "@/lib/crypto-utils";
import { hit, clientIp } from "@/lib/auth/rate-limit";
import type { NextRequest } from "next/server";

export async function validateCronAuth(req: NextRequest): Promise<Response | null> {
  const ip = clientIp(req.headers);
  const rate = await hit(`cron-auth:${ip}`, 30, 60_000);
  if (!rate.ok) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "cron_not_configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${secret}`;
  if (!auth || !timingSafeCompare(auth, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null; // auth ok
}
