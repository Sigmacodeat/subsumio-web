// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) => {
      if (name === "sb_session") return { value: "token-123" };
      return undefined;
    }),
  })),
}));

vi.mock("./session", () => ({
  SESSION_COOKIE: "sb_session",
  verifySession: vi.fn(async (token?: string) => {
    if (!token) return null;
    return { uid: "user-1", email: "test@example.com", role: "lawyer", exp: 9999999999, v: 1 };
  }),
}));

vi.mock("./store", () => ({
  getStore: vi.fn(() => ({
    getById: vi.fn(async (id: string) => ({
      id, email: "test@example.com", name: "Max", role: "lawyer",
      brainId: "brain-1", passwordHash: "hash", createdAt: "2024-01-01",
      updatedAt: "2024-01-01", emailVerifiedAt: null, deactivatedAt: null,
      scimExternalId: null, ssoProvider: null,
    })),
  })),
  toPublic: vi.fn((user: { id: string; email: string; name: string; role: string; brainId: string }) => ({
    id: user.id, email: user.email, name: user.name, role: user.role, brainId: user.brainId,
  })),
}));

import { getSession, getSessionUser } from "./server";
import { verifySession } from "./session";
import { getStore, toPublic } from "./store";

describe("server auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("getSession returns session payload from cookie", async () => {
    const session = await getSession();
    expect(session).not.toBeNull();
    expect(session?.uid).toBe("user-1");
    expect(verifySession).toHaveBeenCalledWith("token-123");
  });

  test("getSessionUser returns public user", async () => {
    const user = await getSessionUser();
    expect(user).not.toBeNull();
    expect(user?.id).toBe("user-1");
    expect(user?.email).toBe("test@example.com");
    expect(toPublic).toHaveBeenCalled();
  });

  test("getSessionUser returns null when no session", async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(null);
    const user = await getSessionUser();
    expect(user).toBeNull();
  });

  test("getSessionUser returns null when user not found", async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      uid: "nonexistent", email: "x@x.com", role: "lawyer", exp: 9999999999, v: 1,
    });
    vi.mocked(getStore).mockReturnValueOnce({
      getById: vi.fn(async () => null),
    } as unknown as ReturnType<typeof getStore>);
    const user = await getSessionUser();
    expect(user).toBeNull();
  });
});
