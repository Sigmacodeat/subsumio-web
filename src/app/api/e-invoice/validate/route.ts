import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { validateEInvoice, validateXmlWellformed } from "@/lib/e-invoice";
import type { EInvoiceData } from "@/lib/e-invoice/types";

export const dynamic = "force-dynamic";

const validateSchema = z.object({
  data: z.custom<EInvoiceData>((v) => typeof v === "object" && v !== null).optional(),
  xml: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "invoice.e_invoice",
    rateTier: "standard",
    body: validateSchema,
    audit: (_ctx, body) => ({
      action: "invoice.e_invoice_validate" as const,
      entityType: "invoice",
      details: {
        target: body.data ? "data" : body.xml ? "xml" : "unknown",
      },
    }),
  },
  async (_ctx, body, _query, _req) => {
    if (body.data) {
      const result = validateEInvoice(body.data);
      return Response.json({ ok: true, ...result });
    }

    if (body.xml) {
      const result = validateXmlWellformed(body.xml);
      return Response.json({ ok: true, ...result });
    }

    return Response.json(
      {
        ok: false,
        error: "no_input",
        message: "Entweder 'data' oder 'xml' muss übergeben werden.",
      },
      { status: 400 }
    );
  }
);
