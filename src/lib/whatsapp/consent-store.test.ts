import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getWhatsAppConsentStore,
  hasActiveConsent,
  isConsentActive,
  __resetWhatsAppConsentStoreForTests,
  type WhatsAppConsent,
} from "./consent-store";

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

    expect(await hasActiveConsent(store, "h1", "daily_briefing")).toBe(true);
    expect(await hasActiveConsent(store, "h1", "client_reminder")).toBe(false);
    expect(await hasActiveConsent(store, "unknown", "daily_briefing")).toBe(false);
  });

  it("opt-out withdraws consent", async () => {
    const store = getWhatsAppConsentStore();
    const c = await store.create(makeConsent({ phoneHash: "h2" }));
    expect(await hasActiveConsent(store, "h2", "daily_briefing")).toBe(true);

    await store.update(c.id, { optOutAt: new Date().toISOString() });
    expect(await hasActiveConsent(store, "h2", "daily_briefing")).toBe(false);
  });

  it("returns all consent rows for a phone hash", async () => {
    const store = getWhatsAppConsentStore();
    await store.create(makeConsent({ phoneHash: "h3" }));
    await store.create(makeConsent({ phoneHash: "h3", subjectType: "client" }));
    expect((await store.getByPhoneHash("h3")).length).toBe(2);
  });

  it("deletes a consent row", async () => {
    const store = getWhatsAppConsentStore();
    const c = await store.create(makeConsent({ phoneHash: "h4" }));
    await store.delete(c.id);
    expect(await store.getById(c.id)).toBeNull();
  });
});
