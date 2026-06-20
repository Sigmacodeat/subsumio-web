import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock audit so denial is observable and no real audit-log I/O happens.
const audit = vi.fn(async () => undefined);
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => audit(...a) }));

import { handleLegalChatMessage } from "./actions";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";

const IN_SCOPE_SLUG = "legal/cases/2026-014";
const OUT_OF_SCOPE_SLUG = "legal/cases/2026-099";

const CASE_PAGES = [
  {
    slug: IN_SCOPE_SLUG,
    title: "Müller ./. Schmidt",
    type: "legal_case",
    frontmatter: { case_number: "2026-014" },
  },
  {
    slug: OUT_OF_SCOPE_SLUG,
    title: "Geheime Akte",
    type: "legal_case",
    frontmatter: { case_number: "2026-099" },
  },
];

function identity(matterScope: string[] | "all"): WhatsAppIdentity {
  return {
    id: "id-1",
    orgId: "org-a",
    phoneHash: "hash",
    matterScope,
    status: "active",
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phone: "+4915512345",
    brainId: "org-a",
    role: "lawyer",
  };
}

beforeEach(() => {
  audit.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/pages?type=legal_case")) {
        return new Response(JSON.stringify(CASE_PAGES), { status: 200 });
      }
      // chat_action / chat_inbox / chat_outbox writes and other listPages calls
      return new Response(JSON.stringify([]), { status: 200 });
    })
  );
});

describe("WhatsApp matter-scope enforcement (Paket 31 / P0-SECR-002)", () => {
  it("answers when the sender's matterScope includes the case", async () => {
    const reply = await handleLegalChatMessage({
      sender: identity([IN_SCOPE_SLUG]),
      fromPhone: "+4915512345",
      messageId: "m1",
      text: "zusammenfassung akt 2026-014",
    });
    expect(reply).toContain("Müller");
    expect(audit).not.toHaveBeenCalledWith(
      "whatsapp.sender_denied",
      expect.anything(),
      expect.anything()
    );
  });

  it("answers when matterScope is 'all'", async () => {
    const reply = await handleLegalChatMessage({
      sender: identity("all"),
      fromPhone: "+4915512345",
      messageId: "m2",
      text: "zusammenfassung akt 2026-014",
    });
    expect(reply).toContain("Müller");
  });

  it("denies a case outside the sender's matterScope without revealing it exists", async () => {
    const reply = await handleLegalChatMessage({
      sender: identity([IN_SCOPE_SLUG]), // does NOT include OUT_OF_SCOPE_SLUG
      fromPhone: "+4915512345",
      messageId: "m3",
      text: "zusammenfassung akt 2026-099",
    });
    // Same "not found" shape as a genuinely unknown case — no leak of existence.
    expect(reply).not.toContain("Geheime Akte");
    expect(reply).toMatch(/keine (eindeutige )?Akte/);
    expect(audit).toHaveBeenCalledWith(
      "whatsapp.sender_denied",
      "whatsapp_identity",
      expect.objectContaining({
        details: expect.objectContaining({ caseSlug: OUT_OF_SCOPE_SLUG, reason: "matter_scope" }),
      })
    );
  });

  it("excludes out-of-scope matters from the ambiguous-match disambiguation list", async () => {
    const reply = await handleLegalChatMessage({
      sender: identity([IN_SCOPE_SLUG]),
      fromPhone: "+4915512345",
      messageId: "m4",
      text: "zusammenfassung akt 2026", // ambiguous: matches both case numbers
    });
    expect(reply).not.toContain("Geheime Akte");
    expect(reply).toContain("Müller");
  });
});
