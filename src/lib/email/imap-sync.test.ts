import { describe, expect, it, vi } from "vitest";
import type { ParsedMail } from "mailparser";

vi.mock("imapflow", () => ({ ImapFlow: vi.fn() }));

import { describeImapError, resolveMatter, toInboundEmail } from "./imap-sync";

const account = { id: "acc-1", brainId: "brain_a", email: "kanzlei@example.at" };

function parsed(over: Partial<ParsedMail>): ParsedMail {
  return {
    attachments: [],
    headers: new Map(),
    headerLines: [],
    html: false,
    ...over,
  } as ParsedMail;
}

describe("toInboundEmail", () => {
  it("maps addresses, threading headers and attachment metadata", () => {
    const mail = parsed({
      messageId: "<abc@example.com>",
      inReplyTo: "<parent@example.at>",
      references: ["<root@example.at>", "<parent@example.at>"],
      subject: "QA-2026-003 Klage",
      text: "Hallo",
      date: new Date("2026-09-16T08:00:00Z"),
      from: {
        value: [{ address: "Petra.Novak@Example.com", name: "Petra Novak" }],
        html: "",
        text: "",
      },
      to: { value: [{ address: "Kanzlei@example.at", name: "" }], html: "", text: "" },
      attachments: [
        { filename: "klage.pdf", contentType: "application/pdf", size: 1234 },
      ] as ParsedMail["attachments"],
    });
    const out = toInboundEmail(account, 42, mail);
    expect(out.providerId).toBe("imap:acc-1:<abc@example.com>");
    expect(out.fromEmail).toBe("petra.novak@example.com");
    expect(out.fromName).toBe("Petra Novak");
    expect(out.to).toEqual(["kanzlei@example.at"]);
    expect(out.references).toBe("<root@example.at> <parent@example.at>");
    expect(out.receivedAt).toBe("2026-09-16T08:00:00.000Z");
    expect(out.raw.attachments).toEqual([
      { filename: "klage.pdf", contentType: "application/pdf", size: 1234 },
    ]);
  });

  it("falls back to the UID when a message has no Message-ID", () => {
    const out = toInboundEmail(account, 7, parsed({ subject: "ohne id" }));
    expect(out.providerId).toBe("imap:acc-1:uid-7");
    expect(out.html).toBeNull();
  });

  it("never carries credentials in the stored payload", () => {
    const out = toInboundEmail(account, 1, parsed({ subject: "x" }));
    expect(JSON.stringify(out)).not.toMatch(/password|pass"/i);
  });
});

describe("resolveMatter", () => {
  const matters = [
    {
      slug: "legal/cases/qa-2026-003-novak",
      title: "Novak gg. Versicherung AG",
      case_number: "QA-2026-003",
    },
    {
      slug: "legal/cases/qa-2026-004-gruber",
      title: "Gruber gg. Immo GmbH",
      case_number: "QA-2026-004",
    },
  ];
  const base = toInboundEmail(account, 1, parsed({ subject: "x", text: "" }));

  it("assigns by case number in the subject", () => {
    expect(resolveMatter({ ...base, subject: "AW: QA-2026-003 Klage zugestellt" }, matters)).toBe(
      "legal/cases/qa-2026-003-novak"
    );
  });

  it("leaves unrelated mail unassigned", () => {
    expect(resolveMatter({ ...base, subject: "Seminarprogramm Herbst" }, matters)).toBeNull();
  });

  it("returns null without matters", () => {
    expect(resolveMatter({ ...base, subject: "QA-2026-003" }, [])).toBeNull();
  });
});

describe("describeImapError", () => {
  it("explains a rejected login without echoing details", () => {
    expect(
      describeImapError({ authenticationFailed: true, message: "LOGIN geheim123 failed" })
    ).toBe("Anmeldung abgelehnt — Benutzername oder Passwort prüfen.");
  });
  it("maps network errors to plain German", () => {
    expect(describeImapError({ code: "ENOTFOUND" })).toMatch(/Hostname/);
    expect(describeImapError({ code: "ECONNREFUSED" })).toMatch(/Port/);
    expect(describeImapError(new Error("self signed certificate"))).toMatch(/TLS/);
    expect(describeImapError(new Error("boom"))).toBe("Verbindung fehlgeschlagen.");
  });
});
