import { describe, expect, it, vi, beforeEach } from "vitest";
import { orchestrateWhatsAppMessage } from "./orchestrator";
import type { WhatsAppIdentity, WhatsAppTextMessage } from "@/lib/whatsapp/types";

const wasBriefingSentTodayMock = vi.fn(async () => false);
vi.mock("@/lib/whatsapp/daily-briefing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/daily-briefing")>()),
  wasBriefingSentToday: (...args: unknown[]) => wasBriefingSentTodayMock(...args),
}));

const recordBriefingFeedbackMock = vi.fn(async () => ({ recorded: true, feedback_id: "fb-1" }));
vi.mock("@/lib/whatsapp/briefing-feedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/briefing-feedback")>()),
  recordBriefingFeedback: (...args: unknown[]) => recordBriefingFeedbackMock(...args),
}));

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
  beforeEach(() => {
    wasBriefingSentTodayMock.mockReset().mockResolvedValue(false);
    recordBriefingFeedbackMock.mockClear();
  });

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
    expect(requestBody.frontmatter.items.map((item: { key: string }) => item.key)).toEqual([
      "vollmacht",
      "bescheid",
    ]);
    const approvalBody = JSON.parse(String(fetchImpl.mock.calls[2][1]?.body));
    expect(approvalBody.frontmatter.action_type).toBe("document_request_send");
    expect(approvalBody.frontmatter.target_slug).toBe(requestBody.slug);
    expect(approvalBody.frontmatter.payload).toMatchObject({
      case_slug: "legal/cases/2026-014",
      document_request_slug: requestBody.slug,
      items: ["Vollmacht", "Bescheid"],
    });
  });

  describe("briefing feedback capture (Followup D.12)", () => {
    it("records feedback when handleText finds no pending action AND a briefing went out today", async () => {
      wasBriefingSentTodayMock.mockResolvedValueOnce(true);
      const fetchImpl = okFetch();
      const handleText = vi.fn(async () => "Keine offene Aktion zum Speichern gefunden.");
      const message: WhatsAppTextMessage = {
        id: "wamid.FEEDBACK1",
        from: "+491701234567",
        type: "text",
        text: "hilfreich, danke",
      };

      const result = await orchestrateWhatsAppMessage(message, identity("lawyer"), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        handleText,
      });

      expect(recordBriefingFeedbackMock).toHaveBeenCalledWith(
        expect.objectContaining({ useful: true, brain_id: "brain-1" })
      );
      expect(result.reply).toContain("Danke fürs Feedback");
    });

    it("does NOT capture feedback when no briefing was sent today — leaves the pending-action reply untouched", async () => {
      wasBriefingSentTodayMock.mockResolvedValueOnce(false);
      const fetchImpl = okFetch();
      const handleText = vi.fn(async () => "Keine offene Aktion zum Speichern gefunden.");
      const message: WhatsAppTextMessage = {
        id: "wamid.FEEDBACK2",
        from: "+491701234567",
        type: "text",
        text: "ja",
      };

      const result = await orchestrateWhatsAppMessage(message, identity("lawyer"), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        handleText,
      });

      expect(recordBriefingFeedbackMock).not.toHaveBeenCalled();
      expect(result.reply).toBe("Keine offene Aktion zum Speichern gefunden.");
    });

    it("does NOT touch a real pending-action confirmation reply (handleText returned something else)", async () => {
      wasBriefingSentTodayMock.mockResolvedValueOnce(true);
      const fetchImpl = okFetch();
      const handleText = vi.fn(async () => "Gespeichert: Zeiteintrag.");
      const message: WhatsAppTextMessage = {
        id: "wamid.FEEDBACK3",
        from: "+491701234567",
        type: "text",
        text: "ja",
      };

      const result = await orchestrateWhatsAppMessage(message, identity("lawyer"), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        handleText,
      });

      expect(recordBriefingFeedbackMock).not.toHaveBeenCalled();
      expect(result.reply).toBe("Gespeichert: Zeiteintrag.");
    });
  });
});
