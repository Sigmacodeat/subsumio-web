// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/email/tracking", () => ({
  generateTrackingId: () => "trk_test",
  logTrackingEvent: vi.fn(),
}));

type Mailbox = typeof import("./mailbox");

const FIRM_A = { userId: "user_a", brainId: "org_firma" };
const FIRM_B = { userId: "user_b", brainId: "org_firmb" };

let dataDir: string;
let mailbox: Mailbox;
let sentPayloads: Array<Record<string, unknown>>;
let receivedEmails: Record<string, Record<string, unknown>>;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "mailbox-test-"));
  vi.stubEnv("SUBSUMIO_DATA_DIR", dataDir);
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("MAIL_FROM", "Subsumio <hello@subsum.io>");
  vi.stubEnv("MAIL_REPLY_TO", "");
  vi.stubEnv("EMAIL_INBOUND_DEFAULT_BRAIN_ID", "");
  sentPayloads = [];
  receivedEmails = {};
  let counter = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/emails/receiving/")) {
        const id = decodeURIComponent(url.split("/").pop() ?? "");
        return new Response(JSON.stringify(receivedEmails[id] ?? {}), { status: 200 });
      }
      if (url.startsWith("https://api.resend.com/emails")) {
        sentPayloads.push(JSON.parse(String(init?.body ?? "{}")));
        counter += 1;
        return new Response(JSON.stringify({ id: `re_sent_${counter}` }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    })
  );
  vi.resetModules();
  mailbox = await import("./mailbox");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(dataDir, { recursive: true, force: true });
});

async function receive(id: string, email: Record<string, unknown>) {
  receivedEmails[id] = email;
  return mailbox.storeInboundResendEmail({
    type: "email.received",
    data: { email_id: id },
  } as never);
}

describe("mailbox firm isolation", () => {
  it("routes plus-addressed inbound mail to the firm brain", async () => {
    await receive("in_1", {
      from: "Mandant <mandant@example.com>",
      to: ["hello+org_firma@subsum.io"],
      subject: "Unterlagen",
      text: "Anbei",
    });
    await receive("in_2", {
      from: "someone@example.com",
      to: ["hello@subsum.io"],
      subject: "Allgemeine Frage",
      text: "?",
    });

    const firmA = await mailbox.listMailMessages(FIRM_A);
    const firmB = await mailbox.listMailMessages(FIRM_B);
    const support = await mailbox.listMailMessages({
      userId: "operator",
      brainId: mailbox.supportMailboxBrainId(),
    });

    expect(firmA.map((m) => m.subject)).toEqual(["Unterlagen"]);
    expect(firmB).toEqual([]);
    expect(support.map((m) => m.subject)).toEqual(["Allgemeine Frage"]);
  });

  it("never exposes another firm's message by id", async () => {
    const msg = await receive("in_3", {
      from: "mandant@example.com",
      to: ["hello+org_firma@subsum.io"],
      subject: "Vertraulich",
      text: "…",
    });
    expect(await mailbox.getMailMessage(FIRM_B, msg!.id)).toBeNull();
    expect(await mailbox.updateMailMessage(FIRM_B, msg!.id, { isRead: true })).toBeNull();
    expect(await mailbox.getMailMessage(FIRM_A, msg!.id)).not.toBeNull();
  });
});

describe("mailbox matter filing", () => {
  it("files messages under a matter and filters by it", async () => {
    const msg = await receive("in_4", {
      from: "mandant@example.com",
      to: ["hello+org_firma@subsum.io"],
      subject: "Klage",
      text: "…",
    });
    await mailbox.updateMailMessage(FIRM_A, msg!.id, { caseSlug: "cases/mueller" });

    const filed = await mailbox.listMailMessages(FIRM_A, { caseSlug: "cases/mueller" });
    const other = await mailbox.listMailMessages(FIRM_A, { caseSlug: "cases/other" });
    expect(filed.map((m) => m.subject)).toEqual(["Klage"]);
    expect(other).toEqual([]);
  });

  it("sends with the firm's reply address and lets the client's reply inherit the matter", async () => {
    const sent = await mailbox.sendMailboxMessage(FIRM_A, {
      to: ["mandant@example.com"],
      subject: "Terminbestätigung",
      text: "Wir bestätigen den Termin.",
      caseSlug: "cases/mueller",
    });
    expect(sent.caseSlug).toBe("cases/mueller");
    expect(JSON.stringify(sentPayloads[0])).toContain("hello+org_firma@subsum.io");

    const reply = await receive("in_5", {
      from: "mandant@example.com",
      to: ["hello+org_firma@subsum.io"],
      subject: "Re: Terminbestätigung",
      text: "Danke",
      headers: { "In-Reply-To": `<${sent.providerId}@resend.dev>` },
    });
    expect(reply?.caseSlug).toBe("cases/mueller");
  });

  it("replies inherit the parent's matter and refuse foreign parents", async () => {
    const inbound = await receive("in_6", {
      from: "mandant@example.com",
      to: ["hello+org_firma@subsum.io"],
      subject: "Frage",
      text: "…",
    });
    await mailbox.updateMailMessage(FIRM_A, inbound!.id, { caseSlug: "cases/mueller" });

    const answer = await mailbox.sendMailboxMessage(FIRM_A, {
      to: ["mandant@example.com"],
      subject: "Frage",
      text: "Antwort",
      replyToMessageId: inbound!.id,
    });
    expect(answer.caseSlug).toBe("cases/mueller");
    expect(answer.subject).toBe("Re: Frage");

    await expect(
      mailbox.sendMailboxMessage(FIRM_B, {
        to: ["x@example.com"],
        subject: "Frage",
        text: "…",
        replyToMessageId: inbound!.id,
      })
    ).rejects.toThrow("reply_parent_not_found");
  });
});

describe("mailboxAddressForBrain", () => {
  it("builds the plus address and keeps the base for the support mailbox", () => {
    expect(mailbox.mailboxAddressForBrain("org_firma")).toBe("hello+org_firma@subsum.io");
    expect(mailbox.mailboxAddressForBrain(mailbox.supportMailboxBrainId())).toBe("hello@subsum.io");
  });
});
