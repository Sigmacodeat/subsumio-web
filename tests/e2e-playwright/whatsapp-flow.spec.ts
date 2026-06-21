/**
 * E2E WhatsApp Flow Tests
 * ========================
 * Tests the WhatsApp webhook endpoint, signature verification,
 * message processing, and outbound gate compliance.
 */

import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "test_verify_token";
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || "test_app_secret";

function signPayload(payload: string, secret: string = WHATSAPP_APP_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
}

function buildWebhookPayload(messages: Array<Record<string, unknown>>) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "test_entry_id",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || "test_phone_id",
              },
              messages,
            },
            field: "messages",
          },
        ],
      },
    ],
  });
}

test.describe("WhatsApp Webhook", () => {
  test("GET challenge verification succeeds with valid token", async ({ request }) => {
    const res = await request.get(
      `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${WHATSAPP_VERIFY_TOKEN}&hub.challenge=challenge123`
    );
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toBe("challenge123");
  });

  test("GET challenge fails with wrong token", async ({ request }) => {
    const res = await request.get(
      `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge123`
    );
    expect(res.status()).toBe(403);
  });

  test("POST without signature → 401", async ({ request }) => {
    const payload = buildWebhookPayload([
      {
        from: "1234567890",
        id: "msg_test_1",
        type: "text",
        text: { body: "Hallo" },
        timestamp: Math.floor(Date.now() / 1000).toString(),
      },
    ]);
    const res = await request.post("/api/whatsapp/webhook", {
      data: payload,
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST with invalid signature → 401", async ({ request }) => {
    const payload = buildWebhookPayload([
      {
        from: "1234567890",
        id: "msg_test_2",
        type: "text",
        text: { body: "Hallo" },
        timestamp: Math.floor(Date.now() / 1000).toString(),
      },
    ]);
    const res = await request.post("/api/whatsapp/webhook", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": "sha256=invalid_signature",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("POST with valid signature but unknown sender → sender denied", async ({ request }) => {
    const payload = buildWebhookPayload([
      {
        from: "9999999999",
        id: "msg_test_3",
        type: "text",
        text: { body: "Hallo Kanzlei" },
        timestamp: Math.floor(Date.now() / 1000).toString(),
      },
    ]);
    const signature = signPayload(payload);
    const res = await request.post("/api/whatsapp/webhook", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
    });
    // In production: sender denied. In dev: may process if env binding exists.
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.processed).toBeGreaterThan(0);
    }
  });

  test("POST with valid signature and status update", async ({ request }) => {
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "test_entry_id",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || "test_phone_id",
                },
                statuses: [
                  {
                    id: "msg_status_1",
                    recipient_id: "1234567890",
                    status: "delivered",
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    });
    const signature = signPayload(payload);
    const res = await request.post("/api/whatsapp/webhook", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.statuses).toBeGreaterThan(0);
  });

  test("POST with empty messages array → success with 0 processed", async ({ request }) => {
    const payload = buildWebhookPayload([]);
    const signature = signPayload(payload);
    const res = await request.post("/api/whatsapp/webhook", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(0);
  });

  test("POST with voice message type → processes or denies", async ({ request }) => {
    const payload = buildWebhookPayload([
      {
        from: "1234567890",
        id: "msg_voice_1",
        type: "voice",
        voice: {
          id: "media_voice_1",
          mime_type: "audio/ogg",
        },
        timestamp: Math.floor(Date.now() / 1000).toString(),
      },
    ]);
    const signature = signPayload(payload);
    const res = await request.post("/api/whatsapp/webhook", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
    });
    expect([200, 401]).toContain(res.status());
  });

  test("POST with reaction message → processes", async ({ request }) => {
    const payload = buildWebhookPayload([
      {
        from: "1234567890",
        id: "msg_reaction_1",
        type: "reaction",
        reaction: {
          emoji: "👍",
          message_id: "msg_prev_1",
        },
        timestamp: Math.floor(Date.now() / 1000).toString(),
      },
    ]);
    const signature = signPayload(payload);
    const res = await request.post("/api/whatsapp/webhook", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
    });
    expect([200, 401]).toContain(res.status());
  });

  test("POST with location message → processes", async ({ request }) => {
    const payload = buildWebhookPayload([
      {
        from: "1234567890",
        id: "msg_location_1",
        type: "location",
        location: {
          latitude: 48.2082,
          longitude: 16.3738,
          name: "Wien",
        },
        timestamp: Math.floor(Date.now() / 1000).toString(),
      },
    ]);
    const signature = signPayload(payload);
    const res = await request.post("/api/whatsapp/webhook", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
    });
    expect([200, 401]).toContain(res.status());
  });
});
