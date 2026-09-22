import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import {
  generateEbInterfaceXml,
  generateXRechnungXml,
  invoiceToEInvoiceData,
} from "@/lib/e-invoice";
import { sendEInvoice, pollEInvoiceStatus, transportAvailability } from "@/lib/e-invoice/transport";
import type { InvoiceFrontmatter } from "@/lib/legal-types";
import type { KanzleiSettings } from "@/lib/kanzlei-settings";

export const dynamic = "force-dynamic";

const pollSchema = z.object({
  channel: z.enum(["peppol", "erechnung_gv_at"]),
  reference: z.string().min(1).max(300),
});

/**
 * Zustellstatus-Poll: GET /api/e-invoice/send?channel=…&reference=…
 * fragt den Transport nach dem aktuellen Status einer eingereichten
 * e-Rechnung (queued → delivered/failed).
 */
export const GET = createHandler(
  { action: "invoice.e_invoice", rateTier: "standard", query: pollSchema },
  async (_ctx, _body, query) => {
    const result = await pollEInvoiceStatus(query.channel, query.reference);
    if (result.status === "failed") {
      return apiError("status_failed", result.message, 502);
    }
    return apiSuccess({
      status: result.status,
      channel: result.channel,
      reference: result.reference,
      message: result.message,
    });
  }
);

const sendSchema = z.object({
  channel: z.enum(["peppol", "erechnung_gv_at"]),
  format: z.enum(["ebinterface", "xrechnung"]),
  receiver_id: z.string().max(200).optional(),
  invoice: z.custom<InvoiceFrontmatter>((v) => typeof v === "object" && v !== null),
  settings: z.custom<KanzleiSettings>((v) => typeof v === "object" && v !== null),
});

/**
 * WP-8.47: e-Rechnung-Versand. Erzeugt die XML serverseitig und reicht sie
 * an den konfigurierten Transport (PEPPOL-AP / e-Rechnung.gv.at). Ohne
 * ENV-Konfiguration ehrlich `not_configured` — nie simuliert.
 */
export const POST = createHandler(
  {
    action: "invoice.e_invoice",
    rateTier: "standard",
    body: sendSchema,
    audit: (_ctx, body) => ({
      action: "invoice.send" as const,
      entityType: "invoice",
      details: {
        channel: body.channel,
        format: body.format,
        invoiceNumber: body.invoice.invoice_number,
      },
    }),
  },
  async (_ctx, body) => {
    try {
      const data = invoiceToEInvoiceData(body.invoice, body.settings, {
        leitwegId: body.receiver_id,
      });
      const xml =
        body.format === "ebinterface" ? generateEbInterfaceXml(data) : generateXRechnungXml(data);

      const result = await sendEInvoice(body.channel, xml.xml, {
        invoiceNumber: body.invoice.invoice_number ?? "",
        format: body.format,
        receiverId: body.receiver_id,
      });

      if (result.status === "failed") {
        return apiError("transport_failed", result.message, 502);
      }
      return apiSuccess({
        status: result.status,
        channel: result.channel,
        reference: result.reference,
        message: result.message,
        configured: transportAvailability(),
      });
    } catch (err) {
      return apiError(
        "send_failed",
        err instanceof Error ? err.message : "Versand fehlgeschlagen",
        500
      );
    }
  }
);
