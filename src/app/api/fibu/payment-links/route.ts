import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { GUARD_READ_FAILED, readCurrentPage, rejectionResponse } from "@/lib/page-write-guards";
import { findOpenItemForInvoice } from "@/lib/open-items";
import { isValidIban, normalizeIban } from "@/lib/iban";
import { roundEur, toCents } from "@/lib/invoice-totals";

export const dynamic = "force-dynamic";

const createLinkSchema = z.object({
  invoice_id: z.string().min(1).max(200),
  /** Informative only — the number is read from the stored invoice. */
  invoice_number: z.string().max(100).optional(),
  /** Optional: the open amount of the invoice is used; a different amount is refused. */
  amount: z.number().min(0.01).optional(),
  client_name: z.string().min(1).max(300).optional(),
  client_email: z.string().email().optional(),
  case_slug: z.string().max(300).optional(),
  /** Optional: defaults to the firm's IBAN from the Kanzlei-Einstellungen. */
  iban: z.string().max(42).optional(),
  bic: z.string().max(12).optional(),
  recipient_name: z.string().min(1).max(70).optional(),
  remittance_text: z.string().max(140).optional(),
  due_date: z.string().optional(),
});

function generateEpcQrPayload(input: {
  iban: string;
  bic?: string;
  amount: number;
  remittanceText: string;
  recipientName: string;
}): string {
  const amountStr = `EUR${input.amount.toFixed(2)}`;
  const lines = [
    "BCD",
    "002",
    "1",
    "SCT",
    input.bic ?? "",
    input.recipientName,
    input.iban,
    amountStr,
    "",
    "",
    input.remittanceText,
    "",
  ];
  return lines.join("\n");
}

export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: createLinkSchema,
    audit: (_ctx, body) => ({
      action: "fibu.payment_link_create" as const,
      entityType: "payment_link",
      entityId: body.invoice_id,
      details: {
        invoiceNumber: body.invoice_number,
        amount: body.amount,
        clientName: body.client_name,
      },
    }),
  },
  async (ctx, body) => {
    // The link belongs to a stored, issued invoice — number, client and
    // amount come from there, not from the form.
    const invoiceRead = await readCurrentPage(ENGINE_URL, ctx.headers, body.invoice_id);
    if (invoiceRead.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
    if (invoiceRead.kind === "missing") {
      return apiError("invoice_not_found", "Rechnung nicht gefunden", 404);
    }
    const fm = (invoiceRead.page.frontmatter ?? {}) as Record<string, unknown>;
    const status = String(fm.status ?? "draft");
    if (status !== "sent" && status !== "overdue") {
      return apiError(
        "invoice_not_open",
        status === "paid"
          ? "Die Rechnung ist bereits bezahlt."
          : "Ein Zahlungslink ist nur für versendete, offene Rechnungen möglich.",
        409
      );
    }
    const invoiceNumber = String(fm.invoice_number ?? body.invoice_number ?? "");

    // Amount = what is still open on the receivable (incl. dunning fees,
    // minus partial payments). Without an open item: the invoice total.
    let openItem;
    try {
      openItem = await findOpenItemForInvoice(ctx.headers, body.invoice_id);
    } catch {
      return rejectionResponse(GUARD_READ_FAILED);
    }
    if (openItem && (openItem.status === "paid" || openItem.status === "written_off")) {
      return apiError("invoice_not_open", "Für diese Rechnung ist nichts mehr offen.", 409);
    }
    const openAmount = roundEur(openItem ? openItem.open_amount : Number(fm.total ?? 0));
    if (!(openAmount > 0)) {
      return apiError("invoice_not_open", "Für diese Rechnung ist nichts mehr offen.", 409);
    }
    if (body.amount !== undefined && toCents(body.amount) !== toCents(openAmount)) {
      return apiError(
        "amount_mismatch",
        `Der Betrag weicht vom offenen Betrag der Rechnung (${openAmount.toFixed(2)} €) ab.`,
        422
      );
    }

    const settings = await loadKanzleiSettingsForBrain(ctx.brainId).catch(() => null);
    const iban = normalizeIban(body.iban?.trim() || settings?.iban || "");
    if (!iban) {
      return apiError(
        "iban_missing",
        "Keine IBAN angegeben und in den Kanzlei-Einstellungen keine hinterlegt.",
        400
      );
    }
    if (!isValidIban(iban)) {
      return apiError("iban_invalid", "Die IBAN ist ungültig (Prüfziffer stimmt nicht).", 400);
    }
    const bic = (body.bic?.trim() || (body.iban ? "" : settings?.bic) || "")
      .replace(/\s+/g, "")
      .toUpperCase();

    const remittanceText = body.remittance_text ?? `Rechnung ${invoiceNumber}`;
    const recipientName = (body.recipient_name ?? settings?.kanzleiName ?? "Kanzlei").slice(0, 70);
    const clientName = String(fm.client ?? body.client_name ?? "");

    const epcPayload = generateEpcQrPayload({
      iban,
      bic: bic || undefined,
      amount: openAmount,
      remittanceText,
      recipientName,
    });

    const linkId = `plink-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug = `legal/payment-links/${linkId}`;
    const caseSlugs = Array.isArray(fm.case_slugs) ? (fm.case_slugs as unknown[]) : [];

    const paymentLink = {
      id: linkId,
      invoice_id: body.invoice_id,
      invoice_number: invoiceNumber,
      amount: openAmount,
      client_name: clientName,
      client_email: body.client_email,
      case_slug: body.case_slug ?? (caseSlugs.length > 0 ? String(caseSlugs[0]) : undefined),
      iban,
      bic: bic || undefined,
      remittance_text: remittanceText,
      epc_qr_payload: epcPayload,
      status: "active",
      created_at: new Date().toISOString(),
      expires_at: body.due_date
        ? new Date(new Date(body.due_date).getTime() + 30 * 86400000).toISOString()
        : undefined,
    };

    // Fehlschlag der Persistenz darf nicht als Erfolg gemeldet werden — der
    // Link existiert sonst in keiner Liste (Fehlbuchung im Zahlungsverkehr).
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: `Zahlungslink: ${invoiceNumber} — ${clientName}`,
        type: "payment_link",
        frontmatter: paymentLink,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return apiError("persist_failed", "Zahlungslink konnte nicht gespeichert werden", 502);
    }

    return apiSuccess({
      ok: true,
      link_id: linkId,
      epc_qr_payload: epcPayload,
      payment_link: paymentLink,
    });
  }
);
