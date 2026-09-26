// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const members = [
  { id: "a", orgId: "org", twoFactorEnabled: true },
  { id: "b", orgId: "org", twoFactorEnabled: false },
  { id: "c", orgId: "org" },
  { id: "d", orgId: "org", deactivatedAt: "2026-01-01" },
];
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    listByOrg: async () => members,
    getById: async (id: string) => members.find((m) => m.id === id) ?? null,
  }),
}));
const revokeAllSessions = vi.fn(async (_id: string) => undefined);
vi.mock("@/lib/auth/session", () => ({ revokeAllSessions: (id: string) => revokeAllSessions(id) }));

import { enforceFirmTwoFactorNow, turnsOnTwoFactorRequirement } from "./two-factor-enforce";

beforeEach(() => revokeAllSessions.mockClear());

describe("firm-wide 2FA takes effect at once", () => {
  it("signs out every active member without their own second factor", async () => {
    expect(await enforceFirmTwoFactorNow({ id: "a", orgId: "org" })).toBe(2);
    expect(revokeAllSessions.mock.calls.map((c) => c[0]).sort()).toEqual(["b", "c"]);
  });

  it("only when the requirement is switched on", () => {
    expect(turnsOnTwoFactorRequirement({ require2FA: true }, { require2FA: false })).toBe(true);
    expect(turnsOnTwoFactorRequirement({ require2FA: true }, null)).toBe(true);
    expect(turnsOnTwoFactorRequirement({ require2FA: true }, { require2FA: true })).toBe(false);
    expect(turnsOnTwoFactorRequirement({ require2FA: false }, { require2FA: false })).toBe(false);
  });
});
