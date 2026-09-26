// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const keys = [
  { id: "k1", ownerId: "u-1", active: true, kind: "api" },
  { id: "k2", ownerId: "u-1", active: true, kind: "addin" },
  { id: "k3", ownerId: "u-1", active: false, kind: "api" },
];
const update = vi.fn(async () => null);
const del = vi.fn(async () => undefined);
vi.mock("@/lib/api-key-store", () => ({
  getApiKeyStore: () => ({
    listByOwner: async (owner: string) => keys.filter((k) => k.ownerId === owner),
    update,
    delete: del,
  }),
}));
const revokeAllSessions = vi.fn(async (_userId: string) => undefined);
vi.mock("@/lib/auth/session", () => ({ revokeAllSessions: (id: string) => revokeAllSessions(id) }));

import { revokeUserAccess } from "./revoke-access";

beforeEach(() => {
  update.mockClear();
  del.mockClear();
  revokeAllSessions.mockClear();
});

describe("revokeUserAccess", () => {
  it("ends sessions, switches off API keys and deletes add-in tokens", async () => {
    const res = await revokeUserAccess("u-1");
    expect(revokeAllSessions).toHaveBeenCalledWith("u-1");
    expect(update).toHaveBeenCalledWith("k1", { active: false });
    expect(del).toHaveBeenCalledWith("k2");
    expect(update).not.toHaveBeenCalledWith("k3", expect.anything());
    expect(res.keysRevoked).toBe(2);
  });

  it("still switches off keys when ending sessions fails, then reports the error", async () => {
    revokeAllSessions.mockRejectedValueOnce(new Error("db down"));
    await expect(revokeUserAccess("u-1")).rejects.toThrow("db down");
    expect(update).toHaveBeenCalledWith("k1", { active: false });
  });
});
