/**
 * Followup D.14 — rvg_calc/deadline_calc WhatsApp replies must carry their
 * statutory basis. These are deterministic calculations (no LLM, no
 * hallucination risk), but they're still rechtsrelevant outputs handed to a
 * lawyer over WhatsApp — the citation-gate principle applied elsewhere in
 * this codebase (src/lib/citation-gate.ts) for AI-generated answers should
 * hold here too: every legal answer names what it's based on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
    // Staff numbers act for their bound member (KI4-04).
    memberUserId: "u-lawyer",
    member: { userId: "u-lawyer", role: "lawyer", orgId: "org-a" },
  };
}

// handleLegalChatMessage awaits createInboxPage/createOutboxPage (engine writes)
// before and after the calculation. Without a fetch stub those hit the real
// ENGINE_URL and block for the client's 30s AbortSignal timeout, so the test
// times out even though the calculation itself is pure and synchronous.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }))
  );
});

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

/** Engine stub whose Kanzlei-Settings page carries `settingsFm`. */
function stubSettings(settingsFm: Record<string, unknown> | null, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/pages/legal/settings/kanzlei")) {
        return status === 200
          ? Response.json({ slug: "legal/settings/kanzlei", frontmatter: settingsFm })
          : new Response("{}", { status });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    })
  );
}

describe("deadline_calc reply includes its statutory basis", () => {
  it("FRI-2 § 464 Abs 1 ZPO: AT-Kanzlei, Berufung ab 2026-03-02 → 2026-03-30, kein 'Bundesland: BY'", async () => {
    stubSettings({ rechtsraumCountry: "AT" });
    const reply = await handleLegalChatMessage({
      sender: identity(),
      fromPhone: "+4915512345",
      messageId: "m2",
      text: "frist berechnen berufung ab 2026-03-02",
    });
    expect(reply).toContain("Rechtsgrundlage: § 464 Abs 1 ZPO");
    expect(reply).toContain("Enddatum: 2026-03-30");
    expect(reply).not.toContain("BY");
    expect(reply).not.toContain("§ 517 ZPO");
  });

  it("FRI-2 § 222 Abs 1 ZPO: Rekurs zugestellt in der vhfZ nennt die Ferialsache-Warnung", async () => {
    stubSettings({ rechtsraumCountry: "AT" });
    const reply = await handleLegalChatMessage({
      sender: identity(),
      fromPhone: "+4915512345",
      messageId: "m3",
      text: "frist berechnen rekurs ab 2026-07-20",
    });
    expect(reply).toContain("Enddatum: 2026-08-31");
    expect(reply).toContain("Ferialsache prüfen");
  });

  it("FRI-2 § 222 Abs 2 ZPO: mit 'ferialsache' endet der Rekurs am 2026-08-03", async () => {
    stubSettings({ rechtsraumCountry: "AT" });
    const reply = await handleLegalChatMessage({
      sender: identity(),
      fromPhone: "+4915512345",
      messageId: "m4",
      text: "frist berechnen rekurs ab 2026-07-20 ferialsache",
    });
    expect(reply).toContain("Enddatum: 2026-08-03");
  });

  it("FRI-2: a German firm keeps the German rule and names it as such (§ 517 ZPO, DE)", async () => {
    stubSettings({ rechtsraumCountry: "DE", rechtsraumState: "NW" });
    const reply = await handleLegalChatMessage({
      sender: identity(),
      fromPhone: "+4915512345",
      messageId: "m5",
      text: "frist berechnen zpo-berufung 2026-03-15",
    });
    expect(reply).toContain("§ 517 ZPO");
    expect(reply).toContain("(DE)");
  });

  it("FRI-2: unreadable firm settings → no calculation instead of a guessed country", async () => {
    stubSettings(null, 502);
    const reply = await handleLegalChatMessage({
      sender: identity(),
      fromPhone: "+4915512345",
      messageId: "m6",
      text: "frist berechnen berufung ab 2026-03-02",
    });
    expect(reply).toContain("Fristberechnung nicht möglich");
    expect(reply).not.toContain("Enddatum");
  });
});
