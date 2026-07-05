import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import {
  generateXRechnungXml,
  generateZugferdPdf,
  generateZugferdPdfFromScratch,
  validateEInvoice,
  invoiceToEInvoiceData,
} from "@/lib/e-invoice";
import type { InvoiceFrontmatter } from "@/lib/legal-types";
import type { KanzleiSettings } from "@/lib/kanzlei-settings";

export const dynamic = "force-dynamic";

const generateSchema = z.object({
  format: z.enum(["xrechnung", "zugferd", "zugferd_scratch"]).default("xrechnung"),
  invoice: z.custom<InvoiceFrontmatter>((v) => typeof v === "object" && v !== null),
  settings: z.custom<KanzleiSettings>((v) => typeof v === "object" && v !== null),
  options: z
    .object({
      leitwegId: z.string().optional(),
      buyerReference: z.string().optional(),
      buyerAddress: z
        .object({
          name: z.string(),
          street: z.string().optional(),
          zip: z.string(),
          city: z.string(),
          country: z.string(),
          vatId: z.string().optional(),
          email: z.string().optional(),
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
      details: {
        format: body.format,
        invoiceNumber: body.invoice.invoice_number,
      },
    }),
  },
  async (_ctx, body, _query, _req) => {
    const { format, invoice, settings, options } = body;

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
