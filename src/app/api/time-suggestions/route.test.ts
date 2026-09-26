import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockListPages = vi.fn();

vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({
    listPages: (...args: unknown[]) => mockListPages(...args),
  }),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    const ctx = {
      headers: { "x-subsumio-source": "brain-at" },
      brainId: "brain-at",
      user: { id: "u1", name: "Anwalt", email: "anwalt@example.com" },
    };
    return async (req: Request) =>
      handler(ctx, undefined, Object.fromEntries(new URL(req.url).searchParams.entries()), req);
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown, _meta?: unknown, status = 200) => Response.json({ data }, { status }),
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { GET } from "./route";

function get() {
  return GET(new Request("http://localhost/api/time-suggestions") as unknown as NextRequest);
}

describe("GET /api/time-suggestions", () => {
  beforeEach(() => vi.clearAllMocks());

  test("liefert nur die Vorschläge des angemeldeten Users", async () => {
    mockListPages.mockResolvedValue([
      { frontmatter: { id: "s1", user_email: "anwalt@example.com", description: "meins" } },
      { frontmatter: { id: "s2", user_email: "kollege@example.com", description: "fremd" } },
      { frontmatter: { id: "s3", user_email: "ANWALT@example.com", description: "case" } },
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.suggestions.map((s: { id: string }) => s.id)).toEqual(["s1", "s3"]);
  });

  test("filtert tombstoned Vorschläge und fehlende user_email", async () => {
    mockListPages.mockResolvedValue([
      { frontmatter: { id: "s1", user_email: "anwalt@example.com", status: "tombstoned" } },
      { frontmatter: { id: "s2", description: "kein user" } },
      { frontmatter: { id: "s3", user_email: "anwalt@example.com" } },
    ]);
    const res = await get();
    const body = await res.json();
    expect(body.data.suggestions.map((s: { id: string }) => s.id)).toEqual(["s3"]);
  });

  test("Engine-Lesefehler → 500, nie eine leere Liste", async () => {
    mockListPages.mockRejectedValue(new Error("engine down"));
    const res = await get();
    expect(res.status).toBe(500);
  });
});
