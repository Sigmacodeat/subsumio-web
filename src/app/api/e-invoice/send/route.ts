import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import {
  generateEbInterfaceXml,
  generateXRechnungXml,
  invoiceToEInvoiceData,
} from "@/lib/e-invoice";
import { sendEInvoice, pollEInvoiceStatus, transportAvailability } from "@/lib/e-invoice/transport";
import type { InvoiceFrontmatter } from "@/lib/legal-types";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { createServerBrainClient } from "@/lib/server-brain";
import { invoiceIssueProblem } from "@/lib/invoice-issue";
import { createOpenItemForInvoice } from "@/lib/open-items";
import { rejectionResponse } from "@/lib/page-write-guards";

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
  invoiceSlug: z.string().min(1).max(300),
});

/**
 * WP-8.47: e-Rechnung-Versand. Erzeugt die XML serverseitig aus der
 * GESPEICHERTEN Rechnung und den GESPEICHERTEN Kanzlei-Settings — der Client
 * liefert nur den Slug. Belegdaten (insb. IBAN des Empfängerkontos) dürfen
 * nicht aus dem Request-Body kommen: ein manipulierter Client könnte sonst
 * eine Rechnung mit fremdem Konto unter der Kanzlei-Identität versenden
 * (Zahlungsumleitung / Integrität der Herkunft, EN 16931).
 */
export const POST = createHandler(
  {
    action: "invoice.e_invoice",
    rateTier: "standard",
    body: sendSchema,
    audit: (_ctx, body) => ({
      action: "invoice.send" as const,
      entityType: "invoice",
      entityId: body.invoiceSlug,
      details: {
        channel: body.channel,
        format: body.format,
      },
    }),
  },
  async (ctx, body) => {
    try {
      const brain = createServerBrainClient(ctx.headers);
      const page = await brain.getPage(body.invoiceSlug).catch(() => null);
      if (!page) return apiError("not_found", "Rechnung nicht gefunden", 404);
      const invoice = page.frontmatter as InvoiceFrontmatter;
      if (!invoice.invoice_number) {
        return apiError("not_an_invoice", "Seite ist keine Rechnung", 400);
      }
      const status = String(invoice.status ?? "draft");
      if (status === "cancelled" || status === "tombstoned") {
        return apiError("invoice_not_sendable", "Diese Rechnung kann nicht versendet werden.", 409);
      }
      // Delivering a draft issues it (§ 132 BAO: from then on unchangeable):
      // only a complete draft with consistent sums goes out.
      const isDraft = status === "draft";
      if (isDraft) {
        const problem = invoiceIssueProblem(page.frontmatter as Record<string, unknown>);
        if (problem) return rejectionResponse(problem);
      }
      const settings = await loadKanzleiSettingsForBrain(ctx.brainId);

      const data = invoiceToEInvoiceData(invoice, settings, {
        leitwegId: body.receiver_id,
      });
      const xml =
        body.format === "ebinterface" ? generateEbInterfaceXml(data) : generateXRechnungXml(data);

      const result = await sendEInvoice(body.channel, xml.xml, {
        invoiceNumber: invoice.invoice_number ?? "",
        format: body.format,
        receiverId: body.receiver_id,
      });

      if (result.status === "failed") {
        return apiError("transport_failed", result.message, 502);
      }
      // Handed to the access point: the draft is now issued — status "sent",
      // delivery reference and an open item, exactly like the e-mail path.
      let issued = false;
      if (isDraft && (result.status === "queued" || result.status === "delivered")) {
        await brain.updatePage({
          slug: body.invoiceSlug,
          frontmatter: {
            status: "sent",
            sent_at: new Date().toISOString(),
            e_invoice_channel: result.channel,
            e_invoice_reference: result.reference,
            e_invoice_status: result.status,
          },
        });
        issued = true;
        try {
          await createOpenItemForInvoice(
            ctx.headers,
            body.invoiceSlug,
            page.frontmatter as Record<string, unknown>
          );
        } catch {
          // The invoice is issued; a missing open item is repaired by the
          // next status change and must not undo the delivery.
        }
      }
      return apiSuccess({
        issued,
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
