// @vitest-environment node
/**
 * W3-15: the WhatsApp case lookup searches every matter, not just the newest
 * few hundred the engine returns first.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));

import { handleLegalChatMessage } from "./actions";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";

const CASES = Array.from({ length: 450 }, (_, i) => ({
  slug: `legal/cases/c-${i}`,
  title: `Akte Nummer ${i}`,
  type: "legal_case",
  frontmatter: { type: "legal_case", case_number: `2019-${String(i).padStart(3, "0")}` },
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/pages" && url.searchParams.get("type") === "legal_case") {
        // Newest first, 100 per request like the engine.
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 100));
        const ordered = [...CASES].reverse();
        return new Response(JSON.stringify(ordered.slice(offset, offset + limit)), { status: 200 });
      }
      const slug = decodeURIComponent(url.pathname.replace(/^\/api\/pages\//, ""));
      const page = CASES.find((c) => c.slug === slug);
      return page
        ? new Response(JSON.stringify(page), { status: 200 })
        : new Response(JSON.stringify([]), { status: 200 });
    })
  );
});

function sender(): WhatsAppIdentity {
  const now = "2026-09-24T10:00:00.000Z";
  return {
    id: "wa-1",
    orgId: "org-a",
    brainId: "org-a",
    phone: "+436641234567",
    phoneHash: "h",
    role: "lawyer",
    matterScope: "all",
    status: "active",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

describe("WhatsApp case lookup", () => {
  it("finds the oldest of 450 matters by its file number", async () => {
    const reply = await handleLegalChatMessage({
      sender: sender(),
      fromPhone: "+436641234567",
      messageId: "m-1",
      text: "akt 2019-000",
    });
    expect(reply).toContain("Akte Nummer 0");
  });

  // W3-18: help examples in Austrian form for an Austrian firm.
  it("shows Austrian examples in the help text and no German fee calculator", async () => {
    const reply = await handleLegalChatMessage({
      sender: sender(),
      fromPhone: "+436641234567",
      messageId: "m-2",
      text: "hilfe",
    });
    expect(reply).toContain("0664 1234567");
    expect(reply).toContain("LG für ZRS Wien");
    expect(reply).not.toContain("+49");
    expect(reply).not.toMatch(/rvg 50000/i);
    expect(reply).not.toContain("LG München");
  });
});
