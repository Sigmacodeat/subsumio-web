import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the network send layer — no real WhatsApp credentials in tests.
const sendText = vi.fn(async (..._a: unknown[]) => ({ messageId: "wamid.text.test" }));
const sendTemplate = vi.fn(async (..._a: unknown[]) => ({ messageId: "wamid.test" }));
vi.mock("./send", () => ({
  sendWhatsAppText: (...a: unknown[]) => sendText(...a),
  sendWhatsAppTemplate: (...a: unknown[]) => sendTemplate(...a),
}));
// Mock audit to keep the test pure (no file/db writes).
const audit = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => audit(...a) }));
// Mock outbound tracker — no DB in tests.
vi.mock("./outbound-tracker", () => ({
  recordOutboundMessage: vi.fn(async () => undefined),
  getOutboundBrainId: vi.fn(async () => undefined),
}));

// Organisations on this instance (brain → org lookup for the consent gate).
const orgs: Array<{ id: string; brainId: string }> = [];
vi.mock("@/lib/auth/store", () => ({ getOrgStore: () => ({ list: async () => orgs }) }));

import { consentTenantKeysForBrain, sendProactiveMessage } from "./proactive-send";
import { getWhatsAppWindowStore, __resetWhatsAppWindowStoreForTests } from "./window-store";
import { getWhatsAppConsentStore, __resetWhatsAppConsentStoreForTests } from "./consent-store";
import { phoneHash } from "./verify";
import { normalizePhone, type WhatsAppTemplateMessage } from "./types";

const PHONE = "+49 170 555000";
const HASH = phoneHash(normalizePhone(PHONE));
const TEMPLATE: WhatsAppTemplateMessage = { name: "daily_briefing", language: { code: "de" } };

async function grantConsent() {
  const now = new Date().toISOString();
  await getWhatsAppConsentStore().create({
    id: "c1",
    orgId: "org-a",
    subjectType: "lawyer",
    subjectRef: "user-1",
    phoneHash: HASH,
    scopes: ["daily_briefing"],
    optInAt: now,
    optOutAt: null,
    consentProof: {},
    createdAt: now,
    updatedAt: now,
  });
}

describe("sendProactiveMessage", () => {
  const origDataDir = process.env.SUBSUMIO_DATA_DIR;

  beforeEach(() => {
    process.env.SUBSUMIO_DATA_DIR = `/tmp/wa-proactive-test-${Math.random().toString(36).slice(2)}`;
    delete process.env.SUBSUMIO_AUTH_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    sendText.mockClear();
    sendTemplate.mockClear();
    audit.mockClear();
    __resetWhatsAppWindowStoreForTests();
    __resetWhatsAppConsentStoreForTests();
  });

  afterEach(() => {
    if (origDataDir === undefined) delete process.env.SUBSUMIO_DATA_DIR;
    else process.env.SUBSUMIO_DATA_DIR = origDataDir;
    __resetWhatsAppWindowStoreForTests();
    __resetWhatsAppConsentStoreForTests();
  });

  it("blocks when there is no consent and sends nothing", async () => {
    const res = await sendProactiveMessage({
      to: PHONE,
      brainId: "org-a",
      scope: "daily_briefing",
      freeform: "Guten Morgen",
    });
    expect(res.sent).toBe(false);
    expect(res.decision.reason).toBe("no_consent");
    expect(sendText).not.toHaveBeenCalled();
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      "whatsapp.outbound_blocked",
      "whatsapp_outbound",
      expect.anything()
    );
  });

  it("sends free-form inside the open window", async () => {
    await grantConsent();
    await getWhatsAppWindowStore().touch(HASH); // inbound just now → window open
    const res = await sendProactiveMessage({
      to: PHONE,
      brainId: "org-a",
      scope: "daily_briefing",
      freeform: "Heute 2 Fristen",
    });
    expect(res.sent).toBe(true);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      "whatsapp.outbound_sent",
      "whatsapp_outbound",
      expect.anything()
    );
  });

  it("blocks free-form outside the window (no template supplied)", async () => {
    await grantConsent();
    // No window touch → window closed.
    const res = await sendProactiveMessage({
      to: PHONE,
      brainId: "org-a",
      scope: "daily_briefing",
      freeform: "Heute 2 Fristen",
    });
    expect(res.sent).toBe(false);
    expect(res.decision.reason).toBe("template_required");
    expect(sendText).not.toHaveBeenCalled();
  });

  it("sends a template outside the window", async () => {
    await grantConsent();
    const res = await sendProactiveMessage({
      to: PHONE,
      brainId: "org-a",
      scope: "daily_briefing",
      template: TEMPLATE,
    });
    expect(res.sent).toBe(true);
    expect(res.messageId).toBe("wamid.test");
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("never relies on another firm's consent for the same number", async () => {
    await grantConsent(); // recorded by firm "org-a"
    const res = await sendProactiveMessage({
      to: PHONE,
      brainId: "brain-b",
      orgId: "org-b",
      scope: "daily_briefing",
      template: TEMPLATE,
    });
    expect(res.sent).toBe(false);
    expect(res.decision.reason).toBe("no_consent");
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("accepts the firm's consent recorded under its organisation id", async () => {
    await grantConsent(); // orgId "org-a"
    const res = await sendProactiveMessage({
      to: PHONE,
      brainId: "brain-of-org-a",
      orgId: "org-a",
      scope: "daily_briefing",
      template: TEMPLATE,
    });
    expect(res.sent).toBe(true);
  });

  it("resolves the firm's organisation from its brain when the caller does not name it", async () => {
    orgs.push({ id: "org-a", brainId: "brain-of-org-a" }, { id: "org-b", brainId: "brain-b" });
    try {
      expect(await consentTenantKeysForBrain("brain-of-org-a")).toEqual([
        "brain-of-org-a",
        "org-a",
      ]);
      expect(await consentTenantKeysForBrain("brain-solo")).toEqual(["brain-solo"]);
      await grantConsent(); // orgId "org-a"
      const own = await sendProactiveMessage({
        to: PHONE,
        brainId: "brain-of-org-a",
        scope: "daily_briefing",
        template: TEMPLATE,
      });
      expect(own.sent).toBe(true);
      const foreign = await sendProactiveMessage({
        to: PHONE,
        brainId: "brain-b",
        scope: "daily_briefing",
        template: TEMPLATE,
      });
      expect(foreign.sent).toBe(false);
      expect(foreign.decision.reason).toBe("no_consent");
    } finally {
      orgs.length = 0;
    }
  });
});
