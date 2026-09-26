// @vitest-environment node
/**
 * W3-2: consents arise where they legally arise, per firm, with proof — and a
 * withdrawal (STOPP) is never silently undone by a later recording.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getWhatsAppConsentStore,
  hasActiveConsent,
  whatsAppTenantKeys,
  __resetWhatsAppConsentStoreForTests,
} from "./consent-store";
import { CLIENT_CONSENT_SCOPES, STAFF_CONSENT_SCOPES, grantWhatsAppConsent } from "./consent-grant";

const FIRM = whatsAppTenantKeys("brain-1", "org-1");

describe("grantWhatsAppConsent", () => {
  const origDataDir = process.env.SUBSUMIO_DATA_DIR;
  beforeEach(() => {
    process.env.SUBSUMIO_DATA_DIR = `/tmp/wa-consent-grant-${Math.random().toString(36).slice(2)}`;
    delete process.env.SUBSUMIO_AUTH_DATABASE_URL;
    delete process.env.DATABASE_URL;
    __resetWhatsAppConsentStoreForTests();
  });
  afterEach(() => {
    if (origDataDir === undefined) delete process.env.SUBSUMIO_DATA_DIR;
    else process.env.SUBSUMIO_DATA_DIR = origDataDir;
    __resetWhatsAppConsentStoreForTests();
  });

  it("records a firm-bound consent with proof and extends scopes idempotently", async () => {
    const first = await grantWhatsAppConsent({
      brainId: "brain-1",
      orgId: "org-1",
      phoneHash: "h1",
      subjectType: "lawyer",
      subjectRef: "u-1",
      scopes: ["approval_request"],
      source: "staff_setup",
      proof: { recorded_by: "admin-1" },
    });
    expect(first.status).toBe("created");
    expect(first.consent.orgId).toBe("org-1");
    expect(first.consent.consentProof).toMatchObject({
      source: "staff_setup",
      recorded_by: "admin-1",
    });

    const again = await grantWhatsAppConsent({
      brainId: "brain-1",
      orgId: "org-1",
      phoneHash: "h1",
      subjectType: "lawyer",
      subjectRef: "u-1",
      scopes: STAFF_CONSENT_SCOPES,
      source: "staff_setup",
    });
    expect(again.status).toBe("extended");
    const store = getWhatsAppConsentStore();
    expect((await store.getByPhoneHash(FIRM, "h1")).length).toBe(1);
    expect(await hasActiveConsent(store, FIRM, "h1", "deadline_alert")).toBe(true);
    expect(
      await hasActiveConsent(store, whatsAppTenantKeys("b2", "org-2"), "h1", "deadline_alert")
    ).toBe(false);
  });

  it("never re-opens a withdrawn consent unless the person says START or an admin records it", async () => {
    const store = getWhatsAppConsentStore();
    const granted = await grantWhatsAppConsent({
      brainId: "brain-1",
      orgId: "org-1",
      phoneHash: "h2",
      subjectType: "client",
      subjectRef: "wa-1",
      scopes: CLIENT_CONSENT_SCOPES,
      source: "client_code",
    });
    await store.update(granted.consent.id, { optOutAt: "2026-09-20T10:00:00.000Z" });

    const byCode = await grantWhatsAppConsent({
      brainId: "brain-1",
      orgId: "org-1",
      phoneHash: "h2",
      subjectType: "client",
      subjectRef: "wa-1",
      scopes: CLIENT_CONSENT_SCOPES,
      source: "client_code",
    });
    expect(byCode.status).toBe("withdrawn");
    expect(await hasActiveConsent(store, FIRM, "h2", "client_reminder")).toBe(false);

    const byStart = await grantWhatsAppConsent({
      brainId: "brain-1",
      orgId: "org-1",
      phoneHash: "h2",
      subjectType: "client",
      subjectRef: "wa-1",
      scopes: CLIENT_CONSENT_SCOPES,
      source: "start_keyword",
    });
    expect(byStart.status).toBe("reinstated");
    expect(await hasActiveConsent(store, FIRM, "h2", "client_reminder")).toBe(true);
  });
});
