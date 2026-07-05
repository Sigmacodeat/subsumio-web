import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { parseXRechnungXml, extractZugferdXml, validateXmlWellformed } from "@/lib/e-invoice";

export const dynamic = "force-dynamic";

const parseSchema = z.object({
  xml: z.string().optional(),
  pdfBase64: z.string().optional(),
});

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const POST = createHandler(
  {
    action: "invoice.e_invoice",
    rateTier: "standard",
    body: parseSchema,
    audit: (_ctx, body) => ({
      action: "invoice.e_invoice_parse" as const,
      entityType: "invoice",
      details: {
        source: body.xml ? "xml" : body.pdfBase64 ? "pdf" : "unknown",
      },
    }),
  },
  async (_ctx, body, _query, _req) => {
    let xml: string | null = null;

    if (body.xml) {
      xml = body.xml;
    } else if (body.pdfBase64) {
      const pdfBytes = base64ToUint8Array(body.pdfBase64);
      xml = await extractZugferdXml(pdfBytes);
      if (!xml) {
        return Response.json(
          {
            ok: false,
            error: "no_embedded_xml",
            message: "Keine eingebettete XML in der PDF gefunden.",
          },
          { status: 400 }
        );
      }
    } else {
      return Response.json(
        {
          ok: false,
          error: "no_input",
          message: "Entweder 'xml' oder 'pdfBase64' muss übergeben werden.",
        },
        { status: 400 }
      );
    }

    // Validate XML well-formedness
    const xmlValidation = validateXmlWellformed(xml);
    if (!xmlValidation.valid) {
      return Response.json(
        {
          ok: false,
          error: "xml_not_wellformed",
          validation: xmlValidation,
        },
        { status: 400 }
      );
    }

    // Parse the XML
    const parsed = parseXRechnungXml(xml);

    return Response.json({
      ok: true,
      parsed,
      xml,
    });
  }
);
