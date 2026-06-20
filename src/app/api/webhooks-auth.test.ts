import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postStripeWebhook } from "./billing/webhook/route";
import { POST as postDocuSignWebhook } from "./docusign/webhook/route";
import { POST as postResendWebhook } from "./email/webhook/resend/route";
import { POST as postWhatsAppWebhook } from "./whatsapp/webhook/route";

const ORIGINAL_ENV = { ...process.env };

function request(pathname: string, init: RequestInit): NextRequest {
  return new NextRequest(`https://subsumio.test${pathname}`, init);
}

function stripeSignature(
  payload: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000)
): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function whatsAppSignature(payload: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

async function docuSignSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("provider webhook route auth gates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects Stripe webhooks without a valid provider signature", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "stripe_test_secret";
    const res = await postStripeWebhook(
      request("/api/billing/webhook", {
        method: "POST",
        body: JSON.stringify({ id: "evt_1", type: "ping" }),
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_signature" });
  });

  it("accepts a valid Stripe signature before parsing the provider payload", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "stripe_test_secret";
    const payload = "not-json";
    const res = await postStripeWebhook(
      request("/api/billing/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": stripeSignature(payload, process.env.STRIPE_WEBHOOK_SECRET),
        },
        body: payload,
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_payload" });
  });

  it("rejects WhatsApp webhooks without a valid app-secret signature", async () => {
    process.env.WHATSAPP_APP_SECRET = "whatsapp_test_secret";
    const res = await postWhatsAppWebhook(
      request("/api/whatsapp/webhook", {
        method: "POST",
        body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
      })
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "invalid_signature" });
  });

  it("accepts a valid WhatsApp signature without a browser CSRF token", async () => {
    process.env.WHATSAPP_APP_SECRET = "whatsapp_test_secret";
    const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const res = await postWhatsAppWebhook(
      request("/api/whatsapp/webhook", {
        method: "POST",
        headers: {
          "x-hub-signature-256": whatsAppSignature(payload, process.env.WHATSAPP_APP_SECRET),
        },
        body: payload,
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, processed: 0, statuses: 0 });
  });

  it("rejects Resend webhooks without valid Svix headers", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await postResendWebhook(
      request("/api/email/webhook/resend", {
        method: "POST",
        body: JSON.stringify({ type: "email.received", data: { email_id: "email_1" } }),
      })
    );

    expect(consoleSpy).toHaveBeenCalled();
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });

  it("accepts a valid Resend Svix signature without a browser CSRF token", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "email_1" } });
    const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET);
    const timestamp = new Date();
    const svixId = "msg_test";
    const res = await postResendWebhook(
      request("/api/email/webhook/resend", {
        method: "POST",
        headers: {
          "svix-id": svixId,
          "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
          "svix-signature": wh.sign(svixId, timestamp, payload),
        },
        body: payload,
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, id: null, ignored: true });
  });

  it("rejects DocuSign webhooks without the configured Connect signature", async () => {
    process.env.DOCUSIGN_CONNECT_SECRET = "docusign_test_secret";
    const payload = JSON.stringify({
      eventId: "event_1",
      event: "envelope-completed",
      data: { envelopeId: "env_1", envelopeSummary: { status: "completed" } },
    });
    const res = await postDocuSignWebhook(
      request("/api/docusign/webhook", {
        method: "POST",
        body: payload,
      })
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "invalid_signature" });
  });

  it("accepts a valid DocuSign Connect signature without a browser CSRF token", async () => {
    process.env.DOCUSIGN_CONNECT_SECRET = "docusign_test_secret";
    const payload = JSON.stringify({
      eventId: "event_2",
      event: "envelope-completed",
      data: {
        envelopeId: "env_2",
        envelopeSummary: {
          status: "completed",
          metadata: { brain_id: "brain_test" },
        },
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ pages: [] }));
    const res = await postDocuSignWebhook(
      request("/api/docusign/webhook", {
        method: "POST",
        headers: {
          "x-docusign-signature-1": await docuSignSignature(
            payload,
            process.env.DOCUSIGN_CONNECT_SECRET
          ),
        },
        body: payload,
      })
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      envelopeId: "env_2",
      mapped: "signed",
    });
  });
});
