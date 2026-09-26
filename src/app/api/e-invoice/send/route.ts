import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import {
  generateEbInterfaceXml,
  generateXRechnungXml,
  invoiceToEInvoiceData,
  validateEInvoice,
} from "@/lib/e-invoice";
import { ENGINE_URL } from "@/lib/engine";
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
  /** Explicit re-submission of an invoice that already has a delivery reference. */
  resend: z.boolean().optional(),
});

/**
 * Create-only lock for one submission attempt of an invoice: of two
 * concurrent sends only one reaches the transport.
 */
async function claimSendLock(
  headers: Record<string, string>,
  invoiceSlug: string,
  attempt: number,
  actor: string
): Promise<"claimed" | "taken"> {
  const key = invoiceSlug.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 200);
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: `e-invoice-locks/${key}/send-${attempt}`,
      title: `e-Rechnung Versand ${key} #${attempt}`,
      type: "e_invoice_lock",
      content: "",
      frontmatter: { invoice_slug: invoiceSlug, attempt, claimed_by: actor },
      if_absent: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return "claimed";
  const upstream = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (res.status === 409 && upstream?.error === "page_exists") return "taken";
  throw new Error(`send_lock_failed:${res.status}`);
}

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
    // Übermitteln stellt/versendet die Rechnung: nur Anwalt/Admin.
    action: "invoice.issue",
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
      // Submitted once already: a second submission only on explicit request.
      const fm = page.frontmatter as Record<string, unknown>;
      if (typeof fm.e_invoice_reference === "string" && fm.e_invoice_reference && !body.resend) {
        return apiError(
          "already_submitted",
          "Diese Rechnung wurde bereits als e-Rechnung eingereicht. Erneut senden nur nach ausdrücklicher Bestätigung.",
          409
        );
      }
      const settings = await loadKanzleiSettingsForBrain(ctx.brainId);

      const data = invoiceToEInvoiceData(invoice, settings, {
        leitwegId: body.receiver_id,
      });
      // Mandatory fields first — an incomplete e-invoice never reaches the transport.
      const validation = validateEInvoice(data);
      if (!validation.valid) {
        return Response.json(
          {
            error: "validation_failed",
            message: "Die e-Rechnung ist unvollständig und wurde nicht versendet.",
            validation,
          },
          { status: 400 }
        );
      }
      const xml =
        body.format === "ebinterface" ? generateEbInterfaceXml(data) : generateXRechnungXml(data);

      const attempt = Number(fm.e_invoice_attempt ?? 0);
      let lock: "claimed" | "taken";
      try {
        lock = await claimSendLock(ctx.headers, body.invoiceSlug, attempt, ctx.user.email);
      } catch {
        return apiError("send_lock_failed", "Versand konnte nicht gestartet werden.", 503);
      }
      if (lock === "taken") {
        return apiError("send_in_progress", "Diese Rechnung wird gerade versendet.", 409);
      }

      const result = await sendEInvoice(body.channel, xml.xml, {
        invoiceNumber: invoice.invoice_number ?? "",
        format: body.format,
        receiverId: body.receiver_id,
      });

      if (result.status === "failed") {
        await brain
          .updatePage({ slug: body.invoiceSlug, frontmatter: { e_invoice_attempt: attempt + 1 } })
          .catch(() => null);
        return apiError("transport_failed", result.message, 502);
      }
      // Handed to the access point: record the delivery reference (a second
      // submission then needs `resend`). A draft is now issued — status
      // "sent" and an open item, exactly like the e-mail path.
      let issued = false;
      const submitted = result.status === "queued" || result.status === "delivered";
      const deliveryFields = {
        e_invoice_attempt: attempt + 1,
        ...(submitted
          ? {
              e_invoice_channel: result.channel,
              e_invoice_reference: result.reference,
              e_invoice_status: result.status,
            }
          : {}),
      };
      if (!(isDraft && submitted)) {
        await brain.updatePage({ slug: body.invoiceSlug, frontmatter: deliveryFields });
      }
      if (isDraft && submitted) {
        await brain.updatePage({
          slug: body.invoiceSlug,
          frontmatter: {
            status: "sent",
            sent_at: new Date().toISOString(),
            ...deliveryFields,
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
