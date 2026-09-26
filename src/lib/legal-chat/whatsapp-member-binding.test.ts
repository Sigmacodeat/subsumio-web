// @vitest-environment node
/**
 * KI4-04 / KI5-02 — WhatsApp staff messages run for the firm member who owns
 * the number, and brain answers reach WhatsApp as the engine's verified text
 * with grounding and KI label.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
const ground = vi.fn();
vi.mock("@/lib/citation-gate", () => ({
  groundAnswerCitations: (...a: unknown[]) => ground(...a),
}));

import { handleLegalChatMessage } from "./actions";
import { UNBOUND_STAFF_REPLY } from "@/lib/whatsapp/identity";
import { WHATSAPP_AI_NOTICE } from "@/lib/whatsapp/ai-answer";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";

const SECRET = "test-shared-secret";

function sender(member?: WhatsAppIdentity["member"]): WhatsAppIdentity {
  const now = new Date().toISOString();
  return {
    id: "wa-1",
    orgId: "org-a",
    brainId: "brain-a",
    phone: "+436641234567",
    phoneHash: "hash",
    // Who created the entry — must never end up in the engine token.
    userId: "u-creator-admin",
    role: "lawyer",
    matterScope: "all",
    status: "active",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
    ...(member ? { memberUserId: member.userId, member } : {}),
  };
}

const MEMBER = { userId: "u-lawyer-b", role: "lawyer", orgId: "org-a" };

function tokenPayload(headers: HeadersInit | undefined): Record<string, unknown> | null {
  const token = (headers as Record<string, string> | undefined)?.["x-subsumio-identity-token"];
  if (!token) return null;
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
}

function sse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("SUBSUMIO_WEB_API_KEY", SECRET);
  ground.mockReset();
  ground.mockResolvedValue({
    citations_verified: 0,
    citations_unverified: 1,
    corpus_checked: true,
    grounded_citations: [],
    analyzed_at: "2026-09-26T00:00:00.000Z",
    has_unverified: true,
  });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/think")) {
      return sse([
        { chunk: "Erfundener Erstentwurf" },
        {
          citations: [],
          warnings: ["GUARDRAIL_FLAGGED: 1 flags", "GUARDRAIL_REGENERATION_PASSED"],
          final_answer: "Geprüfte Endfassung.",
          answer_revised: true,
          revision_reason: "citation_guardrail",
        },
      ]);
    }
    if (u.includes("/api/pages?type=legal_case")) {
      return new Response(
        JSON.stringify([
          {
            slug: "legal/cases/2026-014",
            title: "Müller ./. Schmidt",
            type: "legal_case",
            frontmatter: { case_number: "2026-014" },
          },
        ]),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("WhatsApp staff number without a bound member (KI4-04)", () => {
  it("answers with the binding notice and makes no engine call", async () => {
    const reply = await handleLegalChatMessage({
      sender: sender(),
      fromPhone: "+436641234567",
      messageId: "m1",
      text: "status akt 2026-014",
    });
    expect(reply).toBe(UNBOUND_STAFF_REPLY);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("WhatsApp staff number bound to a member (KI4-04)", () => {
  it("signs every engine call for the member, never the creator", async () => {
    await handleLegalChatMessage({
      sender: sender(MEMBER),
      fromPhone: "+436641234567",
      messageId: "m2",
      text: "zusammenfassung akt 2026-014",
    });
    expect(fetchMock).toHaveBeenCalled();
    for (const [, init] of fetchMock.mock.calls) {
      const payload = tokenPayload((init as RequestInit | undefined)?.headers);
      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe("u-lawyer-b");
      expect(payload?.role).toBe("lawyer");
    }
  });
});

describe("WhatsApp brain_query (KI5-02)", () => {
  it("delivers the verified final answer with grounding note and KI label", async () => {
    const reply = await handleLegalChatMessage({
      sender: sender(MEMBER),
      fromPhone: "+436641234567",
      messageId: "m3",
      text: "frage: Rekursfrist im Außerstreitverfahren?",
    });
    expect(reply).toContain("Geprüfte Endfassung.");
    expect(reply).not.toContain("Erfundener Erstentwurf");
    expect(reply).toContain("1 Zitat(e) nicht verifiziert");
    expect(reply).toContain(WHATSAPP_AI_NOTICE);
  });
});
