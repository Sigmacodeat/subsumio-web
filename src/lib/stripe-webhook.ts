// Stripe webhook signature verification (v1 scheme, HMAC-SHA256) without the SDK.
// Extracted from the route handler so it can be unit-tested in isolation.
// See: https://docs.stripe.com/webhooks/signatures

import { createHmac, timingSafeEqual } from "node:crypto";

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Verifies a Stripe `Stripe-Signature` header against the raw request body.
 *
 * @param payload  The exact raw request body string (must not be re-serialized).
 * @param header   The value of the `Stripe-Signature` header (`t=...,v1=...`).
 * @param secret   The endpoint signing secret (`whsec_...`).
 * @param nowMs    Injectable clock for deterministic tests. Defaults to `Date.now()`.
 * @returns        `true` only when the signature is present, within tolerance, and matches.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowMs: number = Date.now()
): boolean {
  if (!header || !secret) return false;

  const parts = Object.fromEntries(
    header
      .split(",")
      .map((kv) => kv.split("=", 2))
      .filter((pair): pair is [string, string] => pair.length === 2)
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const age = Math.abs(nowMs / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
