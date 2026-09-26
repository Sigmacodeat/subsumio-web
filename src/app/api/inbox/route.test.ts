import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockList = vi.fn();

vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...args: unknown[]) => mockList(...args),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { query?: { parse: (d: unknown) => unknown } },
    handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const query = opts.query!.parse(Object.fromEntries(new URL(req.url).searchParams));
      return handler({ headers: {} }, undefined, query);
    };
  },
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/inbox", () => {
  test("liest jede Quelle strikt und vollständig", async () => {
    mockList.mockImplementation(async (_h: unknown, type: string) =>
      type === "portal_message"
        ? Array.from({ length: 150 }, (_, i) => ({
            slug: `portal/${i}`,
            frontmatter: { sender: "Mandant" },
          }))
        : []
    );
    const res = await GET(new Request("http://localhost/api/inbox") as unknown as NextRequest);
    const body = await res.json();
    expect(body.data.messages).toHaveLength(150);
    expect(body.data.partial).toBeUndefined();
    expect(mockList).toHaveBeenCalledWith(expect.anything(), "portal_message", 200, {
      strict: true,
    });
  });

  test("Lesefehler einer Quelle → partial statt leerem Kanal", async () => {
    mockList.mockImplementation(async (_h: unknown, type: string) => {
      if (type === "bea_message") throw new Error("down");
      return [];
    });
    const res = await GET(new Request("http://localhost/api/inbox") as unknown as NextRequest);
    const body = await res.json();
    expect(body.data.partial).toBe(true);
    expect(body.data.failed_types).toEqual(["bea_message"]);
  });
});
