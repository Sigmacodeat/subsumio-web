import { describe, expect, it, vi } from "vitest";
import { buildConversationEvent, writeConversationEvent } from "./events";
import { classifyWhatsAppRisk } from "./risk";
import type { WhatsAppIdentity, WhatsAppTextMessage } from "@/lib/whatsapp/types";

function identity(overrides: Partial<WhatsAppIdentity> = {}): WhatsAppIdentity {
  const now = "2026-06-20T10:00:00.000Z";
  return {
    id: "wa-1",
    orgId: "org-1",
    brainId: "brain-1",
    phone: "+491701234567",
    phoneHash: "hash-1",
    userId: "user-1",
    name: "Dr. Test",
    role: "lawyer",
    matterScope: "all",
    status: "active",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("conversation events", () => {
  it("builds a canonical WhatsApp conversation_event frontmatter", () => {
    const message: WhatsAppTextMessage = {
      id: "wamid.TEST",
      from: "+491701234567",
      type: "text",
      text: "zeit 20m akt 2026-014 telefonat",
    };
    const risk = classifyWhatsAppRisk({ text: message.text, messageType: message.type, senderRole: "lawyer" });
    const event = buildConversationEvent(
      { message, sender: identity(), normalizedText: message.text, risk, status: "received" },
      new Date("2026-06-20T12:00:00.000Z")
    );

    expect(event.slug).toBe("legal/conversations/whatsapp/wamid-test");
    expect(event.frontmatter).toMatchObject({
      type: "conversation_event",
      channel: "whatsapp",
      provider_message_id: "wamid.TEST",
      direction: "inbound",
      role: "lawyer",
      tenant_brain_id: "brain-1",
      intent: "time_entry",
      risk_level: "low",
      status: "received",
      created_at: "2026-06-20T12:00:00.000Z",
    });
    expect(event.frontmatter.phone_hash).toBeTruthy();
  });

  it("writes conversation events as mergeable brain pages", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const message: WhatsAppTextMessage = {
      id: "wamid.WRITE",
      from: "+491701234567",
      type: "text",
      text: "hilfe",
    };
    const risk = classifyWhatsAppRisk({ text: message.text, messageType: message.type, senderRole: "lawyer" });
    const event = buildConversationEvent({ message, sender: identity(), normalizedText: message.text, risk });

    await writeConversationEvent("brain-1", event, fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.type).toBe("conversation_event");
    expect(body.merge).toBe(true);
    expect(body.frontmatter.intent).toBe("free_text");
  });
});
