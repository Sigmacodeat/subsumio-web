/**
 * API-Level Rate Limiting für authentifizierte Dashboard-Routen.
 *
 * Unterscheidet zwischen:
 * - Standard-User: 120 req/min
 * - Heavy-Endpunkte (think, upload, agents): 30 req/min
 * - Search: 60 req/min
 *
 * Verwendet denselben Upstash/Memory-Backend wie auth/rate-limit.ts.
 */

import { hit } from "@/lib/auth/rate-limit";
import type { NextRequest } from "next/server";

export type RateTier = "standard" | "heavy" | "search";

const TIER_MAX: Record<RateTier, { max: number; windowMs: number }> = {
  standard: { max: 120, windowMs: 60_000 }, // 120/min
  search: { max: 60, windowMs: 60_000 }, // 60/min
  heavy: { max: 30, windowMs: 60_000 }, // 30/min
};

/** Prüft Rate-Limit für einen authentifizierten Request.
 *  key = userId + route-Tier (nicht IP — authentifizierte User sollen
 *  von verschiedenen Geräten arbeiten können). */
export async function checkApiRate(
  userId: string,
  tier: RateTier,
  _req?: NextRequest
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const { max, windowMs } = TIER_MAX[tier];
  const key = `api:${tier}:${userId}`;
  const result = await hit(key, max, windowMs);
  return result;
}

/** Wrapper: prüft Rate-Limit und gibt 429 Response zurück wenn überschritten. */
export async function requireApiRate(
  userId: string,
  tier: RateTier,
  req?: NextRequest
): Promise<Response | null> {
  const result = await checkApiRate(userId, tier, req);
  if (!result.ok) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Too many requests. Please slow down.",
        retry_after: result.retryAfterSeconds,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfterSeconds),
        },
      }
    );
  }
  return null;
}
