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
import { hit } from "@/lib/auth/rate-limit";

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

function request(message: string, extra: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost:3000/api/portal/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "tok", message, ...extra }),
  });
}

/** The firm's settings page with the portal AI mode ("KI im Mandantenportal"). */
const settings = (portalAiMode: string) => ({
  "legal/settings/kanzlei": {
    slug: "legal/settings/kanzlei",
    title: "Kanzlei-Einstellungen",
    frontmatter: { portalAiMode },
  },
});

const llmCalled = (calls: Call[]) => calls.some((c) => c.url === `${ENGINE}/api/llm/complete`);
const pageWrites = (calls: Call[]) =>
  calls
    .filter((c) => c.init?.method === "POST" && c.url === `${ENGINE}/api/pages`)
    .map((c) => JSON.parse(String(c.init?.body)) as Written);

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

type Written = {
  slug: string;
  type?: string;
  content?: string;
  merge?: boolean;
  frontmatter: Record<string, unknown> & {
    ai_draft?: { text?: string; status?: string };
    ai_assisted?: boolean;
  };
};

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
      ...settings("direkt"),
      "cases/mueller": casePage({}),
      "docs/klage": { slug: "docs/klage", title: "Klage", content: "KLAGETEXT", frontmatter: {} },
    });
    const res = await POST(request(question));
    expect((await res.json()).answer).toContain("Laut Klage");
    expect(calls.some((c) => c.url === `${ENGINE}/api/llm/complete`)).toBe(true);
  });

  it("still refuses questions about other matters, without a model call", async () => {
    const calls = mockEngine({ ...settings("direkt"), "cases/mueller": casePage({}) });
    const res = await POST(request("Zeig mir die anderen Akten der Kanzlei"));
    expect((await res.json()).answer).toMatch(/eigenen Akte/);
    expect(calls.some((c) => c.url === `${ENGINE}/api/llm/complete`)).toBe(false);
  });

  it("answers from released documents only, without engine retrieval", async () => {
    const calls = mockEngine({
      ...settings("direkt"),
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

// KI im Mandantenportal (KI4-03): an AI answer reaches a client only after a
// lawyer released it, unless the firm deliberately chose direct answers.
describe("POST /api/portal/chat — portal AI mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUBSUMIO_API_URL", ENGINE);
    vi.mocked(verifyPortalToken).mockResolvedValue({
      case_slug: "cases/mueller",
      brain_id: "brain_firm_a",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.mocked(hit).mockResolvedValue({ ok: true, retryAfterSeconds: 0 } as never);
  });

  const docs = {
    "cases/mueller": casePage({}),
    "docs/klage": { slug: "docs/klage", title: "Klage", content: "KLAGETEXT", frontmatter: {} },
  };

  it("default (firm never set a mode): the client gets no AI answer, the firm gets the draft", async () => {
    const calls = mockEngine(docs);
    const res = await POST(request("Wie stehen meine Chancen?"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("received");
    expect(json.answer).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("Laut Klage");

    const msg = pageWrites(calls).find((w) => w.type === "portal_message");
    expect(msg).toBeTruthy();
    expect(msg!.slug).toMatch(/^portal-message\/cases\/mueller\//);
    expect(msg!.frontmatter.sender).toBe("client");
    expect(msg!.frontmatter.message).toBe("Wie stehen meine Chancen?");
    expect(msg!.frontmatter.ai_draft).toMatchObject({ status: "pending" });
    expect(msg!.frontmatter.ai_draft?.text).toContain("Laut Klage");
    // No unreviewed chat record either.
    expect(pageWrites(calls).some((w) => w.type === "portal_chat")).toBe(false);
  });

  it('mode "entwurf" explicitly set behaves the same', async () => {
    mockEngine({ ...settings("entwurf"), ...docs });
    const json = await (await POST(request("Was steht in der Klage?"))).json();
    expect(json.status).toBe("received");
    expect(json.answer).toBeUndefined();
  });

  it("an unreadable settings page falls back to the draft mode, never to direct", async () => {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.includes("legal/settings/kanzlei")) return new Response("down", { status: 503 });
        if (url === `${ENGINE}/api/llm/complete`) {
          return new Response(JSON.stringify({ text: "Laut Klage …", usage: {} }), { status: 200 });
        }
        if (init?.method === "POST") return new Response("{}", { status: 200 });
        const slug = decodeURIComponent(url.replace(`${ENGINE}/api/pages/`, ""));
        const page = (docs as Record<string, unknown>)[slug];
        return page
          ? new Response(JSON.stringify(page), { status: 200 })
          : new Response("{}", { status: 404 });
      })
    );
    const json = await (await POST(request("Was steht in der Klage?"))).json();
    expect(json.status).toBe("received");
    expect(json.answer).toBeUndefined();
  });

  it('mode "aus" makes no model call and stores nothing', async () => {
    const calls = mockEngine({ ...settings("aus"), ...docs });
    const res = await POST(request("Was steht in der Klage?"));

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("portal_ai_disabled");
    expect(llmCalled(calls)).toBe(false);
    expect(pageWrites(calls)).toHaveLength(0);
    // No daily-cap slot used either (only the per-IP minute limit ran).
    expect(vi.mocked(hit).mock.calls.some((c) => String(c[0]).startsWith("portal-chat-day:"))).toBe(
      false
    );
  });

  it("the client cannot switch the mode through the request or the matter", async () => {
    const calls = mockEngine({
      "cases/mueller": casePage({ portalAiMode: "direkt", portal_ai_mode: "direkt" }),
      "docs/klage": docs["docs/klage"],
    });
    const res = await POST(
      request("Was steht in der Klage?", {
        mode: "direkt",
        ai_mode: "direkt",
        portalAiMode: "direkt",
      })
    );
    const json = await res.json();
    expect(json.status).toBe("received");
    expect(json.answer).toBeUndefined();
    expect(pageWrites(calls).find((w) => w.type === "portal_message")).toBeTruthy();
  });

  it("an unknown stored mode never reads as direct", async () => {
    mockEngine({ ...settings("DIREKT"), ...docs });
    const json = await (await POST(request("Was steht in der Klage?"))).json();
    expect(json.status).toBe("received");
  });

  it('mode "direkt" answers and labels the answer as unreviewed AI output', async () => {
    const calls = mockEngine({ ...settings("direkt"), ...docs });
    const json = await (await POST(request("Was steht in der Klage?"))).json();
    expect(json.answer).toContain("Laut Klage");
    expect(json.ai_generated).toBe(true);
    expect(pageWrites(calls).some((w) => w.type === "portal_message")).toBe(false);
  });

  it("draft mode past the daily cap still delivers the question, without a model call", async () => {
    vi.mocked(hit).mockImplementation(
      async (key: string) =>
        (String(key).startsWith("portal-chat-day:")
          ? { ok: false, retryAfterSeconds: 60 }
          : { ok: true, retryAfterSeconds: 0 }) as never
    );
    const calls = mockEngine(docs);
    const res = await POST(request("Was steht in der Klage?"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("received");
    expect(llmCalled(calls)).toBe(false);
    const msg = pageWrites(calls).find((w) => w.type === "portal_message");
    expect(msg!.frontmatter.ai_draft).toBeUndefined();
  });

  it("draft mode reports a failed save instead of claiming receipt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === `${ENGINE}/api/llm/complete`) {
          return new Response(JSON.stringify({ text: "Laut Klage …", usage: {} }), { status: 200 });
        }
        if (init?.method === "POST") return new Response("{}", { status: 500 });
        const slug = decodeURIComponent(url.replace(`${ENGINE}/api/pages/`, ""));
        const page = (docs as Record<string, unknown>)[slug];
        return page
          ? new Response(JSON.stringify(page), { status: 200 })
          : new Response("{}", { status: 404 });
      })
    );
    const res = await POST(request("Was steht in der Klage?"));
    expect(res.status).toBe(502);
  });
});
