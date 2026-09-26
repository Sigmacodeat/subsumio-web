import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Firm accounts for the member binding (KI4-04).
const users = vi.hoisted(
  () =>
    new Map<
      string,
      { id: string; role: string; orgId: string | null; brainId: string; deactivatedAt?: string }
    >()
);
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async (id: string) => users.get(id) ?? null }),
}));
vi.mock("@/lib/auth/account-status", () => ({
  isAccountBlocked: async (u: { deactivatedAt?: string } | null) => !u || !!u.deactivatedAt,
}));
vi.mock("@/lib/engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine")>()),
  // Firm members work in their firm's brain.
  firmBrainIdFor: async (u: { orgId: string | null; brainId: string }) =>
    u.orgId === "org-a" ? "brain-a" : u.brainId,
}));

import { resolveSenderIdentity, identityCanAccessMatter } from "./identity";
import { getWhatsAppIdentityStore, __resetWhatsAppIdentityStoreForTests } from "./identity-store";
import { phoneHash } from "./verify";
import { normalizePhone, type WhatsAppIdentity } from "./types";

const PHONE = "+49 170 1234567";

function makeIdentity(over: Partial<WhatsAppIdentity> = {}): WhatsAppIdentity {
  const now = new Date().toISOString();
  const normalized = normalizePhone(PHONE);
  return {
    id: "wid-1",
    orgId: "org-a",
    brainId: "brain-a",
    phone: "",
    phoneHash: phoneHash(normalized),
    userId: "user-1",
    name: "Dr. Test",
    role: "lawyer",
    matterScope: "all",
    status: "active",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe("resolveSenderIdentity", () => {
  const origEnv = process.env.NODE_ENV;
  const origAllowed = process.env.WHATSAPP_ALLOWED_SENDERS_JSON;
  const origPhone = process.env.WHATSAPP_ALLOWED_PHONE;
  const origBrain = process.env.WHATSAPP_DEFAULT_BRAIN_ID;
  const origDataDir = process.env.SUBSUMIO_DATA_DIR;

  beforeEach(() => {
    // Isolated temp data dir per test so the file adapter starts empty.
    process.env.SUBSUMIO_DATA_DIR = `/tmp/wa-identity-test-${Math.random().toString(36).slice(2)}`;
    delete process.env.WHATSAPP_ALLOWED_SENDERS_JSON;
    delete process.env.WHATSAPP_ALLOWED_PHONE;
    delete process.env.WHATSAPP_DEFAULT_BRAIN_ID;
    __resetWhatsAppIdentityStoreForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    (process.env as { NODE_ENV?: string }).NODE_ENV = origEnv;
    if (origAllowed === undefined) delete process.env.WHATSAPP_ALLOWED_SENDERS_JSON;
    else process.env.WHATSAPP_ALLOWED_SENDERS_JSON = origAllowed;
    if (origPhone === undefined) delete process.env.WHATSAPP_ALLOWED_PHONE;
    else process.env.WHATSAPP_ALLOWED_PHONE = origPhone;
    if (origBrain === undefined) delete process.env.WHATSAPP_DEFAULT_BRAIN_ID;
    else process.env.WHATSAPP_DEFAULT_BRAIN_ID = origBrain;
    if (origDataDir === undefined) delete process.env.SUBSUMIO_DATA_DIR;
    else process.env.SUBSUMIO_DATA_DIR = origDataDir;
    __resetWhatsAppIdentityStoreForTests();
  });

  it("resolves an active stored identity and carries the normalized phone", async () => {
    await getWhatsAppIdentityStore().create(makeIdentity());
    const resolved = await resolveSenderIdentity(PHONE);
    expect(resolved).not.toBeNull();
    expect(resolved!.userId).toBe("user-1");
    expect(resolved!.phone).toBe(normalizePhone(PHONE));
    expect(resolved!.orgId).toBe("org-a");
  });

  it("denies a suspended identity", async () => {
    await getWhatsAppIdentityStore().create(makeIdentity({ status: "suspended" }));
    expect(await resolveSenderIdentity(PHONE)).toBeNull();
  });

  it("denies a revoked identity", async () => {
    await getWhatsAppIdentityStore().create(makeIdentity({ status: "revoked" }));
    expect(await resolveSenderIdentity(PHONE)).toBeNull();
  });

  it("denies an unknown number (no store entry)", async () => {
    await getWhatsAppIdentityStore().create(makeIdentity());
    expect(await resolveSenderIdentity("+49 170 9999999")).toBeNull();
  });

  it("LEAK GUARD: production never falls back to the env binding", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.WHATSAPP_ALLOWED_PHONE = PHONE;
    process.env.WHATSAPP_DEFAULT_BRAIN_ID = "brain-from-env";
    // Store is empty → prod must deny despite a valid env binding existing.
    expect(await resolveSenderIdentity(PHONE)).toBeNull();
  });

  it("dev falls back to the env binding for DX when the store is empty", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.WHATSAPP_ALLOWED_PHONE = PHONE;
    process.env.WHATSAPP_DEFAULT_BRAIN_ID = "brain-from-env";
    const resolved = await resolveSenderIdentity(PHONE);
    expect(resolved).not.toBeNull();
    expect(resolved!.brainId).toBe("brain-from-env");
    expect(resolved!.matterScope).toBe("all");
    expect(resolved!.verifiedAt).toBeNull();
  });

  it("the stored identity wins over the env binding even in dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.WHATSAPP_ALLOWED_PHONE = PHONE;
    process.env.WHATSAPP_DEFAULT_BRAIN_ID = "brain-from-env";
    await getWhatsAppIdentityStore().create(makeIdentity({ brainId: "brain-stored" }));
    const resolved = await resolveSenderIdentity(PHONE);
    expect(resolved!.brainId).toBe("brain-stored");
  });
});

describe("resolveSenderIdentity — owning firm member (KI4-04)", () => {
  const origDataDir = process.env.SUBSUMIO_DATA_DIR;

  beforeEach(() => {
    process.env.SUBSUMIO_DATA_DIR = `/tmp/wa-identity-test-${Math.random().toString(36).slice(2)}`;
    __resetWhatsAppIdentityStoreForTests();
    users.clear();
    users.set("u-admin-creator", {
      id: "u-admin-creator",
      role: "admin",
      orgId: "org-a",
      brainId: "p1",
    });
    users.set("u-lawyer-b", { id: "u-lawyer-b", role: "lawyer", orgId: "org-a", brainId: "p2" });
    users.set("u-other-firm", {
      id: "u-other-firm",
      role: "lawyer",
      orgId: "org-z",
      brainId: "brain-z",
    });
    users.set("u-gone", {
      id: "u-gone",
      role: "lawyer",
      orgId: "org-a",
      brainId: "p3",
      deactivatedAt: "2026-09-01T00:00:00.000Z",
    });
    users.set("u-viewer", { id: "u-viewer", role: "client_viewer", orgId: "org-a", brainId: "p4" });
  });

  afterEach(() => {
    if (origDataDir === undefined) delete process.env.SUBSUMIO_DATA_DIR;
    else process.env.SUBSUMIO_DATA_DIR = origDataDir;
    __resetWhatsAppIdentityStoreForTests();
  });

  it("binds the number to its owner with the owner's current role", async () => {
    await getWhatsAppIdentityStore().create(
      makeIdentity({ userId: "u-admin-creator", memberUserId: "u-lawyer-b" })
    );
    const resolved = await resolveSenderIdentity(PHONE);
    expect(resolved!.member).toEqual({ userId: "u-lawyer-b", role: "lawyer", orgId: "org-a" });
  });

  it("never treats the creator (legacy userId) as the owner", async () => {
    await getWhatsAppIdentityStore().create(makeIdentity({ userId: "u-admin-creator" }));
    const resolved = await resolveSenderIdentity(PHONE);
    expect(resolved).not.toBeNull();
    expect(resolved!.member).toBeUndefined();
  });

  it.each([
    ["deactivated account", "u-gone"],
    ["member of another firm", "u-other-firm"],
    ["non-staff account", "u-viewer"],
    ["unknown account", "u-missing"],
  ])("no member for a %s", async (_label, memberUserId) => {
    await getWhatsAppIdentityStore().create(makeIdentity({ memberUserId }));
    expect((await resolveSenderIdentity(PHONE))!.member).toBeUndefined();
  });

  it("client numbers never get a member", async () => {
    await getWhatsAppIdentityStore().create(
      makeIdentity({ role: "client", memberUserId: "u-lawyer-b" })
    );
    expect((await resolveSenderIdentity(PHONE))!.member).toBeUndefined();
  });
});

describe("identityCanAccessMatter", () => {
  it('grants every matter when scope is "all"', () => {
    expect(identityCanAccessMatter({ matterScope: "all" }, "akte-42")).toBe(true);
  });

  it("grants only listed matters when scope is an array", () => {
    expect(identityCanAccessMatter({ matterScope: ["akte-1", "akte-2"] }, "akte-1")).toBe(true);
    expect(identityCanAccessMatter({ matterScope: ["akte-1", "akte-2"] }, "akte-99")).toBe(false);
  });

  it("denies all matters for an empty scope array", () => {
    expect(identityCanAccessMatter({ matterScope: [] }, "akte-1")).toBe(false);
  });
});
