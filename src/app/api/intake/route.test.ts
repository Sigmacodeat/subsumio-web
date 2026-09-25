// @vitest-environment node
import type { NextRequest } from "next/server";
import { describe, test, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

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
        {
          headers: { "x-test": "1" },
          brainId: "b1",
          user: { id: "u1", email: "assistenz@kanzlei.example", role: "assistant" },
        },
        parsed.data ?? raw
      );
    };
  },
  apiError: (code: string, message: string, status: number, details?: Record<string, unknown>) =>
    Response.json({ error: message, code, details }, { status }),
}));

import { PATCH } from "./route";

const storedCheck = {
  status: "pending",
  severity: "unknown",
  matches: [],
};

const storedIntake = {
  slug: "legal/intake/x",
  title: "Intake",
  type: "intake_request",
  frontmatter: {
    type: "intake_request",
    status: "new",
    client_name: "Max Muster",
    summary: "…",
    missing_documents: [],
    conflict_check_status: "pending",
    acceptance: {
      conflict_check: storedCheck,
      kyc: { required: true, status: "pending" },
      poa: { required: true, status: "pending" },
      engagement_letter: { status: "pending" },
    },
  },
};

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/intake", {
      method: "PATCH",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

describe("PATCH /api/intake — conflict check is server-owned (OPS-3)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test("a client-sent conflict_check 'clear' is ignored; the stored check stays", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(storedIntake), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await patch({
      slug: "legal/intake/x",
      acceptance: {
        conflict_check: { status: "clear", performed_by: "current-user", waived: true },
        kyc: { required: true, status: "pending" },
        poa: { required: true, status: "draft" },
        engagement_letter: { status: "draft" },
      },
    });
    expect(res.status).toBe(200);
    const write = JSON.parse(String((mockFetch.mock.calls[1]?.[1] as RequestInit).body));
    expect(write.frontmatter.acceptance.conflict_check).toEqual(storedCheck);
    expect(write.frontmatter.acceptance.poa.status).toBe("draft");
  });

  test("conflict_check_status 'clear' cannot be set by hand", async () => {
    const res = await patch({ slug: "legal/intake/x", conflict_check_status: "clear" });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("an arbitrary acceptance object is rejected", async () => {
    const res = await patch({ slug: "legal/intake/x", acceptance: { anything: true } });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("unreadable intake → no write (fail closed)", async () => {
    mockFetch.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const res = await patch({
      slug: "legal/intake/x",
      acceptance: {
        kyc: { required: true, status: "pending" },
        poa: { required: true, status: "pending" },
        engagement_letter: { status: "pending" },
      },
    });
    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
