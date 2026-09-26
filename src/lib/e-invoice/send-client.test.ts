import { describe, expect, it, vi } from "vitest";
import { sendEInvoiceWithResendConfirm, type EInvoiceSendRequest } from "./send-client";

const request: EInvoiceSendRequest = {
  channel: "erechnung_gv_at",
  format: "ebinterface",
  invoiceSlug: "legal/invoices/re-1",
};

const alreadySubmitted = () =>
  Response.json(
    { error: "Diese Rechnung wurde bereits eingereicht.", code: "already_submitted" },
    { status: 409 }
  );

describe("sendEInvoiceWithResendConfirm (R8-15)", () => {
  it("409 already_submitted → asks, and on yes re-sends with resend:true", async () => {
    const post = vi
      .fn<(body: string) => Promise<Response>>()
      .mockResolvedValueOnce(alreadySubmitted())
      .mockResolvedValueOnce(Response.json({ data: { status: "queued", reference: "R-2" } }));
    const confirmResend = vi.fn(async () => true);
    const out = await sendEInvoiceWithResendConfirm(request, { post, confirmResend });
    expect(confirmResend).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(JSON.parse(post.mock.calls[0][0]).resend).toBeUndefined();
    expect(JSON.parse(post.mock.calls[1][0])).toMatchObject({ ...request, resend: true });
    expect(out).toEqual({ ok: true, data: { status: "queued", reference: "R-2" } });
  });

  it("409 already_submitted and the user declines → nothing is sent again", async () => {
    const post = vi.fn<(body: string) => Promise<Response>>().mockResolvedValue(alreadySubmitted());
    const out = await sendEInvoiceWithResendConfirm(request, {
      post,
      confirmResend: async () => false,
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ ok: false, cancelled: true });
  });

  it("any other 409 is an error without a resend question", async () => {
    const post = vi
      .fn<(body: string) => Promise<Response>>()
      .mockResolvedValue(
        Response.json({ error: "läuft", code: "send_in_progress" }, { status: 409 })
      );
    const confirmResend = vi.fn(async () => true);
    const out = await sendEInvoiceWithResendConfirm(request, { post, confirmResend });
    expect(confirmResend).not.toHaveBeenCalled();
    expect(out).toEqual({ ok: false, code: "send_in_progress", error: "läuft" });
  });

  it("first send succeeds → no question", async () => {
    const post = vi
      .fn<(body: string) => Promise<Response>>()
      .mockResolvedValue(Response.json({ data: { status: "queued" } }));
    const confirmResend = vi.fn(async () => true);
    const out = await sendEInvoiceWithResendConfirm(request, { post, confirmResend });
    expect(confirmResend).not.toHaveBeenCalled();
    expect(out.ok).toBe(true);
  });
});
