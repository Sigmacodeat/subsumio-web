import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const pages = new Map<string, { frontmatter: Record<string, unknown> }>();
const writes: Array<Record<string, unknown>> = [];
const mockAudit = vi.fn();
let role = "admin";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => mockAudit(...args) }));
vi.mock("@/lib/engine-page-io", () => ({
  getEnginePage: async (_h: unknown, slug: string) => pages.get(slug) ?? null,
}));
vi.mock("@/lib/api-handler", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    clientIpOf: () => undefined,
    createHandler: (
      opts: {
        action: string;
        body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
      },
      handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
    ) => {
      return async (req: Request) => {
        const user = { id: "u1", email: "a@kanzlei.at", role };
        if (!can(user as never, opts.action as never)) {
          return Response.json({ error: "forbidden" }, { status: 403 });
        }
        const raw = await req.json().catch(() => ({}));
        const parsed = opts.body?.safeParse(raw);
        if (parsed && !parsed.success) {
          return Response.json({ error: "validation_failed" }, { status: 400 });
        }
        return handler({ headers: {}, brainId: "b1", user }, parsed?.data ?? raw, undefined, req);
      };
    },
    apiError: (code: string, message: string, status: number) =>
      Response.json({ error: code, message }, { status }),
    apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
  };
});

import { PATCH } from "./route";

const MEMBER = {
  id: "staff-1",
  name: "Mag. Muster",
  email: "muster@kanzlei.at",
  role: "assistenz",
  vacation_days_per_year: 25,
  vacation_carryover_days: 0,
  active: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

function patch(id: string, member: Record<string, unknown>) {
  return PATCH(
    new Request("http://localhost/api/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, member }),
    }) as unknown as NextRequest
  );
}

beforeEach(() => {
  pages.clear();
  writes.length = 0;
  mockAudit.mockReset();
  role = "admin";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      writes.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true });
    })
  );
  pages.set("legal/staff/staff-1", { frontmatter: { ...MEMBER } });
});

describe("PATCH /api/staff", () => {
  test("assistant → 403, nichts geschrieben", async () => {
    role = "assistant";
    const res = await patch("staff-1", { ...MEMBER, vacation_days_per_year: 40 });
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  test("unbekannte id → 404 statt Upsert", async () => {
    const res = await patch("staff-neu", { ...MEMBER });
    expect(res.status).toBe(404);
    expect(writes).toHaveLength(0);
  });

  test("created_at kommt vom Server, Audit enthält das Feld-Diff", async () => {
    const res = await patch("staff-1", {
      ...MEMBER,
      vacation_days_per_year: 30,
      created_at: "1999-01-01T00:00:00Z",
    });
    expect(res.status).toBe(200);
    const written = writes[0]!.frontmatter as Record<string, unknown>;
    expect(written.created_at).toBe("2025-01-01T00:00:00Z");
    expect(written.vacation_days_per_year).toBe(30);
    expect(mockAudit).toHaveBeenCalledWith(
      "settings.update",
      "staff_member",
      expect.objectContaining({
        entityId: "staff-1",
        details: { changes: { vacation_days_per_year: { from: 25, to: 30 } } },
      })
    );
  });
});
