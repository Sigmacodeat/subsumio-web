// @vitest-environment node
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashFeedSecret, parseFeedToken } from "@/lib/calendar-feed";

const stored: Record<string, unknown> = {};
const update = vi.fn(async (_id: string, patch: Record<string, unknown>) => {
  Object.assign(stored, patch);
  return stored;
});
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async () => ({ id: "u1", ...stored }), update }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (_opts: unknown, handler: (ctx: unknown) => Promise<Response>) => async () =>
    handler({ user: { id: "u1" } }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { DELETE, GET, POST } from "./route";

const req = {} as NextRequest;

beforeEach(() => {
  for (const k of Object.keys(stored)) delete stored[k];
  update.mockClear();
});

describe("/api/settings/dav-access", () => {
  it("creates a DAV token shown once; only its hash is stored — never the calendar hash", async () => {
    const res = await POST(req);
    const { token } = (await res.json()).data as { token: string };
    const parsed = parseFeedToken(token);
    expect(parsed?.userId).toBe("u1");
    expect(stored.davTokenHash).toBe(await hashFeedSecret(parsed!.secret));
    expect(stored).not.toHaveProperty("calendarFeedTokenHash");
    expect(JSON.stringify(stored)).not.toContain(parsed!.secret);

    const status = (await (await GET(req)).json()).data;
    expect(status.active).toBe(true);
  });

  it("revokes the DAV token", async () => {
    await POST(req);
    await DELETE(req);
    expect(stored.davTokenHash).toBeNull();
    expect((await (await GET(req)).json()).data.active).toBe(false);
  });
});
