// @vitest-environment node
/**
 * Webhook channel rules:
 *  - W3-1/W3-13: firm numbers without an active linked account run no firm
 *    commands; with one, the message is processed as that person.
 *  - W3-8: STOPP/START only as the whole message.
 *  - W3-9: unknown numbers get one friendly answer and — for a firm that
 *    receives public enquiries — an intake entry.
 *  - W3-21: a refused file is explained to the sender.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  sender: null as Record<string, unknown> | null,
  staff: { ok: true } as Record<string, unknown>,
  lastInbound: null as Date | null,
  publicBrain: null as string | null,
  sendText: vi.fn(async (_to: string, _body: string) => ({ messageId: "out-1" })),
  orchestrate: vi.fn(async (..._args: unknown[]) => ({ reply: "ok", status: "executed" })),
  runAs: vi.fn(async (_caller: unknown, fn: () => Promise<unknown>) => fn()),
  writeIntake: vi.fn(async () => ({ slug: "legal/intake/x" })),
  storeUpdate: vi.fn(async () => null),
}));

vi.mock("@/lib/whatsapp/send", () => ({
  sendWhatsAppText: m.sendText,
  sendWhatsAppInteractive: vi.fn(async () => ({ messageId: "out-2" })),
}));
vi.mock("@/lib/whatsapp/proactive-send", () => ({ sendProactiveMessage: vi.fn(async () => {}) }));
vi.mock("@/lib/whatsapp/dedup", () => ({
  isMessageProcessed: vi.fn(async () => false),
  markMessageProcessed: vi.fn(async () => {}),
}));
vi.mock("@/lib/whatsapp/verify", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/verify")>()),
  verifyWhatsAppSignature: () => true,
  phoneHash: (p: string) => `h:${p}`,
}));
vi.mock("@/lib/whatsapp/identity", () => ({ resolveSenderIdentity: vi.fn(async () => m.sender) }));
vi.mock("@/lib/whatsapp/staff-account", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/staff-account")>()),
  resolveStaffAccount: vi.fn(async (identity: Record<string, unknown>) =>
    m.staff.ok
      ? {
          ok: true,
          sender: { ...identity, email: "a@k.example" },
          caller: { brainId: "brain-1", userId: "u-1", role: "lawyer", matterScope: "all" },
        }
      : m.staff
  ),
}));
vi.mock("@/lib/whatsapp/window-store", () => ({
  getWhatsAppWindowStore: () => ({
    touch: vi.fn(async () => {}),
    getLastInbound: vi.fn(async () => m.lastInbound),
  }),
}));
vi.mock("@/lib/whatsapp/consent-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/consent-store")>()),
  getWhatsAppConsentStore: () => ({
    getByPhoneHash: async () => [],
    getByPhoneHashAllFirms: async () => [],
    getById: async () => null,
    create: async (c: unknown) => c,
    update: m.storeUpdate,
    delete: async () => {},
  }),
}));
vi.mock("@/lib/whatsapp-kanzlei-os/orchestrator", () => ({
  orchestrateWhatsAppMessage: m.orchestrate,
}));
vi.mock("@/lib/legal-chat/actions", () => ({ hasPendingWhatsAppChatAction: vi.fn() }));
vi.mock("@/lib/whatsapp-event-bus", () => ({ buildWhatsAppMessageBody: vi.fn(() => "") }));
vi.mock("@/lib/whatsapp/outbound-tracker", () => ({
  recordOutboundMessage: vi.fn(),
  getOutboundBrainId: vi.fn(async () => null),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: () => ({ "x-brain": "b" }),
  enginePatchPage: vi.fn(async () => new Response("{}", { status: 200 })),
  runAsEngineCaller: m.runAs,
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}), SYSTEM_BRAIN: "system" }));
vi.mock("@/lib/public-firm", () => ({
  resolvePublicFormBrainId: () => m.publicBrain,
  loadPublicFirm: async () =>
    m.publicBrain ? { name: "Kanzlei Beispiel", address: "Wien", email: "k@k.example" } : null,
}));
vi.mock("@/lib/intake", async (orig) => ({
  ...(await orig<typeof import("@/lib/intake")>()),
  writeIntakeRequest: m.writeIntake,
}));
vi.mock("@/lib/mail", () => ({ siteUrl: () => "https://app.test" }));

import { POST } from "./route";
import { WhatsAppMediaRejectedError } from "@/lib/whatsapp/media";

const PHONE = "436641234567";

function request(message: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.test/api/whatsapp/webhook", {
    method: "POST",
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: `wamid.${Math.random().toString(36).slice(2)}`,
                    from: PHONE,
                    timestamp: "1700000000",
                    ...message,
                  },
                ],
              },
            },
          ],
        },
      ],
    }),
  });
}

async function text(body: string) {
  const res = await POST(request({ type: "text", text: { body } }));
  return (await res.json()) as { results: Array<{ status: string; error?: string }> };
}

const client = {
  id: "wa-1",
  brainId: "brain-1",
  orgId: "org-1",
  role: "client",
  verifiedAt: "2026-09-01T00:00:00Z",
  matterScope: ["legal/cases/a"],
  status: "active",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.sender = client;
  m.staff = { ok: true };
  m.lastInbound = null;
  m.publicBrain = null;
});

describe("W3-8: consent keywords only as the whole message", () => {
  test("'Stopp, bitte …' is a message for the firm, not an opt-out", async () => {
    const json = await text("Stopp, bitte die Klage noch nicht einbringen!");
    expect(json.results[0].status).toBe("executed");
    expect(m.orchestrate).toHaveBeenCalledOnce();
    expect(m.storeUpdate).not.toHaveBeenCalled();
  });

  test("'Start der Verhandlung …' is a message for the firm, not an opt-in", async () => {
    const json = await text("Start der Verhandlung ist laut Ladung am 3.10., passt das?");
    expect(json.results[0].status).toBe("executed");
  });

  test("'STOP!' and 'Abmelden' alone are opt-outs", async () => {
    expect((await text("STOP!")).results[0].status).toBe("opt_out");
    expect((await text(" Abmelden ")).results[0].status).toBe("opt_out");
    expect(m.orchestrate).not.toHaveBeenCalled();
  });
});

describe("W3-1 / W3-13: firm numbers act as their linked account", () => {
  test("without an active linked account there are no firm commands", async () => {
    m.sender = { ...client, role: "lawyer", userId: "u-1" };
    m.staff = { ok: false, reason: "account_inactive" };
    const json = await text("akt 2026-014");
    expect(json.results[0].error).toBe("account_inactive");
    expect(m.orchestrate).not.toHaveBeenCalled();
    expect(m.sendText.mock.calls[0][1]).toMatch(/keinem aktiven Benutzerkonto/);
  });

  test("with a linked account the message runs as that person", async () => {
    m.sender = { ...client, role: "lawyer", userId: "u-1", userLinked: true };
    await text("akt 2026-014");
    expect(m.runAs).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-1", role: "lawyer" }),
      expect.any(Function)
    );
    expect(m.orchestrate).toHaveBeenCalledOnce();
  });
});

describe("W3-9: unknown senders", () => {
  test("get one friendly answer without firm data, and nothing is processed", async () => {
    m.sender = null;
    const json = await text("Guten Tag, ich brauche Hilfe");
    expect(json.results[0].error).toBe("sender_not_allowed");
    expect(m.orchestrate).not.toHaveBeenCalled();
    expect(m.sendText).toHaveBeenCalledOnce();
    expect(m.sendText.mock.calls[0][1]).toMatch(/wenden Sie sich direkt an Ihre Kanzlei/);
    expect(m.writeIntake).not.toHaveBeenCalled();
  });

  test("with a firm for public enquiries the message becomes an intake entry", async () => {
    m.sender = null;
    m.publicBrain = "brain-public";
    await text("Ich wurde gekündigt und brauche Beratung");
    expect(m.writeIntake).toHaveBeenCalledWith(
      "brain-public",
      expect.objectContaining({
        frontmatter: expect.objectContaining({ source: "whatsapp", status: "new" }),
      })
    );
    expect(m.sendText.mock.calls[0][1]).toContain("Kanzlei Beispiel");
    expect(m.sendText.mock.calls[0][1]).toContain("/erstanfrage");
  });

  test("answer only once a day", async () => {
    m.sender = null;
    m.lastInbound = new Date(Date.now() - 60_000);
    await text("Noch eine Nachricht");
    expect(m.sendText).not.toHaveBeenCalled();
  });
});

describe("W3-21: refused files", () => {
  test("the sender learns why the file was not accepted", async () => {
    m.orchestrate.mockRejectedValueOnce(
      new WhatsAppMediaRejectedError(
        "scan",
        "Diese Datei kann aus Sicherheitsgründen nicht angenommen werden."
      )
    );
    const res = await POST(
      request({ type: "document", document: { id: "media-1", mime_type: "application/pdf" } })
    );
    const json = (await res.json()) as { results: Array<{ status: string }> };
    expect(json.results[0].status).toBe("failed");
    expect(m.sendText.mock.calls[0][1]).toMatch(/Sicherheitsgründen/);
  });
});
