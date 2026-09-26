// @vitest-environment node
import type { NextRequest } from "next/server";
import { describe, test, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const ctxUser = { id: "user-1", email: "anwalt@kanzlei.example", role: "lawyer" };

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

const intake = (fm: Record<string, unknown> = {}) => ({
  slug: "legal/intake/x",
  title: "Intake: Max Muster",
  type: "intake_request",
  frontmatter: {
    type: "intake_request",
    status: "new",
    client_name: "Max Muster",
    summary: "…",
    missing_documents: [],
    conflict_check_status: "pending",
    acceptance: {
      conflict_check: { status: "pending" },
      kyc: { required: true, status: "pending" },
      poa: { required: true, status: "pending" },
      engagement_letter: { status: "pending" },
    },
    ...fm,
  },
});

const engineAnswer = (severity: string, matches: unknown[] = []) =>
  new Response(JSON.stringify({ name: "x", severity, explanation: "", matches }), { status: 200 });

function call() {
  return POST(
    new Request("http://localhost/api/intake/conflict-check", {
      method: "POST",
      body: JSON.stringify({ slug: "legal/intake/x" }),
    }) as unknown as NextRequest
  );
}

function writtenFrontmatter() {
  const write = mockFetch.mock.calls.find(
    ([url, init]) =>
      String(url).endsWith("/api/pages") && (init as RequestInit | undefined)?.method === "POST"
  );
  return JSON.parse(String((write?.[1] as RequestInit).body)).frontmatter;
}

describe("POST /api/intake/conflict-check (server-side, OPS-1/OPS-3)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test("checks client and opponent with their side and records the real user", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(intake({ opponent: "Gegner GmbH" })), { status: 200 })
      )
      .mockResolvedValueOnce(engineAnswer("none"))
      .mockResolvedValueOnce(engineAnswer("none"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await call();
    expect(res.status).toBe(200);
    const checks = mockFetch.mock.calls
      .filter(([url]) => String(url).endsWith("/api/legal/conflict-check"))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(checks).toEqual([
      { name: "Max Muster", side: "client" },
      { name: "Gegner GmbH", side: "opponent" },
    ]);
    const fm = writtenFrontmatter();
    expect(fm.conflict_check_status).toBe("clear");
    expect(fm.acceptance.conflict_check).toMatchObject({
      status: "clear",
      performed_by: "anwalt@kanzlei.example",
      performed_by_id: "user-1",
    });
    // the rest of the workflow is kept
    expect(fm.acceptance.kyc).toEqual({ required: true, status: "pending" });
  });

  test("client who is opponent in an existing Akte → status conflict", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(intake()), { status: 200 }))
      .mockResolvedValueOnce(
        engineAnswer("critical", [
          {
            slug: "legal/cases/alt",
            title: "Alt",
            role: "opponent",
            matched_name: "Max Muster",
            assessment: "critical",
          },
        ])
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await call();
    expect(res.status).toBe(200);
    const fm = writtenFrontmatter();
    expect(fm.conflict_check_status).toBe("conflict");
    expect(fm.acceptance.conflict_check.status).toBe("conflict");
    expect(fm.acceptance.conflict_check.matches).toEqual(["legal/cases/alt"]);
  });

  test("engine answer without severity is not read as 'clear' (503)", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(intake()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ matches: [] }), { status: 200 }));
    const res = await call();
    expect(res.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("no client name → 422, nothing written", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(intake({ client_name: undefined })), { status: 200 })
    );
    const res = await call();
    expect(res.status).toBe(422);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
