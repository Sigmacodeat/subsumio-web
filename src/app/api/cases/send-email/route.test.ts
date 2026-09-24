import type { NextRequest } from "next/server";
// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/firm-mail", () => ({
  sendFirmMail: vi.fn(async () => ({ sent: true, via: "resend", trackingId: "track-123" })),
}));

vi.mock("@/lib/mail", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/mail")>();
  return { ...orig, sendMail: vi.fn(async () => ({ sent: true, trackingId: "track-123" })) };
});

vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: vi.fn(async () => ({
    kanzleiName: "Test Kanzlei",
    anwaltName: "Dr. Test",
    emailFrom: "noreply@test.at",
  })),
}));

vi.mock("@/lib/email/tracking", () => ({
  generateTrackingId: vi.fn(() => "track-123"),
  logTrackingEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/verification-policy", () => ({
  assertOutputActionAllowed: vi.fn(async () => undefined),
  VerificationPolicyError: class VerificationPolicyError extends Error {
    decision: { reason: string };
    constructor(reason: string) {
      super(reason);
      this.decision = { reason };
    }
  },
  buildPolicyOutput: vi.fn((title, state, hash, extra) => ({
    title,
    state,
    content_hash: hash,
    ...extra,
  })),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (ctx: unknown, body: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = {
        headers: { Authorization: "Bearer test" },
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
      };
      const raw = await req.json().catch(() => ({}));
      if (opts.body) {
        const parsed = opts.body.safeParse(raw);
        if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
      }
      return handler(ctx, raw);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

import { POST } from "./route";
import { sendFirmMail } from "@/lib/firm-mail";
import { logTrackingEvent } from "@/lib/email/tracking";
import { assertOutputActionAllowed } from "@/lib/verification-policy";

const sendMail = sendFirmMail;

describe("POST /api/cases/send-email", () => {
  beforeEach(() => vi.clearAllMocks());

  test("sends email and logs tracking event", async () => {
    const req = new Request("http://localhost/api/cases/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: "client@example.com",
        subject: "Ihre Akte",
        body: "Sehr geehrter Mandant,\n\nanbei erhalten Sie...",
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sent).toBe(true);
    expect(body.trackingId).toBe("track-123");

    expect(sendMail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        to: "client@example.com",
        subject: "Ihre Akte",
        trackingId: "track-123",
      })
    );
    expect(logTrackingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        trackingId: "track-123",
        eventType: "delivered",
      })
    );
  });

  test("sends email with cc and caseSlug", async () => {
    const req = new Request("http://localhost/api/cases/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: "client@example.com",
        cc: "partner@example.com",
        subject: "Kopie",
        body: "Test",
        caseSlug: "legal/cases/test",
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        to: "client@example.com",
        cc: "partner@example.com",
      })
    );
  });

  test("rejects invalid email address", async () => {
    const req = new Request("http://localhost/api/cases/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: "not-an-email",
        subject: "Test",
        body: "Test",
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("rejects empty subject", async () => {
    const req = new Request("http://localhost/api/cases/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: "client@example.com",
        subject: "",
        body: "Test",
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("rejects empty body", async () => {
    const req = new Request("http://localhost/api/cases/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: "client@example.com",
        subject: "Test",
        body: "",
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("returns 403 when verification policy denies", async () => {
    // Use the mocked VerificationPolicyError class so instanceof check passes
    const { VerificationPolicyError } = await import("@/lib/verification-policy");
    const err = new VerificationPolicyError({
      allowed: false,
      action: "send_client",
      output_id: "out-1",
      state: "NEEDS_HUMAN_REVIEW",
      reason: "content_blocked_by_policy",
    });
    vi.mocked(assertOutputActionAllowed).mockRejectedValueOnce(err);

    const req = new Request("http://localhost/api/cases/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: "client@example.com",
        subject: "Test",
        body: "Test",
        verification: {
          state: "BLOCKED",
          content_hash: "a".repeat(64),
        },
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("verification_denied");
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("allows send when verification policy passes", async () => {
    const req = new Request("http://localhost/api/cases/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: "client@example.com",
        subject: "Test",
        body: "Test",
        verification: {
          state: "VERIFIED",
          content_hash: "a".repeat(64),
        },
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(assertOutputActionAllowed).toHaveBeenCalled();
  });

  test("handles sendMail failure gracefully", async () => {
    vi.mocked(sendMail).mockResolvedValueOnce({
      sent: false,
      error: "SMTP connection refused",
      trackingId: "track-123",
    });

    const req = new Request("http://localhost/api/cases/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: "client@example.com",
        subject: "Test",
        body: "Test",
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.sent).toBe(false);
    expect(body.error).toBe("SMTP connection refused");
    expect(logTrackingEvent).not.toHaveBeenCalled();
  });

  test("escapes HTML in the plain-text body (no injection, no swallowed text)", async () => {
    const req = new Request("http://localhost/api/cases/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: "client@example.com",
        subject: "Kosten",
        body: "Die Kosten liegen < 500 € & es gilt § 1002 ABGB.\n<b>nicht fett</b>",
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const html = vi.mocked(sendMail).mock.calls[0][1].html as string;
    expect(html).toContain("&lt; 500 € &amp;");
    expect(html).toContain("&lt;b&gt;nicht fett&lt;/b&gt;");
    expect(html).not.toContain("<b>nicht fett</b>");
    expect(html).toContain("<br>");
  });

  test("attaches case documents fetched server-side by slug", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 fake");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/files/")) {
        return new Response(pdfBytes, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="Schriftsatz.pdf"',
          },
        });
      }
      return new Response("not found", { status: 404 });
    });

    const req = new Request("http://localhost/api/cases/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: "client@example.com",
        subject: "Anbei",
        body: "Anbei der Schriftsatz.",
        attachment_slugs: ["legal/cases/test/documents/schriftsatz"],
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    fetchSpy.mockRestore();
    expect(res.status).toBe(200);
    const call = vi.mocked(sendMail).mock.calls[0][1];
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments![0].filename).toBe("Schriftsatz.pdf");
    expect(call.attachments![0].contentType).toBe("application/pdf");
  });

  test("fails the send when a selected attachment is unavailable", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("nope", { status: 404 }));

    const req = new Request("http://localhost/api/cases/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: "client@example.com",
        subject: "Anbei",
        body: "Anbei.",
        attachment_slugs: ["legal/cases/test/documents/gone"],
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    fetchSpy.mockRestore();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("attachment_unavailable");
    expect(sendMail).not.toHaveBeenCalled();
  });
});
