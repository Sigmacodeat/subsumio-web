import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the network send layer — no real WhatsApp credentials in tests.
const sendText = vi.fn(async () => undefined);
const sendTemplate = vi.fn(async () => ({ messageId: "wamid.test" }));
vi.mock("./send", () => ({
  sendWhatsAppText: (...a: unknown[]) => sendText(...a),
  sendWhatsAppTemplate: (...a: unknown[]) => sendTemplate(...a),
}));
// Mock audit to keep the test pure (no file/db writes).
const audit = vi.fn(async () => undefined);
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => audit(...a) }));

import { sendProactiveMessage } from "./proactive-send";
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
});
