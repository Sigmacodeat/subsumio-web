import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
    process.env.NODE_ENV = origEnv;
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
