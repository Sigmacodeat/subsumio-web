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

  // A header may carry several v1 signatures (during a signing-secret
  // rotation Stripe signs with the old and the new secret) — any match counts.
  const pairs = header
    .split(",")
    .map((kv) => {
      const i = kv.indexOf("=");
      return i > 0 ? [kv.slice(0, i).trim(), kv.slice(i + 1).trim()] : null;
    })
    .filter((pair): pair is [string, string] => pair !== null);
  const timestamp = pairs.find(([k]) => k === "t")?.[1];
  const signatures = pairs.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(nowMs / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")
  );
  return signatures.some((sig) => {
    const b = Buffer.from(sig);
    return expected.length === b.length && timingSafeEqual(expected, b);
  });
}

/**
 * Whether a checkout session's money has arrived: `completed` with
 * payment_status "paid" (or nothing to pay), or the later
 * `async_payment_succeeded` of a delayed payment method.
 */
export function checkoutIsPaid(
  eventType: string | undefined,
  session: { payment_status?: string }
): boolean {
  if (eventType === "checkout.session.async_payment_succeeded") return true;
  if (eventType !== "checkout.session.completed") return false;
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}
