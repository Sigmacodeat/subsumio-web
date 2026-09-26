/**
 * Browser side of POST /api/e-invoice/send.
 *
 * The route refuses a second submission of an invoice that already carries
 * a delivery reference (409 `already_submitted`). Re-submitting is a
 * deliberate act: the user is asked, and only on an explicit yes the same
 * request goes out again with `resend: true`.
 */

export interface EInvoiceSendRequest {
  channel: "peppol" | "erechnung_gv_at";
  format: "ebinterface" | "xrechnung";
  receiver_id?: string;
  invoiceSlug: string;
}

export type EInvoiceSendResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; code?: string; error?: string };

export const ALREADY_SUBMITTED_CODE = "already_submitted";

export async function sendEInvoiceWithResendConfirm(
  request: EInvoiceSendRequest,
  deps: {
    post: (body: string) => Promise<Response>;
    /** Asked once when the invoice was submitted before; true = send again. */
    confirmResend: () => Promise<boolean>;
  }
): Promise<EInvoiceSendResult> {
  const send = async (resend: boolean) => {
    const res = await deps.post(JSON.stringify(resend ? { ...request, resend: true } : request));
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, data };
  };

  let { res, data } = await send(false);
  if (res.status === 409 && data.code === ALREADY_SUBMITTED_CODE) {
    if (!(await deps.confirmResend())) return { ok: false, cancelled: true };
    ({ res, data } = await send(true));
  }
  if (!res.ok) {
    return {
      ok: false,
      code: typeof data.code === "string" ? data.code : undefined,
      error: typeof data.error === "string" ? data.error : undefined,
    };
  }
  return { ok: true, data: (data.data ?? data) as Record<string, unknown> };
}
