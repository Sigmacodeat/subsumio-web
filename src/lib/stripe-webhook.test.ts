// @vitest-environment node

import { describe, test, expect } from "vitest";
import { verifyStripeSignature, STRIPE_SIGNATURE_TOLERANCE_SECONDS } from "./stripe-webhook";
import { createHmac } from "node:crypto";

const SECRET = "whsec_test_secret";
const PAYLOAD = '{"type":"checkout.session.completed"}';
const TIMESTAMP = 1700000000; // fixed timestamp

function makeSignature(payload: string, secret: string, timestamp: number): string {
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${expected}`;
}

describe("STRIPE_SIGNATURE_TOLERANCE_SECONDS", () => {
  test("is 300 (5 minutes)", () => {
    expect(STRIPE_SIGNATURE_TOLERANCE_SECONDS).toBe(300);
  });
});

describe("verifyStripeSignature", () => {
  test("returns true for valid signature", () => {
    const header = makeSignature(PAYLOAD, SECRET, TIMESTAMP);
    const nowMs = TIMESTAMP * 1000;
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, nowMs)).toBe(true);
  });

  test("returns false for null header", () => {
    expect(verifyStripeSignature(PAYLOAD, null, SECRET, TIMESTAMP * 1000)).toBe(false);
  });

  test("returns false for empty secret", () => {
    const header = makeSignature(PAYLOAD, SECRET, TIMESTAMP);
    expect(verifyStripeSignature(PAYLOAD, header, "", TIMESTAMP * 1000)).toBe(false);
  });

  test("returns false for wrong secret", () => {
    const header = makeSignature(PAYLOAD, SECRET, TIMESTAMP);
    expect(verifyStripeSignature(PAYLOAD, header, "wrong_secret", TIMESTAMP * 1000)).toBe(false);
  });

  test("returns false for tampered payload", () => {
    const header = makeSignature(PAYLOAD, SECRET, TIMESTAMP);
    expect(verifyStripeSignature('{"type":"tampered"}', header, SECRET, TIMESTAMP * 1000)).toBe(
      false
    );
  });

  test("returns false for missing timestamp in header", () => {
    const sig = createHmac("sha256", SECRET).update(`${TIMESTAMP}.${PAYLOAD}`).digest("hex");
    const header = `v1=${sig}`;
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, TIMESTAMP * 1000)).toBe(false);
  });

  test("returns false for missing v1 signature in header", () => {
    const header = `t=${TIMESTAMP}`;
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, TIMESTAMP * 1000)).toBe(false);
  });

  test("returns false for expired timestamp (outside tolerance)", () => {
    const header = makeSignature(PAYLOAD, SECRET, TIMESTAMP);
    const nowMs = (TIMESTAMP + STRIPE_SIGNATURE_TOLERANCE_SECONDS + 1) * 1000;
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, nowMs)).toBe(false);
  });

  test("returns true for timestamp within tolerance", () => {
    const header = makeSignature(PAYLOAD, SECRET, TIMESTAMP);
    const nowMs = (TIMESTAMP + STRIPE_SIGNATURE_TOLERANCE_SECONDS - 1) * 1000;
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, nowMs)).toBe(true);
  });

  test("returns false for future timestamp outside tolerance", () => {
    const header = makeSignature(PAYLOAD, SECRET, TIMESTAMP);
    const nowMs = (TIMESTAMP - STRIPE_SIGNATURE_TOLERANCE_SECONDS - 1) * 1000;
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, nowMs)).toBe(false);
  });

  test("returns false for malformed header (no key=value pairs)", () => {
    expect(verifyStripeSignature(PAYLOAD, "garbage", SECRET, TIMESTAMP * 1000)).toBe(false);
  });

  test("returns false for empty header", () => {
    expect(verifyStripeSignature(PAYLOAD, "", SECRET, TIMESTAMP * 1000)).toBe(false);
  });

  test("returns false for signature with wrong length", () => {
    const header = `t=${TIMESTAMP},v1=short`;
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, TIMESTAMP * 1000)).toBe(false);
  });

  test("handles extra fields in header", () => {
    const header = makeSignature(PAYLOAD, SECRET, TIMESTAMP) + ",extra=field";
    expect(verifyStripeSignature(PAYLOAD, header, SECRET, TIMESTAMP * 1000)).toBe(true);
  });

  test("uses Date.now() as default nowMs", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = makeSignature(PAYLOAD, SECRET, nowSec);
    expect(verifyStripeSignature(PAYLOAD, header, SECRET)).toBe(true);
  });
});
