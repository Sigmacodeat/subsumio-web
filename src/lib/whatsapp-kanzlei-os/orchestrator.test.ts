import { describe, expect, it, vi } from "vitest";
import { orchestrateWhatsAppMessage } from "./orchestrator";
import type { WhatsAppIdentity, WhatsAppTextMessage } from "@/lib/whatsapp/types";

function identity(role: WhatsAppIdentity["role"] = "lawyer"): WhatsAppIdentity {
  const now = "2026-06-20T10:00:00.000Z";
  return {
    id: "wa-1",
    orgId: "org-1",
    brainId: "brain-1",
    phone: "+491701234567",
    phoneHash: "hash-1",
    userId: "user-1",
    name: "Dr. Test",
    role,
    matterScope: "all",
    status: "active",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
}

describe("orchestrateWhatsAppMessage", () => {
  it("writes the event and delegates low-risk lawyer text to the legacy legal-chat tool", async () => {
    const fetchImpl = okFetch();
    const handleText = vi.fn(async () => "Gespeichert");
    const message: WhatsAppTextMessage = {
      id: "wamid.TIME",
      from: "+491701234567",
      type: "text",
      text: "zeit 20m akt 2026-014 telefonat",
    };

    const result = await orchestrateWhatsAppMessage(message, identity("lawyer"), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      handleText,
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toBe("Gespeichert");
    expect(result.eventSlug).toBe("legal/conversations/whatsapp/wamid-time");
    expect(handleText).toHaveBeenCalledWith(expect.objectContaining({ text: message.text }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not route client free text into the legal-chat tool", async () => {
    const fetchImpl = okFetch();
    const handleText = vi.fn(async () => "should not happen");
    const message: WhatsAppTextMessage = {
      id: "wamid.CLIENT",
      from: "+491701234567",
      type: "text",
      text: "Was soll ich gegen die Kündigung tun?",
    };

    const result = await orchestrateWhatsAppMessage(message, identity("client"), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      handleText,
    });

    expect(result.status).toBe("pending_approval");
    expect(result.reply).toContain("Ihre Nachricht ist eingegangen");
    expect(result.actionSlug).toContain("agent-action/whatsapp/");
    expect(handleText).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const intakeBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(intakeBody.type).toBe("intake_request");
    const approvalBody = JSON.parse(String(fetchImpl.mock.calls[2][1]?.body));
    expect(approvalBody.frontmatter.target_slug).toBe(intakeBody.slug);
    expect(approvalBody.frontmatter.payload).toMatchObject({
      to: "+491701234567",
      related_intake_slug: intakeBody.slug,
    });
    expect(approvalBody.frontmatter.payload.message).toContain("Kanzlei aufgenommen");
  });

  it("creates a document_request draft before approval for internal document requests", async () => {
    const fetchImpl = okFetch();
    const handleText = vi.fn(async () => "should not happen");
    const message: WhatsAppTextMessage = {
      id: "wamid.DOCS",
      from: "+491701234567",
      type: "text",
      text: "Fordere bei Akt 2026-014 Vollmacht und Bescheid an",
    };

    const result = await orchestrateWhatsAppMessage(message, identity("assistant"), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      handleText,
    });

    expect(result.status).toBe("pending_approval");
    expect(handleText).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(requestBody.type).toBe("document_request");
    expect(requestBody.frontmatter.case_slug).toBe("legal/cases/2026-014");
    expect(requestBody.frontmatter.items.map((item: { key: string }) => item.key)).toEqual(["vollmacht", "bescheid"]);
    const approvalBody = JSON.parse(String(fetchImpl.mock.calls[2][1]?.body));
    expect(approvalBody.frontmatter.action_type).toBe("document_request_send");
    expect(approvalBody.frontmatter.target_slug).toBe(requestBody.slug);
    expect(approvalBody.frontmatter.payload).toMatchObject({
      case_slug: "legal/cases/2026-014",
      document_request_slug: requestBody.slug,
      items: ["Vollmacht", "Bescheid"],
    });
  });
});
