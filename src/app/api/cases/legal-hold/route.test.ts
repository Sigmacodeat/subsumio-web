import type { NextRequest } from "next/server";
// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (ctx: unknown, body: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = {
        headers: { Authorization: "Bearer test" },
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
      };
      const raw = await req.json().catch(() => ({}));
      if (opts.body) {
        const parsed = opts.body.safeParse(raw);
        if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
      }
      return handler(ctx, raw);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

global.fetch = vi.fn() as unknown as typeof fetch;

import { POST } from "./route";
import { logAudit } from "@/lib/audit";
import { broadcastSseEvent } from "@/lib/realtime-bus";

describe("POST /api/cases/legal-hold", () => {
  beforeEach(() => vi.clearAllMocks());

  test("activates legal hold on a case", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("{}", { status: 200 })
    );

    const req = new Request("http://localhost/api/cases/legal-hold", {
      method: "POST",
      body: JSON.stringify({
        case_slug: "legal/cases/test",
        legal_hold: true,
        reason: "Beweissicherungsmaßnahme",
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(body.data.legal_hold).toBe(true);

    // Verify engine POST
    const engineCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const engineBody = JSON.parse(engineCall![1]?.body as string);
    expect(engineBody.frontmatter.legal_hold).toBe(true);
    expect(engineBody.frontmatter.legal_hold_reason).toBe("Beweissicherungsmaßnahme");
    expect(engineBody.frontmatter.legal_hold_set_by).toBe("test@example.com");

    // Verify SSE broadcast
    expect(broadcastSseEvent).toHaveBeenCalledWith(
      "test-brain",
      "case.legal_hold_toggled",
      expect.objectContaining({ legalHold: true })
    );

    // Verify audit log
    expect(logAudit).toHaveBeenCalledWith(
      "case.update",
      "legal_case",
      expect.objectContaining({ entityId: "legal/cases/test" })
    );
  });

  test("releases legal hold", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("{}", { status: 200 })
    );

    const req = new Request("http://localhost/api/cases/legal-hold", {
      method: "POST",
      body: JSON.stringify({ case_slug: "legal/cases/test", legal_hold: false }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.legal_hold).toBe(false);
  });

  test("returns 502 when engine update fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("Error", { status: 500 })
    );

    const req = new Request("http://localhost/api/cases/legal-hold", {
      method: "POST",
      body: JSON.stringify({ case_slug: "legal/cases/test", legal_hold: true }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  test("rejects missing case_slug", async () => {
    const req = new Request("http://localhost/api/cases/legal-hold", {
      method: "POST",
      body: JSON.stringify({ legal_hold: true }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("rejects missing legal_hold boolean", async () => {
    const req = new Request("http://localhost/api/cases/legal-hold", {
      method: "POST",
      body: JSON.stringify({ case_slug: "legal/cases/test" }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
