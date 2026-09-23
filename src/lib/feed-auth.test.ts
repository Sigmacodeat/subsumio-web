// @vitest-environment node
//
// The calendar link (handed to Google/Outlook) opens the deadline feed only;
// documents need the separately created DAV token.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFeedToken, createFeedSecret, hashFeedSecret } from "./calendar-feed";

type FeedUser = {
  id: string;
  calendarFeedTokenHash?: string | null;
  davTokenHash?: string | null;
};
const users: Record<string, FeedUser> = {};
const update = vi.fn(async (..._args: unknown[]) => null);
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async (id: string) => users[id] ?? null, update }),
}));
vi.mock("@/lib/engine", () => ({
  engineHeadersForUserId: vi.fn(async (id: string) => ({
    headers: { "x-subsumio-source": `brain-of-${id}` },
    user: { id },
  })),
}));
const hit = vi.fn(async (..._args: unknown[]) => ({ ok: true, retryAfterSeconds: 0 }));
vi.mock("@/lib/auth/rate-limit", () => ({ hit: (...a: unknown[]) => hit(...a) }));

import { resolveFeedToken } from "./feed-auth";

let calendarToken: string;
let davToken: string;

beforeEach(async () => {
  update.mockClear();
  hit.mockClear();
  const calSecret = createFeedSecret();
  const davSecret = createFeedSecret();
  calendarToken = buildFeedToken("u1", calSecret);
  davToken = buildFeedToken("u1", davSecret);
  users.u1 = {
    id: "u1",
    calendarFeedTokenHash: await hashFeedSecret(calSecret),
    davTokenHash: await hashFeedSecret(davSecret),
  };
});

describe("resolveFeedToken scopes", () => {
  it("the calendar link opens the calendar", async () => {
    const r = await resolveFeedToken(calendarToken, "calendar");
    expect(r).toMatchObject({ ok: true, userId: "u1", kind: "calendar" });
    expect(update).toHaveBeenCalledWith("u1", { calendarFeedLastUsedAt: expect.any(String) });
  });

  it("the calendar link does NOT open documents", async () => {
    expect(await resolveFeedToken(calendarToken, "documents")).toEqual({ ok: false, status: 404 });
    expect(update).not.toHaveBeenCalled();
  });

  it("the DAV token opens documents", async () => {
    const r = await resolveFeedToken(davToken, "documents");
    expect(r).toMatchObject({ ok: true, userId: "u1", kind: "dav" });
    expect(update).toHaveBeenCalledWith("u1", { davTokenLastUsedAt: expect.any(String) });
  });

  it("the DAV token also serves the CalDAV calendar of the bridge", async () => {
    expect(await resolveFeedToken(davToken, "calendar")).toMatchObject({ ok: true, kind: "dav" });
  });

  it("a legacy calendar link (created before the split, no DAV token) stays calendar-only", async () => {
    users.u1.davTokenHash = undefined;
    expect((await resolveFeedToken(calendarToken, "calendar")).ok).toBe(true);
    expect(await resolveFeedToken(calendarToken, "documents")).toEqual({ ok: false, status: 404 });
  });

  it("revoked DAV token → 404 everywhere", async () => {
    users.u1.davTokenHash = null;
    expect((await resolveFeedToken(davToken, "documents")).ok).toBe(false);
    expect((await resolveFeedToken(davToken, "calendar")).ok).toBe(false);
  });

  it("wrong secret, unknown user and malformed tokens answer the same 404", async () => {
    const wrong = buildFeedToken("u1", createFeedSecret());
    expect(await resolveFeedToken(wrong, "calendar")).toEqual({ ok: false, status: 404 });
    expect(
      await resolveFeedToken(buildFeedToken("nobody", createFeedSecret()), "calendar")
    ).toEqual({ ok: false, status: 404 });
    expect(await resolveFeedToken("garbage", "documents")).toEqual({ ok: false, status: 404 });
  });

  it("rate-limits per user before touching the store", async () => {
    hit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 30 });
    expect(await resolveFeedToken(davToken, "documents")).toEqual({ ok: false, status: 429 });
  });
});
