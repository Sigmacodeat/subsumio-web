import { describe, expect, it, vi } from "vitest";
import { actionTypeForWhatsAppIntent, buildWhatsAppApproval, writeWhatsAppApproval } from "./approvals";
import { classifyWhatsAppRisk } from "./risk";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";

function identity(): WhatsAppIdentity {
  const now = "2026-06-20T10:00:00.000Z";
  return {
    id: "wa-1",
    orgId: "org-1",
    brainId: "brain-1",
    phone: "+491701234567",
    phoneHash: "hash-1",
    userId: "user-1",
    name: "Dr. Test",
    role: "assistant",
    matterScope: "all",
    status: "active",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

describe("whatsapp approvals", () => {
  it("maps WhatsApp intents to approval action types", () => {
    expect(actionTypeForWhatsAppIntent("document_request")).toBe("document_request_send");
    expect(actionTypeForWhatsAppIntent("create_invoice")).toBe("invoice_create");
    expect(actionTypeForWhatsAppIntent("free_text")).toBe("client_message_send");
  });

  it("builds approval frontmatter with source event and payload", () => {
    const risk = classifyWhatsAppRisk({
      text: "Fordere bei Akt 2026-014 Vollmacht an",
      messageType: "text",
      senderRole: "assistant",
    });
    const approval = buildWhatsAppApproval(
      {
        sender: identity(),
        eventSlug: "legal/conversations/whatsapp/wamid-test",
        normalizedText: "Fordere bei Akt 2026-014 Vollmacht an",
        risk,
        documentItems: ["Vollmacht"],
      },
      new Date("2026-06-20T12:00:00.000Z")
    );

    expect(approval.slug).toBe("agent-action/whatsapp/2026-06-20/document-request-1781956800000");
    expect(approval.actionType).toBe("document_request_send");
    expect(approval.frontmatter).toMatchObject({
      type: "agent_action",
      action_type: "document_request_send",
      status: "pending",
      proposed_by: "Dr. Test",
      source_event_slug: "legal/conversations/whatsapp/wamid-test",
    });
    expect(approval.frontmatter.payload).toMatchObject({
      channel: "whatsapp",
      intent: "document_request",
      risk_level: "critical",
      items: ["Vollmacht"],
    });
  });

  it("adds executable recipient and message payload for client follow-up approvals", () => {
    const client = { ...identity(), role: "client" as const, phone: "+491701234567" };
    const risk = classifyWhatsAppRisk({
      text: "Was soll ich gegen die Kündigung tun?",
      messageType: "text",
      senderRole: "client",
    });

    const approval = buildWhatsAppApproval({
      sender: client,
      eventSlug: "legal/conversations/whatsapp/wamid-client",
      normalizedText: "Was soll ich gegen die Kündigung tun?",
      risk,
      targetSlug: "legal/intake/2026-06-20/client",
    });

    expect(approval.actionType).toBe("client_message_send");
    expect(approval.frontmatter.payload).toMatchObject({
      channel: "whatsapp",
      to: "+491701234567",
      related_intake_slug: "legal/intake/2026-06-20/client",
    });
    expect((approval.frontmatter.payload as { message?: string }).message).toContain("Kanzlei aufgenommen");
  });

  it("writes approval as an agent_action page", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const risk = classifyWhatsAppRisk({
      text: "Rechnung akt 2026-014: 2500 eur",
      messageType: "text",
      senderRole: "assistant",
    });
    const approval = buildWhatsAppApproval({
      sender: identity(),
      eventSlug: "legal/conversations/whatsapp/wamid-invoice",
      normalizedText: "Rechnung akt 2026-014: 2500 eur",
      risk,
    });

    const record = await writeWhatsAppApproval("brain-1", approval, fetchImpl as unknown as typeof fetch);

    expect(record.actionType).toBe("invoice_create");
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.type).toBe("agent_action");
    expect(body.frontmatter.action_type).toBe("invoice_create");
  });
});
