// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

let user: Record<string, unknown> = {};

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: {
        body?: { parse: (d: unknown) => unknown };
        query?: { parse: (d: unknown) => unknown };
      },
      handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const url = new URL(req.url);
      const body = opts.body ? opts.body.parse(await req.json()) : undefined;
      const query = opts.query
        ? opts.query.parse(Object.fromEntries(url.searchParams.entries()))
        : undefined;
      return handler({ brainId: "b1", user, headers: {} }, body, query);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown, _m?: unknown, status = 200) => Response.json({ data }, { status }),
}));

const members = [
  { id: "admin", name: "Admin", email: "admin@k.at", role: "admin" },
  { id: "b", name: "Assistenz B", email: "b@k.at", role: "assistant" },
];
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    listByOrg: async () => members,
    getById: async (id: string) => members.find((m) => m.id === id) ?? null,
  }),
  getSharedPgPool: () => null,
}));

const records = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("@/lib/ai-literacy", async (orig) => {
  const actual = await orig<typeof import("@/lib/ai-literacy")>();
  return {
    ...actual,
    listAiLiteracyRecords: async () => records,
    addAiLiteracyRecord: vi.fn(async (input: Record<string, unknown>) => ({ id: "new", ...input })),
  };
});

import { GET, POST } from "./route";
import { addAiLiteracyRecord } from "@/lib/ai-literacy";

beforeEach(() => {
  records.length = 0;
  records.push({
    id: "r1",
    brain_id: "b1",
    user_id: "admin",
    trained_on: "2026-09-01",
    topic: "Grundlagen",
    confirmed_by: "Dr. K",
    recorded_by: "admin@k.at",
    created_at: "2026-09-01T08:00:00.000Z",
  });
});

describe("/api/compliance/ai-literacy", () => {
  it("admin sees records and who has no record yet", async () => {
    user = { id: "admin", email: "admin@k.at", role: "admin", orgId: "o1" };
    const { data } = await (
      await GET(new Request("http://x/api/compliance/ai-literacy") as never)
    ).json();
    expect(data.missing.map((m: { id: string }) => m.id)).toEqual(["b"]);
    expect(data.records).toHaveLength(1);
  });

  it("admin exports CSV", async () => {
    user = { id: "admin", email: "admin@k.at", role: "admin", orgId: "o1" };
    const res = await GET(new Request("http://x/api/compliance/ai-literacy?format=csv") as never);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toContain("Grundlagen");
  });

  it("others only see their own records and cannot export", async () => {
    user = { id: "b", email: "b@k.at", role: "assistant", orgId: "o1" };
    const { data } = await (
      await GET(new Request("http://x/api/compliance/ai-literacy") as never)
    ).json();
    expect(data.records).toEqual([]);
    expect(data.missing).toBeUndefined();
    const csv = await GET(new Request("http://x/api/compliance/ai-literacy?format=csv") as never);
    expect(csv.status).toBe(403);
  });

  it("records a training only for a member of the firm", async () => {
    user = { id: "admin", email: "admin@k.at", role: "admin", orgId: "o1" };
    const post = (user_id: string) =>
      POST(
        new Request("http://x/api/compliance/ai-literacy", {
          method: "POST",
          body: JSON.stringify({
            user_id,
            trained_on: "2026-09-20",
            topic: "Zitatprüfung und Freigabe",
            confirmed_by: "Dr. K",
          }),
        }) as never
      );
    expect((await post("b")).status).toBe(201);
    expect(vi.mocked(addAiLiteracyRecord).mock.calls[0]![0]).toMatchObject({
      userId: "b",
      recordedBy: "admin@k.at",
    });
    expect((await post("fremd")).status).toBe(404);
  });
});
