/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "203.0.113.7",
}));
vi.mock("@/lib/realtime-bus", () => ({ broadcastPortalVisit: vi.fn() }));
vi.mock("@/lib/portal-token", () => ({
  verifyPortalToken: vi.fn(),
  isPortalTokenSuperseded: vi.fn(() => false),
}));

import { POST } from "./route";
import { verifyPortalToken } from "@/lib/portal-token";

const ENGINE = "http://localhost:3001";
const PNG = "data:image/png;base64," + "iVBORw0KGgo".repeat(20);

type Call = { url: string; init?: RequestInit };

function mockEngine(pages: Record<string, { status?: number; body?: unknown }>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const method = init?.method ?? "GET";
      if (method === "POST" && url === `${ENGINE}/api/pages`) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      const slug = decodeURIComponent(url.replace(`${ENGINE}/api/pages/`, ""));
      const page = pages[slug];
      if (!page) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify(page.body), { status: page.status ?? 200 });
    })
  );
  return calls;
}

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/portal/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": "vitest" },
    body: JSON.stringify(body),
  });
}

const baseBody = {
  token: "tok",
  document_slug: "legal/signatures/vollmacht-1",
  document_type: "power_of_attorney",
  signer_name: "Maria Mandantin",
  signature_format: "canvas_png",
  signature_data: PNG,
};

const openCase = { body: { frontmatter: { portal_enabled: true, status: "open" } } };

describe("POST /api/portal/sign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUBSUMIO_API_URL", ENGINE);
    vi.mocked(verifyPortalToken).mockResolvedValue({
      case_slug: "cases/mueller",
      brain_id: "brain_firm_a",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  it("signs a document of the token's matter in the firm's brain", async () => {
    const calls = mockEngine({
      "cases/mueller": openCase,
      "legal/signatures/vollmacht-1": {
        body: {
          type: "power_of_attorney",
          frontmatter: { case_slug: "cases/mueller", status: "sent", client_email: "m@x.at" },
        },
      },
    });

    const res = await POST(request(baseBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.signature.signer_name).toBe("Maria Mandantin");

    // Every engine call is scoped to the firm brain from the token.
    for (const call of calls) {
      const headers = (call.init?.headers ?? {}) as Record<string, string>;
      expect(headers["x-subsumio-source"]).toBe("brain_firm_a");
    }
    // Status update uses the engine's merge write, not a PATCH route.
    const writes = calls.filter((c) => c.init?.method === "POST");
    expect(writes).toHaveLength(2);
    expect(calls.some((c) => c.init?.method === "PATCH")).toBe(false);
    const merge = JSON.parse(String(writes[1].init?.body));
    expect(merge).toMatchObject({
      slug: "legal/signatures/vollmacht-1",
      merge: true,
      frontmatter: { status: "signed" },
    });
  });

  it("binds the signature to the signed text (sha256 of the content)", async () => {
    const { createHash } = await import("node:crypto");
    const content = "Vollmacht für Maria Mandantin …";
    const hash = createHash("sha256").update(content, "utf8").digest("hex");
    const calls = mockEngine({
      "cases/mueller": openCase,
      "legal/signatures/vollmacht-1": {
        body: {
          type: "power_of_attorney",
          content,
          frontmatter: { case_slug: "cases/mueller", status: "sent" },
        },
      },
    });
    const res = await POST(request({ ...baseBody, document_hash: hash }));
    expect(res.status).toBe(200);
    const writes = calls.filter((c) => c.init?.method === "POST");
    const stored = JSON.parse(String(writes[0].init?.body));
    expect(stored.frontmatter.document_hash).toBe(hash);
    expect(stored.frontmatter.document_hash_algorithm).toBe("sha256");
    const merge = JSON.parse(String(writes[1].init?.body));
    expect(merge.frontmatter.signed_document_hash).toBe(hash);
  });

  it("refuses the signature when the text changed after the client opened it", async () => {
    const calls = mockEngine({
      "cases/mueller": openCase,
      "legal/signatures/vollmacht-1": {
        body: {
          type: "power_of_attorney",
          content: "geänderte Fassung",
          frontmatter: { case_slug: "cases/mueller", status: "sent" },
        },
      },
    });
    const res = await POST(request({ ...baseBody, document_hash: "a".repeat(64) }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("document_changed");
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
  });

  it("a doubled sign request stores exactly one signature (create-only, stable id)", async () => {
    const created = new Set<string>();
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (init?.method === "POST" && url === `${ENGINE}/api/pages`) {
          const b = JSON.parse(String(init.body));
          if (b.if_absent) {
            if (created.has(b.slug)) return new Response("{}", { status: 409 });
            created.add(b.slug);
          }
          return new Response("{}", { status: 200 });
        }
        const slug = decodeURIComponent(url.replace(`${ENGINE}/api/pages/`, ""));
        if (slug === "cases/mueller") return new Response(JSON.stringify(openCase.body));
        if (slug === "legal/signatures/vollmacht-1")
          return new Response(
            JSON.stringify({
              type: "power_of_attorney",
              frontmatter: { case_slug: "cases/mueller", status: "sent", sent_at: "2026-09-01" },
            })
          );
        return new Response("{}", { status: 404 });
      })
    );
    const [a, b] = await Promise.all([POST(request(baseBody)), POST(request(baseBody))]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(created.size).toBe(1);
  });

  it("refuses a document that belongs to another matter", async () => {
    mockEngine({
      "cases/mueller": openCase,
      "legal/signatures/vollmacht-1": {
        body: { type: "power_of_attorney", frontmatter: { case_slug: "cases/other" } },
      },
    });
    const res = await POST(request(baseBody));
    expect(res.status).toBe(404);
  });

  it("refuses documents without a matter stamp", async () => {
    mockEngine({
      "cases/mueller": openCase,
      "legal/signatures/vollmacht-1": { body: { type: "power_of_attorney", frontmatter: {} } },
    });
    const res = await POST(request(baseBody));
    expect(res.status).toBe(404);
  });

  it("refuses already signed documents", async () => {
    mockEngine({
      "cases/mueller": openCase,
      "legal/signatures/vollmacht-1": {
        body: {
          type: "power_of_attorney",
          frontmatter: { case_slug: "cases/mueller", status: "signed" },
        },
      },
    });
    const res = await POST(request(baseBody));
    expect(res.status).toBe(409);
  });

  it.each([
    ["draft", {}],
    ["missing status", { status: undefined }],
    ["external tracking row", { status: "sent", provider: "external" }],
    ["DocuSign envelope", { status: "sent", provider: "docusign" }],
  ])("refuses a %s (only sent requests are signable)", async (_label, extra) => {
    const calls = mockEngine({
      "cases/mueller": openCase,
      "legal/signatures/vollmacht-1": {
        body: {
          type: "signature_request",
          frontmatter: { case_slug: "cases/mueller", status: "draft", ...extra },
        },
      },
    });
    const res = await POST(request(baseBody));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("not_signable");
    expect(calls.some((c) => (c.init?.method ?? "GET") !== "GET")).toBe(false);
  });

  it("refuses a request past its expiry date", async () => {
    mockEngine({
      "cases/mueller": openCase,
      "legal/signatures/vollmacht-1": {
        body: {
          type: "signature_request",
          frontmatter: {
            case_slug: "cases/mueller",
            status: "sent",
            expires_at: "2020-01-01T00:00:00Z",
          },
        },
      },
    });
    const res = await POST(request(baseBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/abgelaufen/);
  });

  it("refuses matters not released for the portal", async () => {
    mockEngine({ "cases/mueller": { body: { frontmatter: { portal_enabled: false } } } });
    const res = await POST(request(baseBody));
    expect(res.status).toBe(403);
  });

  it("refuses legacy tokens without a brain", async () => {
    vi.mocked(verifyPortalToken).mockResolvedValue({
      case_slug: "cases/mueller",
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any);
    mockEngine({});
    const res = await POST(request(baseBody));
    expect(res.status).toBe(403);
  });
});
