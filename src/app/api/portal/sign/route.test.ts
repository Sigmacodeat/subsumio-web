/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "203.0.113.7",
}));
vi.mock("@/lib/realtime-bus", () => ({ broadcastPortalVisit: vi.fn() }));
vi.mock("@/lib/portal-token", () => ({ verifyPortalToken: vi.fn() }));

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
