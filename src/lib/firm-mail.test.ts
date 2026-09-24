import { describe, test, expect, vi, beforeEach } from "vitest";

const sendMailMock = vi.fn(async (_input?: unknown) => ({ sent: true, trackingId: "t-1" }));
const nodemailerSend = vi.fn(async (_opts?: unknown) => ({ messageId: "m-1" }));
const createTransportMock = vi.fn((_opts?: unknown) => ({ sendMail: nodemailerSend }));

vi.mock("@/lib/mail", () => ({
  sendMail: (input: unknown) => sendMailMock(input),
  escapeHtml: (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;"),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: (opts: unknown) => createTransportMock(opts) },
  createTransport: (opts: unknown) => createTransportMock(opts),
}));

vi.mock("@/lib/email/tracking", () => ({
  injectTracking: (html: string, id: string) => `${html}<!--tracked:${id}-->`,
}));

import { sendFirmMail } from "./firm-mail";

const smtpSettings = {
  smtpHost: "smtp.kanzlei.at",
  smtpPort: "587",
  smtpUser: "kanzlei@kanzlei.at",
  smtpPassword: "secret",
  emailFrom: "kanzlei@kanzlei.at",
};

describe("sendFirmMail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nodemailerSend.mockResolvedValue({ messageId: "m-1" });
  });

  test("uses the firm's SMTP when configured — with attachments", async () => {
    const res = await sendFirmMail(smtpSettings, {
      to: "mandant@example.com",
      subject: "Ihre Akte",
      html: "<p>Text</p>",
      trackingId: "t-1",
      attachments: [
        {
          filename: "Schriftsatz.pdf",
          content: Buffer.from("%PDF"),
          contentType: "application/pdf",
        },
      ],
    });
    expect(res.sent).toBe(true);
    expect(res.via).toBe("smtp");
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.kanzlei.at", port: 587 })
    );
    expect(nodemailerSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "kanzlei@kanzlei.at",
        to: "mandant@example.com",
        html: expect.stringContaining("tracked:t-1"),
        attachments: [expect.objectContaining({ filename: "Schriftsatz.pdf" })],
      })
    );
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  test("falls back to Resend when the firm SMTP throws", async () => {
    nodemailerSend.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await sendFirmMail(smtpSettings, {
      to: "mandant@example.com",
      subject: "s",
      html: "<p>x</p>",
      trackingId: "t-1",
    });
    expect(res.via).toBe("resend");
    expect(res.sent).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  test("uses Resend directly when SMTP is not configured", async () => {
    const res = await sendFirmMail(
      { kanzleiName: "Kanzlei" },
      { to: "m@x.at", subject: "s", html: "<p>x</p>" }
    );
    expect(res.via).toBe("resend");
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  test("null settings → Resend", async () => {
    const res = await sendFirmMail(null, { to: "m@x.at", subject: "s", text: "x" });
    expect(res.via).toBe("resend");
    expect(sendMailMock).toHaveBeenCalled();
  });
});
