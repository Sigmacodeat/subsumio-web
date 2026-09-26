// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MS365_CLIENT_ID = "cid";
  process.env.MS365_CLIENT_SECRET = "csecret";
});

const users = new Map<string, Record<string, unknown>>();
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) => users.get(id) ?? null,
    update: async (id: string, patch: Record<string, unknown>) => {
      users.set(id, { ...(users.get(id) ?? {}), ...patch });
      return users.get(id);
    },
  }),
}));

import { getUserMs365Token, isMs365Connected, MS365_NEEDS_RECONNECT } from "./msgraph-user";
import { GET as statusGET } from "@/app/api/outlook/status/route";
import type { User } from "@/lib/auth/store";

vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler: (_o: unknown, handler: (ctx: unknown) => Promise<Response>) => async () =>
      handler({ user: { id: "u1" }, brainId: "b", headers: {} }),
  };
});

beforeEach(() => {
  users.clear();
  users.set("u1", {
    id: "u1",
    email: "a@k.at",
    ms365AccessToken: "old",
    ms365RefreshToken: "rt",
    ms365TokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
    ms365UserEmail: "a@k.at",
  });
});

describe("Outlook refresh refused by Microsoft", () => {
  it("invalid_grant drops the tokens, records needs_reconnect and status says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "invalid_grant", error_description: "revoked" }, { status: 400 })
      )
    );
    await expect(getUserMs365Token("u1")).rejects.toMatchObject({ code: MS365_NEEDS_RECONNECT });
    const u = users.get("u1")!;
    expect(u.ms365SyncError).toBe("needs_reconnect");
    expect(u.ms365RefreshToken).toBeNull();
    expect(isMs365Connected(u as unknown as User)).toBe(false);

    const res = await (statusGET as unknown as () => Promise<Response>)();
    const json = await res.json();
    expect(json.data).toMatchObject({ connected: false, reason: "needs_reconnect" });
    vi.unstubAllGlobals();
  });

  it("a transient token-endpoint failure keeps the connection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "temporarily_unavailable" }, { status: 503 }))
    );
    await expect(getUserMs365Token("u1")).rejects.toMatchObject({
      code: "temporarily_unavailable",
    });
    expect(users.get("u1")!.ms365RefreshToken).toBe("rt");
    expect(users.get("u1")!.ms365SyncError).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
