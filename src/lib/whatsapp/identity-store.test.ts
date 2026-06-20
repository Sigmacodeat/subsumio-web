import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getWhatsAppIdentityStore, __resetWhatsAppIdentityStoreForTests } from "./identity-store";
import { phoneHash } from "./verify";
import type { WhatsAppIdentity } from "./types";

function makeIdentity(over: Partial<WhatsAppIdentity> = {}): WhatsAppIdentity {
  const now = new Date().toISOString();
  return {
    id: `wid-${Math.random().toString(36).slice(2)}`,
    orgId: "org-a",
    brainId: "brain-a",
    phone: "",
    phoneHash: phoneHash(`+4917000${Math.floor(Math.random() * 100000)}`),
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

describe("WhatsAppIdentityStore (file adapter)", () => {
  const origDataDir = process.env.SUBSUMIO_DATA_DIR;

  beforeEach(() => {
    process.env.SUBSUMIO_DATA_DIR = `/tmp/wa-store-test-${Math.random().toString(36).slice(2)}`;
    delete process.env.SUBSUMIO_AUTH_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    __resetWhatsAppIdentityStoreForTests();
  });

  afterEach(() => {
    if (origDataDir === undefined) delete process.env.SUBSUMIO_DATA_DIR;
    else process.env.SUBSUMIO_DATA_DIR = origDataDir;
    __resetWhatsAppIdentityStoreForTests();
  });

  it("creates and reads back by phone hash and by id", async () => {
    const store = getWhatsAppIdentityStore();
    const identity = makeIdentity();
    await store.create(identity);

    expect((await store.getByPhoneHash(identity.phoneHash))?.id).toBe(identity.id);
    expect((await store.getById(identity.id))?.userId).toBe("user-1");
  });

  it("returns null for an unknown phone hash", async () => {
    const store = getWhatsAppIdentityStore();
    expect(await store.getByPhoneHash("deadbeef")).toBeNull();
  });

  it("lists only identities of the queried org (tenant isolation)", async () => {
    const store = getWhatsAppIdentityStore();
    await store.create(makeIdentity({ orgId: "org-a" }));
    await store.create(makeIdentity({ orgId: "org-a" }));
    await store.create(makeIdentity({ orgId: "org-b" }));

    expect((await store.listByOrg("org-a")).length).toBe(2);
    expect((await store.listByOrg("org-b")).length).toBe(1);
  });

  it("updates status and bumps updatedAt", async () => {
    const store = getWhatsAppIdentityStore();
    const identity = makeIdentity({ updatedAt: "2020-01-01T00:00:00.000Z" });
    await store.create(identity);

    const updated = await store.update(identity.id, { status: "revoked" });
    expect(updated?.status).toBe("revoked");
    expect(updated?.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("returns null when updating a missing identity", async () => {
    const store = getWhatsAppIdentityStore();
    expect(await store.update("nope", { status: "revoked" })).toBeNull();
  });

  it("deletes an identity", async () => {
    const store = getWhatsAppIdentityStore();
    const identity = makeIdentity();
    await store.create(identity);
    await store.delete(identity.id);
    expect(await store.getById(identity.id)).toBeNull();
  });
});
