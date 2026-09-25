import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getWhatsAppConsentStore,
  hasActiveConsent,
  isConsentActive,
  __resetWhatsAppConsentStoreForTests,
  whatsAppTenantKeys,
  type WhatsAppConsent,
} from "./consent-store";

/** Tenant keys of firm A (records carry orgId "org-a"). */
const A = whatsAppTenantKeys("brain-a", "org-a");
const B = whatsAppTenantKeys("brain-b", "org-b");

function makeConsent(over: Partial<WhatsAppConsent> = {}): WhatsAppConsent {
  const now = new Date().toISOString();
  return {
    id: `c-${Math.random().toString(36).slice(2)}`,
    orgId: "org-a",
    subjectType: "lawyer",
    subjectRef: "user-1",
    phoneHash: "hash-1",
    scopes: ["daily_briefing", "deadline_alert"],
    optInAt: now,
    optOutAt: null,
    consentProof: { source: "portal", text: "Ich willige ein." },
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe("WhatsAppConsentStore (file adapter)", () => {
  const origDataDir = process.env.SUBSUMIO_DATA_DIR;

  beforeEach(() => {
    process.env.SUBSUMIO_DATA_DIR = `/tmp/wa-consent-test-${Math.random().toString(36).slice(2)}`;
    delete process.env.SUBSUMIO_AUTH_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    __resetWhatsAppConsentStoreForTests();
  });

  afterEach(() => {
    if (origDataDir === undefined) delete process.env.SUBSUMIO_DATA_DIR;
    else process.env.SUBSUMIO_DATA_DIR = origDataDir;
    __resetWhatsAppConsentStoreForTests();
  });

  it("isConsentActive reflects opt-in and opt-out", () => {
    expect(isConsentActive(makeConsent())).toBe(true);
    expect(isConsentActive(makeConsent({ optOutAt: new Date().toISOString() }))).toBe(false);
    expect(isConsentActive(makeConsent({ optInAt: "" }))).toBe(false);
  });

  it("hasActiveConsent matches scope on active consent only", async () => {
    const store = getWhatsAppConsentStore();
    await store.create(makeConsent({ phoneHash: "h1", scopes: ["daily_briefing"] }));

    expect(await hasActiveConsent(store, A, "h1", "daily_briefing")).toBe(true);
    expect(await hasActiveConsent(store, A, "h1", "client_reminder")).toBe(false);
    expect(await hasActiveConsent(store, A, "unknown", "daily_briefing")).toBe(false);
  });

  it("opt-out withdraws consent", async () => {
    const store = getWhatsAppConsentStore();
    const c = await store.create(makeConsent({ phoneHash: "h2" }));
    expect(await hasActiveConsent(store, A, "h2", "daily_briefing")).toBe(true);

    await store.update(c.id, { optOutAt: new Date().toISOString() });
    expect(await hasActiveConsent(store, A, "h2", "daily_briefing")).toBe(false);
  });

  it("returns all consent rows for a phone hash", async () => {
    const store = getWhatsAppConsentStore();
    await store.create(makeConsent({ phoneHash: "h3" }));
    await store.create(makeConsent({ phoneHash: "h3", subjectType: "client" }));
    expect((await store.getByPhoneHash(A, "h3")).length).toBe(2);
  });

  it("consent is bound to the firm that recorded it", async () => {
    const store = getWhatsAppConsentStore();
    await store.create(makeConsent({ phoneHash: "h5", scopes: ["daily_briefing"] }));

    expect(await hasActiveConsent(store, A, "h5", "daily_briefing")).toBe(true);
    // Another firm on the same instance can neither rely on nor see it.
    expect(await hasActiveConsent(store, B, "h5", "daily_briefing")).toBe(false);
    expect(await store.getByPhoneHash(B, "h5")).toEqual([]);
    // A record keyed by the firm's brain id belongs to the same firm.
    await store.create(makeConsent({ phoneHash: "h6", orgId: "brain-a" }));
    expect(await hasActiveConsent(store, A, "h6", "daily_briefing")).toBe(true);
    // No tenant keys -> nothing (fail-closed).
    expect(await store.getByPhoneHash([], "h5")).toEqual([]);
    // The subject's own withdrawal still sees every firm's record.
    expect((await store.getByPhoneHashAllFirms("h5")).length).toBe(1);
  });

  it("legacy records without a firm key authorize no firm", async () => {
    const store = getWhatsAppConsentStore();
    await store.create(makeConsent({ phoneHash: "h7", orgId: "" }));
    await store.create({
      ...makeConsent({ phoneHash: "h7" }),
      orgId: undefined as unknown as string,
    });
    expect(await hasActiveConsent(store, A, "h7", "daily_briefing")).toBe(false);
    expect(await hasActiveConsent(store, B, "h7", "daily_briefing")).toBe(false);
    expect(await store.getByPhoneHash(["", "org-a"], "h7")).toEqual([]);
  });

  it("deletes a consent row", async () => {
    const store = getWhatsAppConsentStore();
    const c = await store.create(makeConsent({ phoneHash: "h4" }));
    await store.delete(c.id);
    expect(await store.getById(c.id)).toBeNull();
  });
});
