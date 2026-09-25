// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-rooms", () => ({
  getDataRoomStore: () => ({
    getRoom: async () => ({
      id: "room-1",
      title: "Datenraum",
      hostFirmName: "Kanzlei",
      caseSlug: "legal/cases/alt",
    }),
    documents: async () => [],
    members: async () => [],
  }),
}));
vi.mock("@/lib/data-room-access", () => ({
  roomRole: async () => ({ kind: "host", canManage: true }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, b: unknown, q: unknown, req: unknown) => unknown) =>
    (req: unknown) =>
      handler(
        { headers: {}, brainId: "b", user: { id: "u", email: "a@b.at" } },
        undefined,
        {},
        req
      ),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

/** 2 500 documents of the firm, 100 per engine request; the matter's one sits at 2 400. */
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string) => {
    const u = new URL(url);
    const start = Number(u.searchParams.get("cursor") ?? "0");
    const rows = Array.from({ length: Math.max(0, Math.min(100, 2500 - start)) }, (_, i) => {
      const n = start + i;
      return {
        slug: `docs/d${n}`,
        title: `D${n}`,
        frontmatter: { case_slug: n === 2400 ? "legal/cases/alt" : "legal/cases/andere" },
      };
    });
    const headers: Record<string, string> = {};
    if (start + 100 < 2500) headers["x-next-cursor"] = String(start + 100);
    return new Response(JSON.stringify(rows), { status: 200, headers });
  })
);

import { GET } from "./route";

describe("GET /api/data-rooms/[id]", () => {
  test("offers older matter documents beyond the newest 2 000 of the firm", async () => {
    const req = { params: Promise.resolve({ id: "room-1" }) };
    const res = (await (GET as unknown as (r: unknown) => Promise<Response>)(req)) as Response;
    const body = await res.json();
    expect(body.data.matter_documents).toEqual([{ slug: "docs/d2400", title: "D2400" }]);
  });
});
