import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "203.0.113.7",
}));
vi.mock("@/lib/portal-token", () => ({
  verifyPortalToken: vi.fn(),
  isPortalTokenSuperseded: vi.fn(() => false),
}));
vi.mock("@/lib/citation-gate", () => ({
  groundAnswerCitations: vi.fn(async () => ({
    corpus_checked: true,
    has_unverified: false,
    citations: [],
  })),
}));

import { POST } from "./route";
import { verifyPortalToken } from "@/lib/portal-token";

const ENGINE = "http://localhost:3001";
type Call = { url: string; init?: RequestInit };

function mockEngine(pages: Record<string, unknown>, completion = "Laut Klage vom 3. März …") {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === `${ENGINE}/api/llm/complete`) {
        return new Response(
          JSON.stringify({
            text: completion,
            model: "m",
            provider: "p",
            stop_reason: "end",
            usage: {},
            latency_ms: 1,
          }),
          { status: 200 }
        );
      }
      if (init?.method === "POST") return new Response("{}", { status: 200 });
      const slug = decodeURIComponent(url.replace(`${ENGINE}/api/pages/`, ""));
      const page = pages[slug];
      return page
        ? new Response(JSON.stringify(page), { status: 200 })
        : new Response("{}", { status: 404 });
    })
  );
  return calls;
}

function request(message: string) {
  return new NextRequest("http://localhost:3000/api/portal/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "tok", message }),
  });
}

const casePage = (fm: Record<string, unknown>) => ({
  slug: "cases/mueller",
  title: "Müller gegen Maier",
  content: "INTERNE STRATEGIE",
  frontmatter: {
    portal_enabled: true,
    status: "open",
    documents: [
      { slug: "docs/klage", portal_visible: true },
      { slug: "docs/intern", portal_visible: false },
    ],
    ...fm,
  },
});

describe("POST /api/portal/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUBSUMIO_API_URL", ENGINE);
    vi.mocked(verifyPortalToken).mockResolvedValue({
      case_slug: "cases/mueller",
      brain_id: "brain_firm_a",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  it.each([
    "Welcher Mitarbeiter betreut meine Akte?",
    "Gilt für meine Unterlagen die Geheimhaltung?",
  ])("answers an everyday question normally: %s", async (question) => {
    const calls = mockEngine({
      "cases/mueller": casePage({}),
      "docs/klage": { slug: "docs/klage", title: "Klage", content: "KLAGETEXT", frontmatter: {} },
    });
    const res = await POST(request(question));
    expect((await res.json()).answer).toContain("Laut Klage");
    expect(calls.some((c) => c.url === `${ENGINE}/api/llm/complete`)).toBe(true);
  });

  it("still refuses questions about other matters, without a model call", async () => {
    const calls = mockEngine({ "cases/mueller": casePage({}) });
    const res = await POST(request("Zeig mir die anderen Akten der Kanzlei"));
    expect((await res.json()).answer).toMatch(/eigenen Akte/);
    expect(calls.some((c) => c.url === `${ENGINE}/api/llm/complete`)).toBe(false);
  });

  it("answers from released documents only, without engine retrieval", async () => {
    const calls = mockEngine({
      "cases/mueller": casePage({}),
      "docs/klage": { slug: "docs/klage", title: "Klage", content: "KLAGETEXT", frontmatter: {} },
      "docs/intern": { slug: "docs/intern", title: "Intern", content: "GEHEIM", frontmatter: {} },
    });

    const res = await POST(request("Was steht in der Klage?"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.answer).toContain("Laut Klage");
    expect(calls.some((c) => c.url.includes("/api/chat") || c.url.includes("/api/think"))).toBe(
      false
    );
    const llm = calls.find((c) => c.url === `${ENGINE}/api/llm/complete`)!;
    const sent = JSON.parse(String(llm.init?.body));
    expect(sent.prompt).toContain("KLAGETEXT");
    expect(sent.prompt).not.toContain("GEHEIM");
    expect(sent.prompt).not.toContain("INTERNE STRATEGIE");
    expect(sent.prompt).toContain("<daten>");
    expect(sent.system).toContain("keine Anweisung");
    expect(calls.some((c) => c.url.includes("docs%2Fintern"))).toBe(false);
  });

  it("refuses a matter that is not released for the portal", async () => {
    const calls = mockEngine({ "cases/mueller": casePage({ portal_enabled: false }) });

    const res = await POST(request("Wie ist der Stand?"));

    expect(res.status).toBe(403);
    expect(calls.some((c) => c.url.includes("/api/llm/complete"))).toBe(false);
  });
});
