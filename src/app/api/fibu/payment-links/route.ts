import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

const createLinkSchema = z.object({
  invoice_id: z.string().min(1).max(200),
  invoice_number: z.string().min(1).max(100),
  amount: z.number().min(0.01),
  client_name: z.string().min(1).max(300),
  client_email: z.string().email().optional(),
  case_slug: z.string().max(300).optional(),
  iban: z.string().min(15).max(34),
  bic: z.string().max(12).optional(),
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
    audit: (ctx, body) => ({
      action: "case.update" as const,
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
    const remittanceText = body.remittance_text ?? `Rechnung ${body.invoice_number}`;
    const recipientName = "Kanzlei";

    const epcPayload = generateEpcQrPayload({
      iban: body.iban,
      amount: body.amount,
      remittanceText,
      recipientName,
    });

    const linkId = `plink-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug = `legal/payment-links/${linkId}`;

    const paymentLink = {
      id: linkId,
      invoice_id: body.invoice_id,
      invoice_number: body.invoice_number,
      amount: body.amount,
      client_name: body.client_name,
      client_email: body.client_email,
      case_slug: body.case_slug,
      iban: body.iban,
      bic: body.bic,
      remittance_text: remittanceText,
      epc_qr_payload: epcPayload,
      status: "active",
      created_at: new Date().toISOString(),
      expires_at: body.due_date
        ? new Date(new Date(body.due_date).getTime() + 30 * 86400000).toISOString()
        : undefined,
    };

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: `Zahlungslink: ${body.invoice_number} — ${body.client_name}`,
        type: "payment_link",
        frontmatter: paymentLink,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({
      ok: true,
      link_id: linkId,
      epc_qr_payload: epcPayload,
      payment_link: paymentLink,
    });
  }
);
