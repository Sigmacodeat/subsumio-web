import { describe, it, expect, vi, beforeEach } from "vitest";

const sendProactive = vi.fn();
vi.mock("@/lib/whatsapp/proactive-send", () => ({
  sendProactiveMessage: (...args: unknown[]) => sendProactive(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));

import { handleLegalChatMessage } from "./actions";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";

const CASE_SLUG = "legal/cases/2026-014";
const CONTACT_SLUG = "legal/contacts/mueller-max";
const LAWYER_PHONE = "+4915512345";

function identity(): WhatsAppIdentity {
  return {
    id: "id-1",
    orgId: "org-a",
    phoneHash: "hash",
    matterScope: [CASE_SLUG],
    status: "active",
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phone: LAWYER_PHONE,
    brainId: "org-a",
    role: "lawyer",
    // Staff numbers act for their bound member (KI4-04).
    memberUserId: "u-lawyer",
    member: { userId: "u-lawyer", role: "lawyer", orgId: "org-a" },
  };
}

// Minimal in-memory engine: enough for resolveAuthorizedCase, the client
// contact lookup, and the create-pending-action → confirm-with-"ja" round
// trip that createPendingAction/findLatestPendingAction/executeAction use.
let pages: Record<string, Record<string, unknown>>;

function seedPages() {
  pages = {
    [CASE_SLUG]: {
      slug: CASE_SLUG,
      title: "Müller ./. Schmidt",
      type: "legal_case",
      frontmatter: { case_number: "2026-014", client_slug: CONTACT_SLUG },
    },
    [CONTACT_SLUG]: {
      slug: CONTACT_SLUG,
      title: "Max Mustermann",
      type: "legal_contact",
      frontmatter: { type: "legal_contact", role: "client", phone: "+43660123456" },
    },
  };
}

beforeEach(() => {
  sendProactive.mockReset();
  seedPages();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/api/pages")) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        const slug = String(body.slug);
        const existing = pages[slug];
        const frontmatter =
          body.merge && existing
            ? { ...(existing.frontmatter as object), ...(body.frontmatter as object) }
            : (body.frontmatter ?? {});
        pages[slug] = { ...(existing ?? {}), ...body, frontmatter };
        return new Response(JSON.stringify({ slug }), { status: 200 });
      }
      const listMatch = u.match(/\/api\/pages\?type=([^&]+)/);
      if (listMatch) {
        const type = decodeURIComponent(listMatch[1]);
        return new Response(JSON.stringify(Object.values(pages).filter((p) => p.type === type)), {
          status: 200,
        });
      }
      const getMatch = u.match(/\/api\/pages\/(.+)$/);
      if (getMatch) {
        const slug = decodeURIComponent(getMatch[1]);
        const page = pages[slug];
        return page
          ? new Response(JSON.stringify(page), { status: 200 })
          : new Response("{}", { status: 404 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    })
  );
});

function send(text: string, messageId = `m-${Math.random()}`) {
  return handleLegalChatMessage({
    sender: identity(),
    fromPhone: LAWYER_PHONE,
    messageId,
    text,
  });
}

describe("send_to_client — WhatsApp lawyer command", () => {
  it("previews the message and asks for JA before sending anything", async () => {
    sendProactive.mockResolvedValue({ sent: true, decision: { decision: "send" } });
    const reply = await send("sende mandant akt 2026-014: Bitte bringen Sie die Vollmacht mit.");
    expect(reply).toContain("Müller ./. Schmidt");
    expect(reply).toContain("Bitte bringen Sie die Vollmacht mit.");
    expect(reply).toMatch(/JA/);
    expect(sendProactive).not.toHaveBeenCalled();
  });

  it("sends the message only after JA, to the client contact's phone", async () => {
    sendProactive.mockResolvedValue({ sent: true, decision: { decision: "send" } });
    await send("sende mandant akt 2026-014: Bitte bringen Sie die Vollmacht mit.");
    const reply = await send("ja");

    expect(sendProactive).toHaveBeenCalledTimes(1);
    expect(sendProactive).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+43660123456",
        freeform: "Bitte bringen Sie die Vollmacht mit.",
        scope: "client_reminder",
      })
    );
    expect(reply).toContain("gesendet");
  });

  it("refuses to create a pending action when the case has no phone on file", async () => {
    pages[CASE_SLUG].frontmatter = { case_number: "2026-014" }; // no client_slug
    const reply = await send("sende mandant akt 2026-014: Bitte bringen Sie die Vollmacht mit.");
    expect(reply).toMatch(/keine.*Telefonnummer/i);
    expect(sendProactive).not.toHaveBeenCalled();

    // Nothing pending: a stray "ja" afterwards must not fall through to some
    // other queued action.
    const confirmReply = await send("ja");
    expect(confirmReply).toContain("Keine offene Aktion");
  });

  it("reports a failed send instead of silently swallowing an outbound-gate block", async () => {
    sendProactive.mockResolvedValue({
      sent: false,
      decision: { decision: "block", reason: "window_closed_no_template" },
    });
    await send("sende mandant akt 2026-014: Bitte bringen Sie die Vollmacht mit.");
    const reply = await send("ja");
    expect(reply).toMatch(/konnte nicht gesendet werden/i);
    expect(reply).toContain("window_closed_no_template");
  });

  it("never routes an out-of-scope case to a real send (matter-scope enforcement still applies)", async () => {
    pages["legal/cases/9999"] = {
      slug: "legal/cases/9999",
      title: "Fremde Akte",
      type: "legal_case",
      frontmatter: { case_number: "9999", client_slug: CONTACT_SLUG },
    };
    const reply = await send("sende mandant akt 9999: Vertraulicher Hinweis.");
    expect(reply).not.toContain("Fremde Akte");
    expect(sendProactive).not.toHaveBeenCalled();
  });
});
