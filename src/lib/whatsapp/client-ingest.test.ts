import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine")>()),
  ENGINE_URL: "http://engine-test:3001",
}));

import { ingestVerifiedClientWhatsAppSubmission } from "./client-ingest";
import type { WhatsAppIdentity, WhatsAppTextMessage } from "./types";

function sender(overrides: Partial<WhatsAppIdentity> = {}): WhatsAppIdentity {
  return {
    id: "id-1",
    orgId: "org-1",
    brainId: "firm-a",
    phone: "+436601234567",
    phoneHash: "hash-1",
    role: "client",
    matterScope: ["legal/cases/mueller"],
    status: "active",
    verifiedAt: "2026-09-01T00:00:00Z",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    name: "Max Mustermann",
    ...overrides,
  };
}

function textMessage(text: string): WhatsAppTextMessage {
  return { id: "msg-1", from: "436601234567", text, type: "text" };
}

function input(text: string, senderOverrides: Partial<WhatsAppIdentity> = {}) {
  return {
    sender: sender(senderOverrides),
    message: textMessage(text),
    eventSlug: "event-1",
    normalizedText: text,
  };
}

describe("ingestVerifiedClientWhatsAppSubmission — quick intents", () => {
  let writes: Array<Record<string, unknown>>;
  let fetchImpl: typeof fetch;

  beforeEach(() => {
    writes = [];
    fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method) {
        // GET case page
        return new Response(
          JSON.stringify({
            slug: "legal/cases/mueller",
            title: "Müller",
            frontmatter: {
              status: "aktiv",
              portal_enabled: true,
              deadlines: [
                { id: "d1", title: "Klagefrist", due_date: "2099-01-15", status: "pending" },
                { id: "d2", title: "Alte Frist", due_date: "2020-01-01", status: "pending" },
              ],
            },
          }),
          { status: 200 }
        );
      }
      writes.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
  });

  it("answers a status question directly instead of filing it as a submission", async () => {
    const result = await ingestVerifiedClientWhatsAppSubmission(
      input("Wie ist der Stand meiner Akte?"),
      fetchImpl
    );
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("aktiv");
    expect(result.reply).toContain("Klagefrist");
    expect(result.reply).toContain("2099-01-15");
    // Only the past deadline (2020) should never win over the future one (2099).
    expect(result.reply).not.toContain("Alte Frist");
    // No submission page was written for a pure status question.
    expect(writes).toHaveLength(0);
  });

  it("sends a portal link when the client asks for one", async () => {
    const result = await ingestVerifiedClientWhatsAppSubmission(
      input("Portal Link bitte"),
      fetchImpl
    );
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/\/portal\/[\w-]+\.[\w-]+/);
    expect(writes).toHaveLength(0);
  });

  it("recognizes an explicit request to sign online as a portal-link request", async () => {
    const result = await ingestVerifiedClientWhatsAppSubmission(
      input("Kann ich online unterschreiben?"),
      fetchImpl
    );
    expect(result.reply).toMatch(/\/portal\//);
  });

  it("does not treat a client narrating something they already signed as a link request", async () => {
    const result = await ingestVerifiedClientWhatsAppSubmission(
      input("Ich habe den Vertrag heute unterschrieben und schicke ihn gleich mit."),
      fetchImpl
    );
    // Falls through to the generic submission path — filed to the matter.
    expect(result.reply).toContain("zur Akte genommen");
    expect(writes.length).toBeGreaterThan(0);
  });

  it("hands an appointment request to the lawyer approval queue instead of filing or answering it", async () => {
    const result = await ingestVerifiedClientWhatsAppSubmission(
      input("Termin bitte, ich möchte vorbeikommen"),
      fetchImpl
    );
    expect(result.handled).toBe(false);
    expect(result.reason).toBe("appointment_request");
    expect(result.caseSlug).toBe("legal/cases/mueller");
    // Nothing was written yet — scheduling needs the lawyer, not an engine call.
    expect(writes).toHaveLength(0);
  });

  it("also recognizes an explicit 'termin vereinbaren' request mid-sentence", async () => {
    const result = await ingestVerifiedClientWhatsAppSubmission(
      input("Könnten wir kurzfristig einen Termin vereinbaren?"),
      fetchImpl
    );
    expect(result.reason).toBe("appointment_request");
  });

  it("does not treat a client explaining a missed appointment as a scheduling request", async () => {
    const result = await ingestVerifiedClientWhatsAppSubmission(
      input("Ich konnte den Termin am Montag leider nicht wahrnehmen."),
      fetchImpl
    );
    expect(result.reason).not.toBe("appointment_request");
    expect(result.reply).toContain("zur Akte genommen");
  });

  it("refuses a portal link when the matter has no portal enabled", async () => {
    fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method) {
        return new Response(
          JSON.stringify({
            slug: "legal/cases/mueller",
            title: "Müller",
            frontmatter: { status: "aktiv", portal_enabled: false },
          }),
          { status: 200 }
        );
      }
      writes.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await ingestVerifiedClientWhatsAppSubmission(input("Portal Link"), fetchImpl);
    expect(result.reply).toContain("nicht freigeschaltet");
    expect(result.reply).not.toContain("/portal/");
  });

  it("still files a normal message to the matter as before", async () => {
    const result = await ingestVerifiedClientWhatsAppSubmission(
      input("Ich habe noch eine Frage zum Termin nächste Woche."),
      fetchImpl
    );
    expect(result.reply).toContain("zur Akte genommen");
    expect(writes.length).toBeGreaterThan(0);
  });

  it("stamps a Posteingangsbuch entry for every filed submission", async () => {
    const result = await ingestVerifiedClientWhatsAppSubmission(
      input("Ich sende die unterschriebene Vollmacht."),
      fetchImpl
    );
    expect(result.handled).toBe(true);
    const stamp = writes.find((w) => w.type === "inbound_entry");
    expect(stamp).toBeDefined();
    const fm = stamp!.frontmatter as Record<string, unknown>;
    expect(fm.channel).toBe("whatsapp");
    expect(fm.case_slug).toBe("legal/cases/mueller");
    expect(fm.document_slug).toBe(result.submissionSlug);
    expect(fm.sender_name).toBe("Max Mustermann");
  });

  it("falls back to filing the message if the quick-intent lookup fails", async () => {
    let calls = 0;
    fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls++;
      if (!init?.method) {
        if (calls === 1) throw new Error("engine unreachable");
        return new Response(
          JSON.stringify({
            slug: "legal/cases/mueller",
            title: "Müller",
            frontmatter: {},
          }),
          { status: 200 }
        );
      }
      writes.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await ingestVerifiedClientWhatsAppSubmission(input("Status bitte"), fetchImpl);
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("zur Akte genommen");
  });
});
