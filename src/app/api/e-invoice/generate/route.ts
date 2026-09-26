import { z } from "zod";
import { apiError, createHandler } from "@/lib/api-handler";
import {
  generateEbInterfaceXml,
  generateXRechnungXml,
  generateZugferdPdf,
  generateZugferdPdfFromScratch,
  validateEInvoice,
  invoiceToEInvoiceData,
} from "@/lib/e-invoice";
import type { InvoiceFrontmatter } from "@/lib/legal-types";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { createServerBrainClient } from "@/lib/server-brain";

export const dynamic = "force-dynamic";

const generateSchema = z.object({
  format: z.enum(["ebinterface", "xrechnung", "zugferd", "zugferd_scratch"]).default("xrechnung"),
  /**
   * The STORED invoice. Invoice data and firm settings (incl. the IBAN) are
   * loaded server-side, never taken from the request: the file must match
   * the booked invoice and must not carry a foreign account.
   */
  invoiceSlug: z.string().min(1).max(300),
  options: z
    .object({
      leitwegId: z.string().max(200).optional(),
      buyerReference: z.string().max(200).optional(),
      buyerAddress: z
        .object({
          name: z.string().max(300),
          street: z.string().max(300).optional(),
          zip: z.string().max(20),
          city: z.string().max(200),
          country: z.string().max(10),
          vatId: z.string().max(50).optional(),
          email: z.string().max(320).optional(),
        })
        .optional(),
      pdfBytes: z.array(z.number()).optional(),
    })
    .optional(),
});

export const POST = createHandler(
  {
    action: "invoice.e_invoice",
    rateTier: "standard",
    body: generateSchema,
    audit: (_ctx, body) => ({
      action: "invoice.e_invoice_generate" as const,
      entityType: "invoice",
      entityId: body.invoiceSlug,
      details: { format: body.format },
    }),
  },
  async (ctx, body, _query, _req) => {
    const { format, options } = body;
    const brain = createServerBrainClient(ctx.headers);
    const page = await brain.getPage(body.invoiceSlug).catch(() => null);
    if (!page) return apiError("not_found", "Rechnung nicht gefunden", 404);
    const invoice = page.frontmatter as InvoiceFrontmatter;
    if (!invoice?.invoice_number)
      return apiError("not_an_invoice", "Seite ist keine Rechnung", 400);
    const settings = await loadKanzleiSettingsForBrain(ctx.brainId);

    // Convert invoice to EInvoiceData
    const eInvoiceData = invoiceToEInvoiceData(invoice, settings, options);

    // Validate before generating
    const validation = validateEInvoice(eInvoiceData);
    if (!validation.valid) {
      return Response.json(
        {
          ok: false,
          error: "validation_failed",
          validation,
        },
        { status: 400 }
      );
    }

    if (format === "ebinterface") {
      const result = generateEbInterfaceXml(eInvoiceData);
      return Response.json({
        ok: true,
        format: "ebinterface",
        filename: result.filename,
        xml: result.xml,
        profile: result.profile,
        validation,
      });
    }

    if (format === "xrechnung") {
      const result = generateXRechnungXml(eInvoiceData, "xrechnung");
      return Response.json({
        ok: true,
        format: "xrechnung",
        filename: result.filename,
        xml: result.xml,
        profile: result.profile,
        validation,
      });
    }

    if (format === "zugferd") {
      if (!options?.pdfBytes?.length) {
        return Response.json(
          {
            ok: false,
            error: "pdf_bytes_required",
            message:
              "Für ZUGFeRD werden bestehende PDF-Bytes benötigt (format=zugferd mit options.pdfBytes). Alternativ format=zugferd_scratch verwenden.",
          },
          { status: 400 }
        );
      }
      const pdfBytes = new Uint8Array(options.pdfBytes);
      const result = await generateZugferdPdf(eInvoiceData, pdfBytes);
      return new Response(
        new Blob([result.pdf.buffer as ArrayBuffer], { type: "application/pdf" }),
        {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${result.filename}"`,
          },
        }
      );
    }

    // zugferd_scratch
    const result = await generateZugferdPdfFromScratch(eInvoiceData);
    return new Response(new Blob([result.pdf.buffer as ArrayBuffer], { type: "application/pdf" }), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  }
);
