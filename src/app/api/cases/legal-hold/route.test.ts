import type { NextRequest } from "next/server";
// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));

const user = { id: "user-1", email: "test@example.com", role: "lawyer" };

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
      audit?: (
        ctx: unknown,
        body: unknown
      ) => { action: string; entityType: string; entityId?: string; details?: unknown };
    },
    handler: (ctx: unknown, body: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = {
        headers: { Authorization: "Bearer test" },
        brainId: "test-brain",
        user,
      };
      const raw = await req.json().catch(() => ({}));
      if (opts.body) {
        const parsed = opts.body.safeParse(raw);
        if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
      }
      const res = await handler(ctx, raw);
      // Like the real createHandler: the audit spec is written once on success.
      if (res.ok && opts.audit) {
        const spec = opts.audit(ctx, raw);
        const { logAudit } = await import("@/lib/audit");
        await logAudit(spec.action as never, spec.entityType, {
          entityId: spec.entityId,
          details: spec.details as Record<string, unknown>,
        });
      }
      return res;
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

const fetchMock = global.fetch as ReturnType<typeof vi.fn>;

/** Engine: GET of the matter (existence/type check), then the merge write. */
function engine(opts: { page?: unknown; pageStatus?: number; writeStatus?: number } = {}) {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") {
      const status = opts.pageStatus ?? 200;
      return new Response(
        JSON.stringify(opts.page ?? { slug: "legal/cases/test", type: "legal_case" }),
        { status }
      );
    }
    return new Response("{}", { status: opts.writeStatus ?? 200 });
  });
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/cases/legal-hold", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

const writes = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");

describe("POST /api/cases/legal-hold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    user.role = "lawyer";
  });

  test("activates legal hold on a case", async () => {
    engine();
    const res = await post({
      case_slug: "legal/cases/test",
      legal_hold: true,
      reason: "Beweissicherungsmaßnahme",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(body.data.legal_hold).toBe(true);

    const engineBody = JSON.parse(writes()[0]![1]?.body as string);
    expect(engineBody.frontmatter.legal_hold).toBe(true);
    expect(engineBody.frontmatter.legal_hold_reason).toBe("Beweissicherungsmaßnahme");
    expect(engineBody.frontmatter.legal_hold_set_by).toBe("test@example.com");

    expect(broadcastSseEvent).toHaveBeenCalledWith(
      "test-brain",
      "case.legal_hold_toggled",
      expect.objectContaining({ legalHold: true })
    );
    // Exactly one audit entry per toggle (no second, hand-written one).
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      "case.update",
      "legal_case",
      expect.objectContaining({
        entityId: "legal/cases/test",
        details: expect.objectContaining({ action: "legal_hold_activated" }),
      })
    );
  });

  test("an assistant may set a hold", async () => {
    user.role = "assistant";
    engine();
    const res = await post({ case_slug: "legal/cases/test", legal_hold: true });
    expect(res.status).toBe(200);
  });

  test("releases legal hold with a reason (lawyer)", async () => {
    engine();
    const res = await post({
      case_slug: "legal/cases/test",
      legal_hold: false,
      reason: "Verfahren rechtskräftig beendet",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.legal_hold).toBe(false);
  });

  test("an assistant may not release a hold (403), nothing written", async () => {
    user.role = "assistant";
    engine();
    const res = await post({
      case_slug: "legal/cases/test",
      legal_hold: false,
      reason: "Verfahren rechtskräftig beendet",
    });
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test("releasing without a reason is rejected (400)", async () => {
    engine();
    const res = await post({ case_slug: "legal/cases/test", legal_hold: false });
    expect(res.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test("a slug that is not a matter is rejected (400), no page is created", async () => {
    engine({ page: { slug: "legal/documents/x", type: "document" } });
    const res = await post({ case_slug: "legal/documents/x", legal_hold: true });
    expect(res.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test("a missing matter is 404, no page is created", async () => {
    engine({ pageStatus: 404 });
    const res = await post({ case_slug: "legal/cases/nope", legal_hold: true });
    expect(res.status).toBe(404);
    expect(writes()).toHaveLength(0);
  });

  test("an unreadable matter fails closed (503)", async () => {
    engine({ pageStatus: 500 });
    const res = await post({ case_slug: "legal/cases/test", legal_hold: true });
    expect(res.status).toBe(503);
    expect(writes()).toHaveLength(0);
  });

  test("returns 502 when engine update fails", async () => {
    engine({ writeStatus: 500 });
    const res = await post({ case_slug: "legal/cases/test", legal_hold: true });
    expect(res.status).toBe(502);
  });

  test("rejects missing case_slug", async () => {
    const res = await post({ legal_hold: true });
    expect(res.status).toBe(400);
  });

  test("rejects missing legal_hold boolean", async () => {
    const res = await post({ case_slug: "legal/cases/test" });
    expect(res.status).toBe(400);
  });
});
