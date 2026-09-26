import { describe, expect, it, vi, beforeEach } from "vitest";
import { orchestrateWhatsAppMessage } from "./orchestrator";
import type { WhatsAppIdentity, WhatsAppTextMessage } from "@/lib/whatsapp/types";

const wasBriefingSentTodayMock = vi.fn(async (..._args: unknown[]) => false);
vi.mock("@/lib/whatsapp/daily-briefing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/daily-briefing")>()),
  wasBriefingSentToday: (...args: unknown[]) => wasBriefingSentTodayMock(...args),
}));

const recordBriefingFeedbackMock = vi.fn(async (..._args: unknown[]) => ({
  recorded: true,
  feedback_id: "fb-1",
}));
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
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
  );
}

function caseFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ ok: true, slug: "ok" }), { status: 200 });
    }
    if (url.includes("/api/pages/legal/cases/2026-014")) {
      return new Response(
        JSON.stringify({
          slug: "legal/cases/2026-014",
          title: "Akte 2026-014",
          type: "legal_case",
          content: "Sachverhalt",
          frontmatter: { type: "legal_case", knowledge_reviews: [] },
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
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
    // The specific reply client-ingest.ts already computed for this sender
    // (unscoped — matterScope "all" has no matter to link to) — not the
    // generic safeClientReply(), which used to be returned unconditionally
    // here and silently discarded whatever client-ingest.ts had already
    // built.
    expect(result.reply).toContain("noch keiner Akte zugeordnet");
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

  it("keeps an unverified client's file out of the lawyer media handler", async () => {
    const fetchImpl = okFetch();
    const handleMedia = vi.fn(async () => "an Akte angehängt");
    const downloadMedia = vi.fn(async () => ({ slug: "media/x", mimeType: "application/pdf" }));
    const result = await orchestrateWhatsAppMessage(
      { id: "wamid.UNVERIFIED", from: "+491701234567", type: "document", mediaId: "m-1" },
      { ...identity("client"), verifiedAt: null },
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        handleMedia,
        downloadMedia: downloadMedia as never,
      }
    );

    expect(handleMedia).not.toHaveBeenCalled();
    expect(result.status).toBe("routed");
    expect(result.reply).toContain("zuerst durch die Kanzlei bestaetigt");
  });

  it("never runs lawyer commands for a client's confirmation", async () => {
    const fetchImpl = okFetch();
    const handleText = vi.fn(async () => "Aktion ausgeführt");
    const result = await orchestrateWhatsAppMessage(
      { id: "wamid.CLIENTJA", from: "+491701234567", type: "text", text: "ja" },
      identity("client"),
      { fetchImpl: fetchImpl as unknown as typeof fetch, handleText }
    );

    expect(handleText).not.toHaveBeenCalled();
    expect(result.reply).not.toBe("Aktion ausgeführt");
  });

  it("routes verified client WhatsApp text directly into the scoped matter knowledge base", async () => {
    const fetchImpl = caseFetch();
    const handleText = vi.fn(async () => "should not happen");
    const client = {
      ...identity("client"),
      matterScope: ["legal/cases/2026-014"],
    };
    const message: WhatsAppTextMessage = {
      id: "wamid.CLIENT-SUBMISSION",
      from: "+491701234567",
      type: "text",
      text: "Die Gegenseite hat heute telefonisch Zahlung zugesagt.",
    };

    const result = await orchestrateWhatsAppMessage(message, client, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      handleText,
    });

    expect(result.status).toBe("routed");
    expect(result.reply).toContain("sicher zur Akte genommen");
    expect(handleText).not.toHaveBeenCalled();
    // 5 fetches: case read, submission write, …, case update, inbound-register
    // stamp (durable outbox task since the intake-hardening commit).
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    const submissionBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(submissionBody.type).toBe("client_submission");
    expect(submissionBody.frontmatter).toMatchObject({
      channel: "whatsapp",
      case_slug: "legal/cases/2026-014",
      review_status: "pending",
    });
    const caseUpdateBody = JSON.parse(String(fetchImpl.mock.calls[3][1]?.body));
    expect(caseUpdateBody.frontmatter.knowledge_reviews[0]).toMatchObject({
      fact_id: "client-submission-wamid.CLIENT-SUBMISSION",
      status: "party_assertion",
      source: "WhatsApp Mandant Dr. Test",
    });
    expect(caseUpdateBody.frontmatter.audit_log[0]).toMatchObject({
      action: "knowledge_mark_party_assertion",
      source: expect.objectContaining({ type: "whatsapp" }),
    });
  });

  it("asks verified clients with multiple matters for the case reference instead of guessing", async () => {
    const fetchImpl = okFetch();
    const handleText = vi.fn(async () => "should not happen");
    const client = {
      ...identity("client"),
      matterScope: ["legal/cases/2026-014", "legal/cases/2026-099"],
    };
    const message: WhatsAppTextMessage = {
      id: "wamid.CLIENT-AMBIGUOUS",
      from: "+491701234567",
      type: "text",
      text: "Hier sind die neuen Informationen.",
    };

    const result = await orchestrateWhatsAppMessage(message, client, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      handleText,
    });

    expect(result.status).toBe("routed");
    // W3-10: asked, and the message is kept for assignment (nothing to resend).
    expect(result.reply).toContain("Zu welcher Akte gehört sie?");
    expect(result.reply).toContain("akt 2026-099");
    expect(handleText).not.toHaveBeenCalled();
    const submission = fetchImpl.mock.calls
      .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : null))
      .find((b) => b?.type === "client_submission");
    expect(submission?.frontmatter).toMatchObject({ needs_case_assignment: true });
  });

  it("routes an existing client's appointment request to the approval queue, linked to their known matter — not a generic new-contact intake", async () => {
    const fetchImpl = caseFetch();
    const handleText = vi.fn(async () => "should not happen");
    const client = {
      ...identity("client"),
      matterScope: ["legal/cases/2026-014"],
    };
    const message: WhatsAppTextMessage = {
      id: "wamid.CLIENT-APPOINTMENT",
      from: "+491701234567",
      type: "text",
      text: "Termin bitte, ich möchte vorbeikommen.",
    };

    const result = await orchestrateWhatsAppMessage(message, client, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      handleText,
    });

    expect(result.status).toBe("pending_approval");
    expect(handleText).not.toHaveBeenCalled();
    const bodies = fetchImpl.mock.calls
      .filter((c) => c[1]?.method === "POST")
      .map((c) => JSON.parse(String(c[1]?.body)));
    expect(bodies.some((b) => b.type === "intake_request")).toBe(false);
    const approvalBody = bodies.find((b) => b.type === "agent_action");
    expect(approvalBody).toBeDefined();
    expect(approvalBody.frontmatter.payload.case_slug).toBe("legal/cases/2026-014");
    expect(approvalBody.frontmatter.target_slug).toBeFalsy();
  });

  it("never links a client's approval to a case outside their matterScope, even when they name one in the text", async () => {
    // resolveClientCaseSlug used to return ANY explicit "akt X" ref from the
    // text unconditionally, without checking the sender was actually scoped
    // to it — a verified client naming a matter that isn't theirs would get
    // the built approval (and, for document_request, a real document-request
    // page) linked to a case they have no access to.
    const fetchImpl = caseFetch();
    const handleText = vi.fn(async () => "should not happen");
    const client = {
      ...identity("client"),
      matterScope: ["legal/cases/2026-014"],
    };
    const message: WhatsAppTextMessage = {
      id: "wamid.CLIENT-OUT-OF-SCOPE",
      from: "+491701234567",
      type: "text",
      text: "Termin für Akte 9999 bitte, ich möchte vorbeikommen.",
    };

    const result = await orchestrateWhatsAppMessage(message, client, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      handleText,
    });

    expect(result.status).toBe("pending_approval");
    const bodies = fetchImpl.mock.calls
      .filter((c) => c[1]?.method === "POST")
      .map((c) => JSON.parse(String(c[1]?.body)));
    const approvalBody = bodies.find((b) => b.type === "agent_action");
    expect(approvalBody).toBeDefined();
    expect(approvalBody.frontmatter.payload.case_slug).not.toBe("legal/cases/9999");
    // Falls back to the client's own single known matter instead of the
    // unauthorized one named in the text.
    expect(approvalBody.frontmatter.payload.case_slug).toBe("legal/cases/2026-014");
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

  // ─── G3: Interactive Buttons ───────────────────────────────────────────────

  describe("G3: Interactive confirmation buttons", () => {
    it("returns interactive buttons when reply contains 'Antworte mit JA'", async () => {
      const handleText = vi.fn(
        async () =>
          "Erkannt: Termin anlegen\nDatum: 2026-07-15\nUhrzeit: 14:00\nAntworte mit JA zum Bestätigen."
      );
      const message: WhatsAppTextMessage = {
        id: "wamid.BUTTON1",
        from: "+491701234567",
        type: "text",
        text: "termin 15.07.2026 14:00 Verhandlung",
      };

      const result = await orchestrateWhatsAppMessage(message, identity("lawyer"), {
        fetchImpl: okFetch() as unknown as typeof fetch,
        handleText,
      });

      expect(result.interactive).toBeDefined();
      expect(result.interactive?.type).toBe("button");
      expect(result.interactive?.action?.buttons).toHaveLength(2);
      expect(result.interactive?.action?.buttons?.[0]?.reply?.id).toBe("confirm_yes");
      expect(result.interactive?.action?.buttons?.[1]?.reply?.id).toBe("confirm_no");
    });

    it("does NOT return interactive when reply has no confirmation pattern", async () => {
      const handleText = vi.fn(async () => "Gespeichert: Zeiteintrag.");
      const message: WhatsAppTextMessage = {
        id: "wamid.BUTTON2",
        from: "+491701234567",
        type: "text",
        text: "zeit 0.5",
      };

      const result = await orchestrateWhatsAppMessage(message, identity("lawyer"), {
        fetchImpl: okFetch() as unknown as typeof fetch,
        handleText,
      });

      expect(result.interactive).toBeUndefined();
      expect(result.reply).toBe("Gespeichert: Zeiteintrag.");
    });

    // The buttons belong to the chat command — "speichern"/"verwerfen" keep
    // them apart from a Freigabe decision ("Ja <Referenz>").
    it("maps button_reply confirm_yes to 'speichern' for downstream processing", async () => {
      const handleText = vi.fn(async () => "Bestätigt und gespeichert.");
      const message = {
        id: "wamid.BUTTON3",
        from: "+491701234567",
        type: "button_reply" as const,
        buttonId: "confirm_yes",
        buttonText: "Ja, speichern",
      };

      const result = await orchestrateWhatsAppMessage(
        message as unknown as WhatsAppTextMessage,
        identity("lawyer"),
        {
          fetchImpl: okFetch() as unknown as typeof fetch,
          handleText,
        }
      );

      expect(handleText).toHaveBeenCalledWith(expect.objectContaining({ text: "speichern" }));
      expect(result.reply).toBe("Bestätigt und gespeichert.");
    });

    it("maps button_reply confirm_no to 'verwerfen' for downstream processing", async () => {
      const handleText = vi.fn(async () => "Abgebrochen.");
      const message = {
        id: "wamid.BUTTON4",
        from: "+491701234567",
        type: "button_reply" as const,
        buttonId: "confirm_no",
        buttonText: "Nein, verwerfen",
      };

      const _result = await orchestrateWhatsAppMessage(
        message as unknown as WhatsAppTextMessage,
        identity("lawyer"),
        {
          fetchImpl: okFetch() as unknown as typeof fetch,
          handleText,
        }
      );

      expect(handleText).toHaveBeenCalledWith(expect.objectContaining({ text: "verwerfen" }));
    });
  });

  // W3-5 / W2-3, W3-6, W3-7, W3-16: the WhatsApp Freigabe channel follows the
  // dashboard's rules.
  describe("approval return channel", () => {
    function textMessage(text: string): WhatsAppTextMessage {
      return { id: `wamid.${text.replace(/\W/g, "")}`, from: "+436641234567", type: "text", text };
    }
    const pending = [
      {
        action_slug: "agent-action/whatsapp/2026-09-26/document-request-1790000012",
        action_type: "document_request_send" as const,
        summary: "Unterlagen anfordern",
      },
    ];

    it("an assistant cannot decide a Freigabe, not even with a reference", async () => {
      const decideApproval = vi.fn();
      const result = await orchestrateWhatsAppMessage(
        textMessage("Ja 90000012"),
        identity("assistant"),
        {
          fetchImpl: okFetch() as unknown as typeof fetch,
          listPendingApprovals: async () => pending,
          decideApproval,
          handleText: vi.fn(async () => "x"),
        }
      );
      expect(decideApproval).not.toHaveBeenCalled();
      expect(result.reply).toMatch(/nur Anwältinnen\/Anwälte und die Administration/);
    });

    it("a lawyer's decision goes through the shared decision rules and reports a refusal", async () => {
      const decideApproval = vi.fn(async () => ({
        ok: false as const,
        message:
          "Eine Freigabe muss von einer zweiten Person entschieden werden (Vier-Augen-Prinzip).",
      }));
      const lawyer = { ...identity("lawyer"), email: "a@k.example" };
      const result = await orchestrateWhatsAppMessage(textMessage("Ja 90000012"), lawyer, {
        fetchImpl: okFetch() as unknown as typeof fetch,
        listPendingApprovals: async () => pending,
        decideApproval,
      });
      expect(decideApproval).toHaveBeenCalledWith(
        lawyer,
        pending[0].action_slug,
        "approved",
        undefined
      );
      expect(result.reply).toMatch(/Vier-Augen/);
      expect(result.status).toBe("routed");
    });

    it("a bare 'Ja' with open Freigaben asks which one is meant instead of confirming a chat command", async () => {
      const handleText = vi.fn(async () => "Gespeichert: Frist.");
      const decideApproval = vi.fn();
      const result = await orchestrateWhatsAppMessage(textMessage("Ja"), identity("lawyer"), {
        fetchImpl: okFetch() as unknown as typeof fetch,
        listPendingApprovals: async () => pending,
        decideApproval,
        hasPendingChatAction: async () => true,
        handleText,
      });
      expect(handleText).not.toHaveBeenCalled();
      expect(decideApproval).not.toHaveBeenCalled();
      expect(result.reply).toContain("Ja 90000012");
      expect(result.reply).toContain("speichern");
    });

    it("a bare 'Ja' without open Freigaben still confirms the chat command", async () => {
      const handleText = vi.fn(async () => "Gespeichert: Frist.");
      const result = await orchestrateWhatsAppMessage(textMessage("ja"), identity("lawyer"), {
        fetchImpl: okFetch() as unknown as typeof fetch,
        listPendingApprovals: async () => [],
        decideApproval: vi.fn(),
        handleText,
      });
      expect(handleText).toHaveBeenCalledWith(expect.objectContaining({ text: "ja" }));
      expect(result.reply).toBe("Gespeichert: Frist.");
    });

    it("a client's request never announces the Freigabe to the client", async () => {
      const client = { ...identity("client"), matterScope: ["legal/cases/2026-014"] };
      const result = await orchestrateWhatsAppMessage(
        textMessage("Termin nächste Woche möglich?"),
        client,
        { fetchImpl: caseFetch() as unknown as typeof fetch }
      );
      expect(result.status).toBe("pending_approval");
      expect(result.notificationEvent?.recipient_phone).toBeUndefined();
      expect(result.notificationEvent?.recipient_user_ids).toEqual([]);
      expect(result.notificationEvent?.case_slug).toBe("legal/cases/2026-014");
    });
  });

  describe("matter link and replies", () => {
    function bodies(fetchImpl: ReturnType<typeof caseFetch>) {
      return fetchImpl.mock.calls
        .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : null))
        .filter(Boolean) as Array<{ type?: string; frontmatter?: Record<string, unknown> }>;
    }

    // W3-11: a confirmed client's message belongs to the matter's history.
    it("stamps the client's matter on the conversation event", async () => {
      const fetchImpl = caseFetch();
      const client = { ...identity("client"), matterScope: ["legal/cases/2026-014"] };
      await orchestrateWhatsAppMessage(
        { id: "wamid.C1", from: "+491701234567", type: "text", text: "Anbei die Vollmacht." },
        client,
        { fetchImpl: fetchImpl as unknown as typeof fetch }
      );
      const event = bodies(fetchImpl).find((b) => b.type === "conversation_event");
      expect(event?.frontmatter?.case_slug).toBe("legal/cases/2026-014");
    });

    // W3-20: an unconfirmed number creates no Freigabe tied to a matter.
    it("an unconfirmed client's request is an intake, not a matter-linked Freigabe", async () => {
      const fetchImpl = caseFetch();
      const unverified = {
        ...identity("client"),
        verifiedAt: null,
        matterScope: ["legal/cases/2026-014"],
      };
      const result = await orchestrateWhatsAppMessage(
        { id: "wamid.C2", from: "+491701234567", type: "text", text: "Termin nächste Woche?" },
        unverified,
        { fetchImpl: fetchImpl as unknown as typeof fetch }
      );
      expect(result.notificationEvent?.case_slug).toBeUndefined();
      const approval = bodies(fetchImpl).find((b) => b.type === "agent_action");
      expect(
        (approval?.frontmatter?.payload as Record<string, unknown>)?.case_slug
      ).toBeUndefined();
      expect(bodies(fetchImpl).some((b) => b.type === "intake_request")).toBe(true);
    });

    // W3-16: a firm member gets a note with the reference, not the client wording.
    it("a firm member's Freigabe-Vorlage is confirmed with its reference", async () => {
      const fetchImpl = caseFetch();
      const result = await orchestrateWhatsAppMessage(
        {
          id: "wamid.C3",
          from: "+491701234567",
          type: "text",
          text: "Fordere bei Akt 2026-014 Vollmacht und Bescheid an",
        },
        identity("assistant"),
        { fetchImpl: fetchImpl as unknown as typeof fetch }
      );
      expect(result.status).toBe("pending_approval");
      expect(result.reply).toContain("Vorgang zur Freigabe vorgelegt");
      expect(result.reply).not.toContain("ungepruefte Rechtsauskunft");
    });
  });
});
