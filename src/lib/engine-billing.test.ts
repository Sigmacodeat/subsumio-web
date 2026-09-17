// @vitest-environment node
//
// Whose credits a request uses. One rule: the firm's paying account.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => new Map([["sb_session", { value: "tok" }]])),
}));
let sessionUid = "solo";
vi.mock("@/lib/auth/session", () => ({
  verifySession: vi.fn(async () => ({ uid: sessionUid })),
  SESSION_COOKIE: "sb_session",
}));
vi.mock("@/lib/env", () => ({ env: () => undefined }));
vi.mock("@/lib/auth/platform-operator", () => ({ isPlatformOperator: () => false }));
vi.mock("@/lib/support-session", () => ({ getActiveSupportSession: async () => null }));

type U = { id: string; plan: string; brainId: string; orgId?: string | null; deactivatedAt?: null };
const users: Record<string, U> = {};
const orgs: Record<string, Record<string, unknown>> = {};
const update = vi.fn(async (id: string, patch: Partial<U>) => ({ ...users[id], ...patch }));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async (id: string) => users[id] ?? null, update }),
  getOrgStore: () => ({ getById: async (id: string) => orgs[id] ?? null }),
}));

import { engineContext } from "./engine";

beforeEach(() => {
  update.mockClear();
  Object.assign(users, {
    solo: { id: "solo", plan: "pro", brainId: "b_solo" },
    founder: { id: "founder", plan: "team", brainId: "b_founder", orgId: "org-1" },
    member: { id: "member", plan: "free", brainId: "b_member", orgId: "org-1" },
    payer: { id: "payer", plan: "team", brainId: "b_payer", orgId: "org-2" },
    newOwner: { id: "newOwner", plan: "free", brainId: "b_new", orgId: "org-2" },
    stripe: { id: "stripe", plan: "pro", brainId: "b_stripe", orgId: "saas-billing-uuid" },
    blocked: { id: "blocked", plan: "free", brainId: "b_x", orgId: "org-3" },
  });
  Object.assign(orgs, {
    "org-1": { id: "org-1", brainId: "b_founder", ownerId: "founder" },
    "org-2": { id: "org-2", brainId: "b_payer", ownerId: "newOwner", billingUserId: "payer" },
    "org-3": { id: "org-3", brainId: "b_x", ownerId: "blocked", suspendedAt: "2026-09-17" },
  });
});

async function as(uid: string) {
  sessionUid = uid;
  return engineContext();
}

describe("billing account per request", () => {
  test("a lawyer working alone pays with their own account", async () => {
    const ctx = await as("solo");
    expect(ctx?.billing).toEqual({ ownerId: "solo", ownerType: "user" });
    expect(ctx?.plan).toBe("pro");
  });

  test("team members draw from the founder's pool and get the founder's plan", async () => {
    const ctx = await as("member");
    expect(ctx?.billing).toEqual({ ownerId: "founder", ownerType: "user" });
    expect(ctx?.plan).toBe("team");
    expect(ctx?.brainId).toBe("b_founder");
  });

  test("after an ownership handover the subscription holder still pays", async () => {
    const ctx = await as("newOwner");
    expect(ctx?.billing.ownerId).toBe("payer");
    expect(ctx?.plan).toBe("team");
  });

  test("a billing id in the membership field is treated as working alone and repaired", async () => {
    const ctx = await as("stripe");
    expect(ctx?.billing).toEqual({ ownerId: "stripe", ownerType: "user" });
    expect(ctx?.user.orgId).toBeNull();
    expect(ctx?.brainId).toBe("b_stripe");
    expect(update).toHaveBeenCalledWith("stripe", { orgId: null });
  });

  test("a suspended firm serves nobody", async () => {
    expect(await as("blocked")).toBeNull();
  });
});

describe("stripe webhook", () => {
  test("never writes or clears team membership", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/api/billing/webhook/route.ts"),
      "utf8"
    );
    const updates = src.match(/store\.update\([^)]*\)/gs) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    for (const call of updates) expect(call).not.toMatch(/orgId/);
  });
});
