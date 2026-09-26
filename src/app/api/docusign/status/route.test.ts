// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ user: {} as Record<string, unknown> }));
vi.mock("@/lib/auth/store", () => ({ getStore: () => ({ getById: async () => m.user }) }));
vi.mock("@/lib/docusign", () => ({
  docusignConfigProblem: () => null,
  docusignEnvironment: () => "production",
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_o: unknown, handler: (ctx: unknown) => Promise<Response>) => async () =>
      handler({ user: { id: "u1" } }),
}));

import { GET } from "./route";

const get = async () =>
  (await (GET as unknown as () => Promise<Response>)()).json() as Promise<Record<string, unknown>>;

describe("GET /api/docusign/status (R8-11)", () => {
  it("names the connected account, never the tokens", async () => {
    m.user = {
      docusignAccessToken: "secret-at",
      docusignRefreshToken: "secret-rt",
      docusignTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      docusignUserEmail: "anwalt@kanzlei.example",
    };
    const json = await get();
    expect(json).toMatchObject({
      configured: true,
      environment: "production",
      connected: true,
      renewable: true,
      email: "anwalt@kanzlei.example",
    });
    expect(JSON.stringify(json)).not.toContain("secret");
  });

  it("not connected → no account name", async () => {
    m.user = { docusignUserEmail: "stale@kanzlei.example" };
    const json = await get();
    expect(json).toMatchObject({ connected: false, email: null });
  });
});
