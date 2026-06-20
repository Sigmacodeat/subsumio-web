// P0-PROD-002: route-near provider webhook signature/auth gate tests.
// These pin the contract that provider webhooks (Stripe, WhatsApp, Resend,
// DocuSign) accept correctly-signed payloads WITHOUT a browser CSRF token but
// reject missing/forged signatures. The middleware-level CSRF exemption is
// covered separately in src/middleware.test.ts (P0-PROD-001).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { Webhook } from "svix";
import { verifyStripeSignature, STRIPE_SIGNATURE_TOLERANCE_SECONDS } from "@/lib/stripe-webhook";
import { verifyDocusignConnectSignature } from "@/lib/docusign";
import { verifyWhatsAppSignature, verifyWebhookChallenge } from "@/lib/whatsapp/verify";
import { verifyResendWebhook } from "@/lib/email/mailbox";

// --- Stripe -----------------------------------------------------------------

describe("Stripe webhook signature gate", () => {
  const secret = "whsec_stripe_test_secret";
  const payload = JSON.stringify({ id: "evt_123", type: "checkout.session.completed" });

  function header(ts: number, body = payload, withSecret = secret): string {
    const v1 = createHmac("sha256", withSecret).update(`${ts}.${body}`).digest("hex");
    return `t=${ts},v1=${v1}`;
  }

  it("accepts a correctly-signed payload within tolerance", () => {
    const ts = 1_700_000_000;
    expect(verifyStripeSignature(payload, header(ts), secret, ts * 1000)).toBe(true);
  });

  it("rejects a missing signature header", () => {
    expect(verifyStripeSignature(payload, null, secret)).toBe(false);
  });

  it("rejects a malformed header without v1", () => {
    expect(verifyStripeSignature(payload, "t=1700000000", secret, 1_700_000_000_000)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const ts = 1_700_000_000;
    const sig = header(ts);
    expect(verifyStripeSignature(payload + "x", sig, secret, ts * 1000)).toBe(false);
  });

  it("rejects a signature signed with a different secret", () => {
    const ts = 1_700_000_000;
    expect(
      verifyStripeSignature(payload, header(ts, payload, "whsec_other"), secret, ts * 1000)
    ).toBe(false);
  });

  it("rejects a timestamp outside the tolerance window", () => {
    const ts = 1_700_000_000;
    const tooLate = (ts + STRIPE_SIGNATURE_TOLERANCE_SECONDS + 1) * 1000;
    expect(verifyStripeSignature(payload, header(ts), secret, tooLate)).toBe(false);
  });

  it("rejects when secret is empty", () => {
    const ts = 1_700_000_000;
    expect(verifyStripeSignature(payload, header(ts), "", ts * 1000)).toBe(false);
  });
});

// --- DocuSign ---------------------------------------------------------------

describe("DocuSign Connect signature gate", () => {
  const secret = "docusign_connect_test_secret";
  const rawBody = JSON.stringify({ event: "envelope-completed", data: { envelopeId: "env_1" } });

  function sign(body = rawBody, withSecret = secret): string {
    return createHmac("sha256", withSecret).update(body, "utf8").digest("base64");
  }

  it("accepts a correctly base64-signed payload", () => {
    expect(verifyDocusignConnectSignature(rawBody, sign(), secret)).toBe(true);
  });

  it("rejects a missing signature header", () => {
    expect(verifyDocusignConnectSignature(rawBody, null, secret)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    expect(verifyDocusignConnectSignature(rawBody + "x", sign(), secret)).toBe(false);
  });

  it("rejects a signature signed with a different secret", () => {
    expect(verifyDocusignConnectSignature(rawBody, sign(rawBody, "other"), secret)).toBe(false);
  });

  it("rejects when secret is empty", () => {
    expect(verifyDocusignConnectSignature(rawBody, sign(), "")).toBe(false);
  });
});

// --- WhatsApp ---------------------------------------------------------------

describe("WhatsApp webhook signature gate", () => {
  const appSecret = "whatsapp_app_test_secret";
  const rawBody = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const original = process.env.WHATSAPP_APP_SECRET;

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = appSecret;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = original;
  });

  function sign(body = rawBody): string {
    return `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
  }

  it("accepts a correctly-signed payload", () => {
    expect(verifyWhatsAppSignature(rawBody, sign())).toBe(true);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWhatsAppSignature(rawBody, null)).toBe(false);
  });

  it("rejects a header without the sha256= prefix", () => {
    const bare = createHmac("sha256", appSecret).update(rawBody).digest("hex");
    expect(verifyWhatsAppSignature(rawBody, bare)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    expect(verifyWhatsAppSignature(rawBody + "x", sign())).toBe(false);
  });
});

describe("WhatsApp webhook GET challenge", () => {
  const token = "verify_token_test";
  const original = process.env.WHATSAPP_VERIFY_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.WHATSAPP_VERIFY_TOKEN;
    else process.env.WHATSAPP_VERIFY_TOKEN = original;
  });

  function params(mode: string, verifyToken: string, challenge: string): URLSearchParams {
    return new URLSearchParams({
      "hub.mode": mode,
      "hub.verify_token": verifyToken,
      "hub.challenge": challenge,
    });
  }

  it("echoes the challenge for a correct subscribe+token", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = token;
    const result = verifyWebhookChallenge(params("subscribe", token, "12345"));
    expect(result).toEqual({ ok: true, challenge: "12345" });
  });

  it("rejects a wrong verify token with 403", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = token;
    const result = verifyWebhookChallenge(params("subscribe", "wrong", "12345"));
    expect(result).toEqual({ ok: false, status: 403, error: "verification_failed" });
  });

  it("returns 503 when the verify token is not configured", () => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    const result = verifyWebhookChallenge(params("subscribe", token, "12345"));
    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "whatsapp_verify_token_not_configured",
    });
  });
});

// --- Resend -----------------------------------------------------------------

describe("Resend webhook signature gate", () => {
  // svix signing secret: "whsec_" + base64 key
  const secret = "whsec_" + Buffer.from("resend-test-signing-key-0123456789").toString("base64");
  const payload = JSON.stringify({ type: "email.received", data: { email_id: "em_1" } });
  const original = process.env.RESEND_WEBHOOK_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = original;
  });

  function signedHeaders(body: string): Headers {
    const wh = new Webhook(secret);
    const id = "msg_test_1";
    const timestamp = new Date();
    const signature = wh.sign(id, timestamp, body);
    return new Headers({
      "svix-id": id,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
    });
  }

  it("throws when the webhook secret is not configured", () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    expect(() => verifyResendWebhook(payload, new Headers())).toThrow(
      "resend_webhook_secret_not_configured"
    );
  });

  it("accepts a correctly svix-signed payload", () => {
    process.env.RESEND_WEBHOOK_SECRET = secret;
    const event = verifyResendWebhook(payload, signedHeaders(payload)) as { type: string };
    expect(event.type).toBe("email.received");
  });

  it("rejects a tampered payload", () => {
    process.env.RESEND_WEBHOOK_SECRET = secret;
    const headers = signedHeaders(payload);
    expect(() => verifyResendWebhook(payload + "x", headers)).toThrow();
  });

  it("rejects missing svix headers", () => {
    process.env.RESEND_WEBHOOK_SECRET = secret;
    expect(() => verifyResendWebhook(payload, new Headers())).toThrow();
  });
});
