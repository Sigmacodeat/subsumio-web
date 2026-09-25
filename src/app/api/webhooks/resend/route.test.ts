// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

const verifyResendWebhook = vi.fn((..._args: unknown[]): unknown => undefined);
const storeInboundResendEmail = vi.fn(
  async (..._args: unknown[]): Promise<{ id: string } | null> => null
);
const reconcileResendDeliveryEvent = vi.fn(
  async (..._args: unknown[]): Promise<unknown> => undefined
);

vi.mock("@/lib/api-handler", () => ({
  createWebhookHandler: (_opts: unknown, handler: unknown) => handler,
}));

vi.mock("@/lib/email/mailbox", () => ({
  verifyResendWebhook: (...args: unknown[]) => verifyResendWebhook(...args),
  storeInboundResendEmail: (...args: unknown[]) => storeInboundResendEmail(...args),
}));

vi.mock("@/lib/email/delivery-status", () => ({
  reconcileResendDeliveryEvent: (...args: unknown[]) => reconcileResendDeliveryEvent(...args),
}));

import type { NextRequest } from "next/server";
import { POST } from "./route";

function req(body = "{}"): NextRequest {
  return new Request("https://app.example.com/api/webhooks/resend", {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": "msg_1" },
    body,
  }) as unknown as NextRequest;
}

async function post(body = "{}"): Promise<Response> {
  const handler = POST as unknown as (b: unknown, r: NextRequest) => Promise<Response>;
  return handler(undefined, req(body));
}

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    verifyResendWebhook.mockReset();
    storeInboundResendEmail.mockReset().mockResolvedValue(null);
    reconcileResendDeliveryEvent.mockReset();
  });

  test("fehlendes RESEND_WEBHOOK_SECRET → 501, nichts wird verarbeitet", async () => {
    verifyResendWebhook.mockImplementation(() => {
      throw new Error("resend_webhook_secret_not_configured");
    });
    const res = await post();
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("resend_webhook_not_configured");
    expect(reconcileResendDeliveryEvent).not.toHaveBeenCalled();
    expect(storeInboundResendEmail).not.toHaveBeenCalled();
  });

  test("ungültige Signatur → 401", async () => {
    verifyResendWebhook.mockImplementation(() => {
      throw new Error("No matching signature found");
    });
    const res = await post();
    expect(res.status).toBe(401);
    expect(reconcileResendDeliveryEvent).not.toHaveBeenCalled();
  });

  test("email.bounced wird an die Delivery-Reconciliation delegiert", async () => {
    const event = { type: "email.bounced", data: { email_id: "re_123" } };
    verifyResendWebhook.mockReturnValue(event);
    reconcileResendDeliveryEvent.mockResolvedValue({
      handled: true,
      status: "bounced",
      messageId: "m1",
      brainId: "b1",
      trackingId: "trk_1",
      pagesUpdated: 1,
    });
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("bounced");
    expect(body.pagesUpdated).toBe(1);
    expect(reconcileResendDeliveryEvent).toHaveBeenCalledWith(event, "re_123:email.bounced");
  });

  test("email.failed wird an die Delivery-Reconciliation delegiert", async () => {
    const event = { type: "email.failed", data: { email_id: "re_9" } };
    verifyResendWebhook.mockReturnValue(event);
    reconcileResendDeliveryEvent.mockResolvedValue({
      handled: true,
      status: "failed",
      messageId: null,
      brainId: null,
      trackingId: null,
      pagesUpdated: 0,
    });
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("failed");
  });

  test("deduped-Event antwortet 200 mit deduped:true", async () => {
    verifyResendWebhook.mockReturnValue({
      type: "email.complained",
      data: { email_id: "re_5" },
    });
    reconcileResendDeliveryEvent.mockResolvedValue({
      handled: true,
      status: "complained",
      deduped: true,
      messageId: null,
      brainId: null,
      trackingId: null,
      pagesUpdated: 0,
    });
    const res = await post();
    expect((await res.json()).deduped).toBe(true);
  });

  test("unbekannter Event-Typ → ignored", async () => {
    verifyResendWebhook.mockReturnValue({ type: "contact.created", data: {} });
    reconcileResendDeliveryEvent.mockResolvedValue({
      handled: false,
      messageId: null,
      brainId: null,
      trackingId: null,
      pagesUpdated: 0,
    });
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe(true);
  });

  test("email.received geht an den Inbound-Pfad", async () => {
    verifyResendWebhook.mockReturnValue({ type: "email.received", data: { email_id: "re_x" } });
    storeInboundResendEmail.mockResolvedValue({ id: "msg-1" });
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("inbound");
    expect(body.id).toBe("msg-1");
    expect(reconcileResendDeliveryEvent).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/resend — retryable", () => {
  beforeEach(() => {
    verifyResendWebhook.mockReset();
    storeInboundResendEmail.mockReset().mockResolvedValue(null);
    reconcileResendDeliveryEvent.mockReset();
  });

  test("retryable-Ergebnis (Engine-Ausfall) antwortet 500, damit Svix erneut zustellt", async () => {
    verifyResendWebhook.mockReturnValue({ type: "email.bounced", data: { email_id: "re_7" } });
    reconcileResendDeliveryEvent.mockResolvedValue({
      handled: true,
      status: "bounced",
      messageId: "m1",
      brainId: "brain-1",
      trackingId: "trk_1",
      pagesUpdated: 0,
      retryable: true,
    });
    const res = await post();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("reconcile_incomplete");
  });
});
