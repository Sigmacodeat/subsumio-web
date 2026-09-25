// @vitest-environment node
import type { NextRequest } from "next/server";
import { describe, test, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const ctxUser: { id: string; email: string; role: string } = {
  id: "user-7",
  email: "partner@kanzlei.example",
  role: "lawyer",
};

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (...args: unknown[]) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const raw = await req.json().catch(() => ({}));
      const parsed = opts.body ? opts.body.safeParse(raw) : { success: true, data: raw };
      if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
      return handler(
        { headers: { "x-test": "1" }, brainId: "b1", user: ctxUser },
        parsed.data ?? raw
      );
    };
  },
  apiError: (code: string, message: string, status: number, details?: Record<string, unknown>) =>
    Response.json({ error: message, code, details }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

import { POST } from "./route";

const REASON = "Beide Parteien haben schriftlich zugestimmt.";

const intake = (conflictCheck: Record<string, unknown>) => ({
  slug: "legal/intake/x",
  title: "Intake",
  type: "intake_request",
  frontmatter: {
    type: "intake_request",
    status: "conflict_check",
    client_name: "Max Muster",
    summary: "…",
    missing_documents: [],
    acceptance: {
      conflict_check: conflictCheck,
      kyc: { required: true, status: "pending" },
      poa: { required: true, status: "pending" },
      engagement_letter: { status: "pending" },
    },
  },
});

const serverConflict = {
  status: "conflict",
  performed_at: "2026-09-25T10:00:00.000Z",
  performed_by: "anwalt@kanzlei.example",
  performed_by_id: "user-1",
  severity: "critical",
  matches: ["legal/cases/alt"],
};

function waive(reason = REASON) {
  return POST(
    new Request("http://localhost/api/intake/conflict-waiver", {
      method: "POST",
      body: JSON.stringify({ slug: "legal/intake/x", reason }),
    }) as unknown as NextRequest
  );
}

describe("POST /api/intake/conflict-waiver (OPS-3)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    ctxUser.role = "lawyer";
  });

  test("assistant may not waive (403), nothing is read or written", async () => {
    ctxUser.role = "assistant";
    const res = await waive();
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("a waiver needs a real justification", async () => {
    const res = await waive("ok");
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("only a server-recorded conflict can be waived", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(intake({ status: "conflict", performed_by: "current-user" })), {
        status: 200,
      })
    );
    const res = await waive();
    expect(res.status).toBe(409);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("lawyer waiver is stored with real user id, e-mail, role and reason", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(intake(serverConflict)), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await waive();
    expect(res.status).toBe(200);
    const write = JSON.parse(String((mockFetch.mock.calls[1]?.[1] as RequestInit).body));
    expect(write.frontmatter.acceptance.conflict_check).toMatchObject({
      status: "conflict",
      waived: true,
      waived_by: "partner@kanzlei.example",
      waived_by_id: "user-7",
      waived_by_role: "lawyer",
      waived_reason: REASON,
      performed_by_id: "user-1",
    });
  });
});
