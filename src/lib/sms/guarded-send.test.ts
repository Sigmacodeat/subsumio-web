import { describe, it, expect, beforeEach } from "vitest";
import { sendGuardedSms } from "./guarded-send";
import { getSmsConsentStore, __resetSmsConsentStoreForTests } from "./consent-store";
import { normalizePhone } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PHONE = "+436641234567";
const NORM = normalizePhone(PHONE);
const HASH = phoneHash(NORM);

async function grant(scopes: string[] = ["client_reminder"]) {
  const store = getSmsConsentStore();
  await store.create({
    id: `c-${HASH.slice(0, 8)}`,
    orgId: "org1",
    subjectType: "client",
    subjectRef: "client-1",
    phoneHash: HASH,
    scopes: scopes as never,
    optInAt: new Date().toISOString(),
    optOutAt: null,
    consentProof: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

const okSend = async () => ({ ok: true, sid: "SM123" });
const failSend = async () => ({ ok: false, error: "twilio_21610" });

describe("sendGuardedSms", () => {
  beforeEach(() => {
    process.env.SUBSUMIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "sms-consent-"));
    __resetSmsConsentStoreForTests();
  });

  it("blocks without consent", async () => {
    const r = await sendGuardedSms({
      to: PHONE,
      brainId: "b1",
      scope: "client_reminder",
      body: "Hallo",
      send: okSend,
    });
    expect(r.sent).toBe(false);
    expect(r.reason).toBe("no_consent");
  });

  it("blocks when the scope is not consented", async () => {
    await grant(["deadline_alert"]);
    const r = await sendGuardedSms({
      to: PHONE,
      brainId: "b1",
      scope: "client_reminder",
      body: "x",
      send: okSend,
    });
    expect(r.reason).toBe("no_consent");
  });

  it("sends with active consent", async () => {
    await grant();
    const r = await sendGuardedSms({
      to: PHONE,
      brainId: "b1",
      scope: "client_reminder",
      body: "Termin morgen",
      send: okSend,
    });
    expect(r.sent).toBe(true);
    expect(r.sid).toBe("SM123");
  });

  it("blocks after revocation", async () => {
    await grant();
    const store = getSmsConsentStore();
    const rows = await store.getByPhoneHash(HASH);
    await store.update(rows[0].id, { optOutAt: new Date().toISOString() });
    const r = await sendGuardedSms({
      to: PHONE,
      brainId: "b1",
      scope: "client_reminder",
      body: "x",
      send: okSend,
    });
    expect(r.reason).toBe("no_consent");
  });

  it("honors quiet hours unless urgent", async () => {
    await grant();
    const quiet = { startHour: 21, endHour: 8, localHour: 23 };
    const held = await sendGuardedSms({
      to: PHONE,
      brainId: "b1",
      scope: "client_reminder",
      body: "x",
      quietHours: quiet,
      send: okSend,
    });
    expect(held.reason).toBe("quiet_hours");
    const urgent = await sendGuardedSms({
      to: PHONE,
      brainId: "b1",
      scope: "client_reminder",
      body: "x",
      urgent: true,
      quietHours: quiet,
      send: okSend,
    });
    expect(urgent.sent).toBe(true);
  });

  it("surfaces provider failure without faking success", async () => {
    await grant();
    const r = await sendGuardedSms({
      to: PHONE,
      brainId: "b1",
      scope: "client_reminder",
      body: "x",
      send: failSend,
    });
    expect(r.sent).toBe(false);
    expect(r.reason).toBe("provider_error");
    expect(r.providerError).toBe("twilio_21610");
  });
});
