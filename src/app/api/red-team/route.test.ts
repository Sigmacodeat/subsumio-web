import type { NextRequest } from "next/server";
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const think = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: {
        body: {
          safeParse: (d: unknown) => {
            success: boolean;
            data?: unknown;
            error?: { issues: Array<{ message: string }> };
          };
        };
      },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const parsed = opts.body.safeParse(await req.json());
      if (!parsed.success) {
        return Response.json(
          { error: "validation_failed", details: { issues: parsed.error!.issues } },
          { status: 400 }
        );
      }
      return handler({ headers: {}, brainId: "b" }, parsed.data);
    },
  apiError: (code: string, message: string, status: number, details?: unknown) =>
    Response.json({ error: message, code, details }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
  recordCreditConsumption: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/engine-think", () => ({ engineThink: think }));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));

import { POST } from "./route";

function call(body: Record<string, unknown>) {
  return POST(
    new Request("http://x/api/red-team", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  think.mockReset();
});

describe("POST /api/red-team", () => {
  it("a 30 000-character draft is refused with a German reason (no silent cut)", async () => {
    const res = await call({
      case_slug: "cases/a",
      draft_text: "x".repeat(30_000),
      case_context: "Kontext",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.issues[0].message).toMatch(/zu lang/);
    expect(think).not.toHaveBeenCalled();
  });

  it("a failed save is an error that still carries the analysis", async () => {
    think.mockResolvedValue({
      answer: '[{"type":"risk","severity":"high","section":"1","annotation":"a"}]',
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 500 }))
    );
    const res = await call({ case_slug: "cases/a", draft_text: "Entwurf", case_context: "K" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/nicht in der Akte gespeichert/);
    expect(body.details.result.annotations).toHaveLength(1);
  });
});
