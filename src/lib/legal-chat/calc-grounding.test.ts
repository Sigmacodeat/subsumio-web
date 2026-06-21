/**
 * Followup D.14 — rvg_calc/deadline_calc WhatsApp replies must carry their
 * statutory basis. These are deterministic calculations (no LLM, no
 * hallucination risk), but they're still rechtsrelevant outputs handed to a
 * lawyer over WhatsApp — the citation-gate principle applied elsewhere in
 * this codebase (src/lib/citation-gate.ts) for AI-generated answers should
 * hold here too: every legal answer names what it's based on.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));

import { handleLegalChatMessage } from "./actions";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";

function identity(): WhatsAppIdentity {
  const now = new Date().toISOString();
  return {
    id: "id-1",
    orgId: "org-a",
    phoneHash: "hash",
    matterScope: "all",
    status: "active",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
    phone: "+4915512345",
    brainId: "org-a",
    role: "lawyer",
  };
}

describe("rvg_calc reply includes its VV-RVG legal basis", () => {
  it("cites § 13 RVG and the VV-RVG fee-item numbers", async () => {
    const reply = await handleLegalChatMessage({
      sender: identity(),
      fromPhone: "+4915512345",
      messageId: "m1",
      text: "rvg 50000",
    });
    expect(reply).toContain("§ 13 RVG");
    expect(reply).toContain("Nr. 3100 VV RVG");
    expect(reply).toContain("Nr. 3104 VV RVG");
    expect(reply).toContain("Nr. 1000 VV RVG");
  });
});

describe("deadline_calc reply includes its statutory basis", () => {
  it("cites the rule's underlying norm (e.g. § 517 ZPO for Berufung)", async () => {
    const reply = await handleLegalChatMessage({
      sender: identity(),
      fromPhone: "+4915512345",
      messageId: "m2",
      text: "frist berechnen zpo-berufung 2026-03-15 BY",
    });
    expect(reply).toContain("Rechtsgrundlage:");
    expect(reply).toContain("§ 517 ZPO");
  });
});
