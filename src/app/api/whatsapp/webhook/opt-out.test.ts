// @vitest-environment node

/**
 * Webhook-Opt-out-Policy: nach STOPP ist der Kanal stumm — keine
 * Orchestrator-Verarbeitung, kein AI-Reply, nur Archivierung + Audit.
 * Neukontakte ohne Consent-Row dürfen NICHT gemutet werden (inbound-
 * initiierte Konversation = 24h-Fenster).
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { WhatsAppConsent } from "@/lib/whatsapp/consent-store";

const mocks = vi.hoisted(() => {
  const rows: WhatsAppConsent[] = [];
  return {
    rows,
    signatureValid: { value: true },
    sendText: vi.fn(async (_to: string, _body: string) => ({ messageId: "out-1" })),
    orchestrate: vi.fn(async () => ({ reply: "Antwort", status: "answered" })),
    markProcessed: vi.fn(async (_id: string, _hash: string, _type: string, _status: string) => {}),
    audit: vi.fn(async (_action: string, _target: string, _meta?: unknown) => {}),
    storeUpdate: vi.fn(async (id: string, patch: Partial<WhatsAppConsent>) => {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
      return row ?? null;
    }),
  };
});

vi.mock("@/lib/whatsapp/send", () => ({
  sendWhatsAppText: mocks.sendText,
  sendWhatsAppInteractive: vi.fn(async () => ({ messageId: "out-2" })),
}));
vi.mock("@/lib/whatsapp/proactive-send", () => ({ sendProactiveMessage: vi.fn(async () => {}) }));
vi.mock("@/lib/whatsapp/dedup", () => ({
  isMessageProcessed: vi.fn(async () => false),
  markMessageProcessed: mocks.markProcessed,
}));
vi.mock("@/lib/whatsapp/verify", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/whatsapp/verify")>();
  return {
    ...orig,
    verifyWhatsAppSignature: () => mocks.signatureValid.value,
    phoneHash: (p: string) => `h:${p}`,
  };
});
vi.mock("@/lib/whatsapp/identity", () => ({
  // A confirmed client of firm org-1.
  resolveSenderIdentity: vi.fn(async () => ({
    id: "wa-1",
    brainId: "brain-1",
    orgId: "org-1",
    role: "client",
    verifiedAt: "2026-01-01T00:00:00Z",
    matterScope: ["legal/cases/a"],
    status: "active",
  })),
}));
vi.mock("@/lib/whatsapp/window-store", () => ({
  getWhatsAppWindowStore: () => ({ touch: vi.fn(async () => {}) }),
}));
vi.mock("@/lib/whatsapp/consent-store", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/whatsapp/consent-store")>();
  return {
    ...orig,
    getWhatsAppConsentStore: () => ({
      getByPhoneHash: async (keys: string[], hash: string) =>
        mocks.rows.filter((r) => r.phoneHash === hash && keys.includes(r.orgId)),
      getByPhoneHashAllFirms: async (hash: string) =>
        mocks.rows.filter((r) => r.phoneHash === hash),
      getById: async () => null,
      create: async (c: WhatsAppConsent) => c,
      update: mocks.storeUpdate,
      delete: async () => {},
    }),
  };
});
vi.mock("@/lib/whatsapp-kanzlei-os/orchestrator", () => ({
  orchestrateWhatsAppMessage: mocks.orchestrate,
}));
vi.mock("@/lib/whatsapp-event-bus", () => ({ buildWhatsAppMessageBody: vi.fn(() => "") }));
vi.mock("@/lib/whatsapp/outbound-tracker", () => ({
  recordOutboundMessage: vi.fn(),
  getOutboundBrainId: vi.fn(async () => null),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: () => ({ "x-brain": "b" }),
  enginePatchPage: vi.fn(async () => new Response("{}", { status: 200 })),
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));

import { POST } from "./route";

const PHONE = "+436641234567";

function consentRow(overrides: Partial<WhatsAppConsent> = {}): WhatsAppConsent {
  return {
    id: "c-1",
    orgId: "org-1",
    subjectType: "client",
    subjectRef: "client-1",
    phoneHash: `h:${PHONE}`,
    scopes: ["daily_briefing"],
    optInAt: "2026-01-01T00:00:00Z",
    optOutAt: null,
    consentProof: { source: "mandate" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function requestWith(bodyText: string, from = PHONE): NextRequest {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: `wamid.${Math.random().toString(36).slice(2)}`,
                  from,
                  type: "text",
                  text: { body: bodyText },
                  timestamp: "1700000000",
                },
              ],
            },
          },
        ],
      },
    ],
  };
  return new NextRequest("https://app.test/api/whatsapp/webhook", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function post(bodyText: string, from = PHONE) {
  const res = await POST(requestWith(bodyText, from));
  return { status: res.status, json: (await res.json()) as { results: Array<{ status: string }> } };
}

describe("whatsapp webhook — strict opt-out", () => {
  beforeEach(() => {
    mocks.rows.length = 0;
    mocks.signatureValid.value = true;
    vi.clearAllMocks();
  });

  test("STOPP widerruft Consent, sendet Bestätigung, Orchestrator bleibt aus", async () => {
    mocks.rows.push(consentRow());
    const { json } = await post("STOPP");
    expect(json.results[0].status).toBe("opt_out");
    expect(mocks.storeUpdate).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ optOutAt: expect.any(String) })
    );
    expect(mocks.sendText).toHaveBeenCalledOnce(); // Opt-out-Bestätigung
    expect(mocks.orchestrate).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      "whatsapp.consent_revoked",
      "whatsapp_identity",
      expect.anything()
    );
  });

  test("STOPP ist persistent — Folge-Nachricht mutet, kein Orchestrator", async () => {
    mocks.rows.push(consentRow({ optOutAt: "2026-09-01T00:00:00Z" }));
    const { json } = await post("Ich habe noch eine Fachfrage zum Vertrag");
    expect(json.results[0].status).toBe("opted_out");
    expect(mocks.orchestrate).not.toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled(); // komplett stumm, kein Reply
    expect(mocks.markProcessed).toHaveBeenCalledWith(
      expect.any(String),
      `h:${PHONE}`,
      "text",
      "opted_out_inbound"
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      "whatsapp.inbound_muted",
      "whatsapp_identity",
      expect.anything()
    );
  });

  test("Neukontakt ohne Consent-Row wird NICHT gemutet", async () => {
    const { json } = await post("Guten Tag, ich brauche anwaltliche Hilfe");
    expect(json.results[0].status).toBe("answered");
    expect(mocks.orchestrate).toHaveBeenCalledOnce();
  });

  test("aktive Einwilligung → Orchestrator läuft normal", async () => {
    mocks.rows.push(consentRow());
    const { json } = await post("Wann ist mein Termin?");
    expect(mocks.orchestrate).toHaveBeenCalledOnce();
    expect(json.results[0].status).toBe("answered");
  });

  test("START reaktiviert widerrufene Einwilligung", async () => {
    mocks.rows.push(consentRow({ optOutAt: "2026-09-01T00:00:00Z" }));
    const { json } = await post("START");
    expect(json.results[0].status).toBe("opt_in");
    expect(mocks.storeUpdate).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ optOutAt: null, optInAt: expect.any(String) })
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      "whatsapp.consent_granted",
      "whatsapp_identity",
      expect.anything()
    );
  });

  test("STOPP widerruft auch Einwilligungen anderer Kanzleien (Widerruf der betroffenen Person)", async () => {
    mocks.rows.push(consentRow(), consentRow({ id: "c-other", orgId: "org-2" }));
    const { json } = await post("STOPP");
    expect(json.results[0].status).toBe("opt_out");
    expect(mocks.storeUpdate).toHaveBeenCalledWith(
      "c-other",
      expect.objectContaining({ optOutAt: expect.any(String) })
    );
    expect(mocks.storeUpdate).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ optOutAt: expect.any(String) })
    );
  });

  test("START reaktiviert nur Einwilligungen der Kanzlei des Absenders", async () => {
    mocks.rows.push(
      consentRow({ optOutAt: "2026-09-01T00:00:00Z" }),
      consentRow({ id: "c-other", orgId: "org-2", optOutAt: "2026-09-01T00:00:00Z" })
    );
    await post("START");
    expect(mocks.storeUpdate).toHaveBeenCalledWith("c-1", expect.anything());
    expect(mocks.storeUpdate).not.toHaveBeenCalledWith("c-other", expect.anything());
  });

  test("Widerruf nur bei einer fremden Kanzlei mutet den Kanal der eigenen nicht", async () => {
    mocks.rows.push(
      consentRow({ id: "c-other", orgId: "org-2", optOutAt: "2026-09-01T00:00:00Z" })
    );
    const { json } = await post("Wann ist mein Termin?");
    expect(json.results[0].status).toBe("answered");
    expect(mocks.orchestrate).toHaveBeenCalledOnce();
  });

  test("ungültige Signatur → 401, nichts wird verarbeitet", async () => {
    mocks.signatureValid.value = false;
    mocks.rows.push(consentRow());
    const { status } = await post("STOPP");
    expect(status).toBe(401);
    expect(mocks.storeUpdate).not.toHaveBeenCalled();
    expect(mocks.orchestrate).not.toHaveBeenCalled();
  });
});

describe("whatsapp webhook — error reply to clients", () => {
  beforeEach(() => {
    mocks.rows.length = 0;
    mocks.signatureValid.value = true;
    vi.clearAllMocks();
  });

  test("a processing error is answered in the Sie-form, without a product name", async () => {
    mocks.orchestrate.mockRejectedValueOnce(new Error("boom"));
    const { json } = await post("Wann ist mein Termin?");
    expect(json.results[0].status).toBe("failed");
    const text = mocks.sendText.mock.calls[0]?.[1] ?? "";
    expect(text).toMatch(/versuchen Sie/);
    expect(text).not.toMatch(/versuche es|Kanzlei OS/);
  });
});
