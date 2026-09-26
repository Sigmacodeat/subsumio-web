// @vitest-environment node
// Add-in tokens are issued only from a signed-in browser session.
import { beforeEach, describe, expect, it, vi } from "vitest";

let ctx: Record<string, unknown>;
let body: unknown;
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) => async () =>
      handler(ctx, body),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));
const issue = vi.fn(async () => ({
  token: "sk_addin_x",
  id: "id",
  expiresAt: "2026-09-27T08:00:00.000Z",
}));
const revoke = vi.fn(async () => 1);
const revokeOne = vi.fn(async () => 1);
vi.mock("@/lib/addin-token", () => ({
  ADDIN_TOKEN_SCOPES: ["write"],
  issueAddinToken: (...a: unknown[]) => issue(...(a as [])),
  revokeAddinTokens: (...a: unknown[]) => revoke(...(a as [])),
  revokeAddinToken: (...a: unknown[]) => revokeOne(...(a as [])),
  isStoredKeyUsable: () => true,
}));
vi.mock("@/lib/api-key-store", () => ({
  getApiKeyStore: () => ({ listByOwner: async () => [] }),
}));

import { DELETE, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  body = undefined;
  ctx = { user: { id: "u1", email: "a@firm.example" }, headers: {}, brainId: "b" };
});

describe("/api/addin-token", () => {
  it("issues a token from a session", async () => {
    const res = await POST(new Request("http://x", { method: "POST" }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ token: "sk_addin_x", scopes: ["write"] });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("never issues a token to a caller authenticated by an add-in token", async () => {
    ctx.apiKey = { id: "k", kind: "addin" };
    const res = await POST(new Request("http://x", { method: "POST" }) as never);
    expect(res.status).toBe(403);
    expect(issue).not.toHaveBeenCalled();
  });

  it("revokes the caller's add-in tokens", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE" }) as never);
    expect(await res.json()).toEqual({ revoked: 1 });
    expect(revoke).toHaveBeenCalledWith(expect.anything(), "u1");
  });

  it("issues a token for the add-in named by the Office dialog, and only for known add-ins", async () => {
    body = { client: "outlook" };
    await POST(new Request("http://x", { method: "POST" }) as never);
    expect(issue).toHaveBeenLastCalledWith(
      expect.anything(),
      { id: "u1", email: "a@firm.example" },
      expect.any(Number),
      "outlook"
    );
    body = { client: "excel" };
    await POST(new Request("http://x", { method: "POST" }) as never);
    expect(issue).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.any(Number),
      null
    );
  });

  it("an add-in signs out by revoking only its own token", async () => {
    ctx.apiKey = { id: "key-7", kind: "addin" };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }) as never);
    expect(res.status).toBe(200);
    expect(revokeOne).toHaveBeenCalledWith(expect.anything(), "u1", "key-7");
    expect(revoke).not.toHaveBeenCalled();
  });

  it("a permanent API key cannot revoke add-in tokens", async () => {
    ctx.apiKey = { id: "k", kind: "api" };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }) as never);
    expect(res.status).toBe(403);
    expect(revokeOne).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });
});
