// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
// A firm adopts its founder's brain. After a change of owner the founder can
// be removed or leave — from then on no entry point (session, API key,
// MCP/feed resolution) may open the firm brain for them.
import { beforeEach, describe, expect, it, vi } from "vitest";

const users = new Map<string, any>();
const orgs = new Map<string, any>();

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) => users.get(id) ?? null,
    update: async (id: string, patch: Record<string, unknown>) => {
      const next = { ...users.get(id), ...patch };
      users.set(id, next);
      return next;
    },
  }),
  getOrgStore: () => ({
    getById: async (id: string) => orgs.get(id) ?? null,
    getByBrainId: async (brainId: string) =>
      [...orgs.values()].find((o) => o.brainId === brainId) ?? null,
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "cookie" }) }),
}));
let sessionUid = "founder";
vi.mock("@/lib/auth/session", () => ({
  verifySession: async () => ({ uid: sessionUid }),
  SESSION_COOKIE: "subsumio_session",
}));
vi.mock("@/lib/api-keys", () => ({ hashApiKey: async (k: string) => `hash_${k}` }));
vi.mock("@/lib/api-key-store", () => ({
  getApiKeyStore: () => ({
    findByHash: async () => ({
      id: "k1",
      ownerId: "founder",
      active: true,
      kind: "api",
      scopes: ["read"],
    }),
    update: async () => ({}),
  }),
}));

import {
  _resetFirmBrainCache,
  detachFromFirm,
  isPersonalBrainOfOtherFirm,
} from "./firm-brain";
import { engineContext, firmBrainIdFor } from "@/lib/engine";
import { verifyApiKey } from "./api-key-auth";

beforeEach(() => {
  _resetFirmBrainCache();
  users.clear();
  orgs.clear();
  sessionUid = "founder";
  // The founder's own brain became the firm brain; B is the new owner.
  users.set("founder", {
    id: "founder",
    email: "f@kanzlei.example",
    role: "admin",
    brainId: "brain_founder",
    orgId: "org-1",
  });
  users.set("partner", {
    id: "partner",
    email: "p@kanzlei.example",
    role: "admin",
    brainId: "brain_partner",
    orgId: "org-1",
  });
  orgs.set("org-1", { id: "org-1", ownerId: "partner", brainId: "brain_founder" });
});

describe("detachFromFirm", () => {
  it("gives a founder a new personal brain when they leave", async () => {
    const after = await detachFromFirm(users.get("founder"), orgs.get("org-1"));
    expect(after?.orgId).toBeNull();
    expect(after?.brainId).not.toBe("brain_founder");
    expect(after?.brainId).toMatch(/^brain_/);
  });

  it("keeps the personal brain of a member who joined", async () => {
    const after = await detachFromFirm(users.get("partner"), orgs.get("org-1"));
    expect(after?.orgId).toBeNull();
    expect(after?.brainId).toBe("brain_partner");
  });

  it("after removal the founder's session and key no longer reach the firm brain", async () => {
    await detachFromFirm(users.get("founder"), orgs.get("org-1"));
    const ctx = await engineContext();
    expect(ctx).not.toBeNull();
    expect(ctx!.brainId).not.toBe("brain_founder");
    const viaKey = await verifyApiKey("Bearer sk_live_abc");
    expect(viaKey?.ctx.brainId).not.toBe("brain_founder");
    expect(await firmBrainIdFor(users.get("founder"))).not.toBe("brain_founder");
  });
});

describe("records from before the fix (firm brain still the personal brain)", () => {
  beforeEach(() => {
    users.set("founder", { ...users.get("founder"), orgId: null });
  });

  it("is detected", async () => {
    expect(await isPersonalBrainOfOtherFirm(users.get("founder"))).toBe(true);
    expect(await isPersonalBrainOfOtherFirm(users.get("partner"))).toBe(false);
  });

  it("opens nothing: session, API key, MCP/feed resolution", async () => {
    expect(await engineContext()).toBeNull();
    expect(await verifyApiKey("Bearer sk_live_abc")).toBeNull();
    expect(await firmBrainIdFor(users.get("founder"))).toBeNull();
  });

  it("a member of the firm keeps the firm brain", async () => {
    sessionUid = "partner";
    const ctx = await engineContext();
    expect(ctx?.brainId).toBe("brain_founder");
  });
});
