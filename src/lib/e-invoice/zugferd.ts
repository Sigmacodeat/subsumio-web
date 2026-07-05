/**
 * ZUGFeRD PDF/A-3 Embedding
 * =========================
 *
 * Embeds XRechnung XML into a PDF/A-3 file as an Associated File (AF).
 * Uses pdf-lib for PDF manipulation and file attachment.
 *
 * ZUGFeRD 2.1 / Factur-X specification:
 * - XML file name: factur-x.xml
 * - AF relationship: Alternative
 * - PDF/A-3 conformance level A or B
 */

import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFArray,
  PDFDict,
  StandardFonts,
  AFRelationship,
} from "pdf-lib";

import type { EInvoiceData, ZUGFeRDResult } from "./types";
import { generateXRechnungXml } from "./xrechnung";

/**
 * Embed XRechnung XML into an existing PDF as a ZUGFeRD PDF/A-3 file.
 *
 * @param data - E-invoice data
 * @param pdfBytes - Visual PDF bytes (from jsPDF or other source)
 * @returns ZUGFeRD PDF with embedded XML
 */
export async function generateZugferdPdf(
  data: EInvoiceData,
  pdfBytes: Uint8Array
): Promise<ZUGFeRDResult> {
  const { xml } = generateXRechnungXml(data, "zugferd");

  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Attach the XML as an embedded file
  const xmlBytes = strToUint8Array(xml);
  await pdfDoc.attach(xmlBytes, "factur-x.xml", {
    mimeType: "application/xml",
    description: "Factur-X/ZUGFeRD XML invoice",
    creationDate: new Date(),
    modificationDate: new Date(),
    afRelationship: AFRelationship.Alternative,
  });

  // Set document metadata
  pdfDoc.setTitle(`Rechnung ${data.invoiceNumber}`);
  pdfDoc.setSubject("ZUGFeRD Rechnung");
  pdfDoc.setProducer("Subsumio E-Invoicing");
  pdfDoc.setCreator("Subsumio");
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setModificationDate(new Date());

  // Mark as PDF/A-3 by adding the necessary metadata
  // Note: Full PDF/A-3 conformance requires XMP metadata with the PDF/A-3 schema.
  // pdf-lib doesn't natively support XMP, but the embedded file and AF relationship
  // are the critical parts for machine-readable e-invoicing.
  markPdfA3(pdfDoc);

  const result = await pdfDoc.save({ useObjectStreams: false });

  return {
    pdf: result,
    filename: `zugferd_${data.invoiceNumber}.pdf`,
    profile: data.profile,
  };
}

/**
 * Add PDF/A-3 conformance marker to the PDF catalog.
 * This adds the necessary AF (Associated File) relationship.
 */
function markPdfA3(pdfDoc: PDFDocument): void {
  const catalog = pdfDoc.catalog;
  const context = pdfDoc.context;

  // Get the Names dictionary (might be a PDFRef that needs dereferencing)
  let names = catalog.get(PDFName.of("Names"));
  if (names) {
    names = context.lookup(names);
  }
  if (!names || !(names instanceof PDFDict)) {
    names = context.obj({});
    catalog.set(PDFName.of("Names"), names);
  }

  // Get EmbeddedFiles from Names (might also be a PDFRef)
  let embeddedFiles = (names as PDFDict).get(PDFName.of("EmbeddedFiles"));
  if (embeddedFiles) {
    embeddedFiles = context.lookup(embeddedFiles);
  }

  if (embeddedFiles && embeddedFiles instanceof PDFArray) {
    // Create AF array in catalog
    const afArray = PDFArray.withContext(context);
    // The Names array has pairs of [name, ref]
    for (let i = 0; i < embeddedFiles.size(); i += 2) {
      const fileRef = embeddedFiles.get(i + 1);
      if (fileRef) {
        afArray.push(fileRef);
      }
    }
    if (afArray.size() > 0) {
      catalog.set(PDFName.of("AF"), afArray);
    }
  }

  // Add PDF/A-3 conformance level to the catalog
  // MarkOutputIntents is typically required for PDF/A
  // For practical compatibility, we set the version marker
  const version = PDFString.of("2.0");
  catalog.set(PDFName.of("Version"), version);
}

/**
 * Convert string to Uint8Array (works in both Node.js and browser environments).
 */
function strToUint8Array(str: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(str, "utf-8"));
  }
  return new TextEncoder().encode(str);
}

/**
 * Decompress FlateDecode (zlib) compressed data.
 * Uses Node.js zlib in server environments.
 */
function decompress(data: Uint8Array): Uint8Array {
  try {
    // Dynamic require for zlib — works in Node.js/vitest, ignored by browser bundlers
    const g = globalThis as Record<string, unknown>;
    const zlib = (g.__zlib ?? (g.__zlib = eval("require")("zlib"))) as {
      inflateSync: (data: Buffer) => Uint8Array;
    };
    return new Uint8Array(zlib.inflateSync(Buffer.from(data)));
  } catch {
    // Browser or environment without zlib — return raw data
    return data;
  }
}

/**
 * Generate a ZUGFeRD PDF from scratch (without a pre-existing visual PDF).
 * Creates a minimal visual representation of the invoice.
 *
 * For production use, prefer generateZugferdPdf() with a properly
 * rendered invoice PDF from invoice-pdf.ts.
 */
export async function generateZugferdPdfFromScratch(data: EInvoiceData): Promise<ZUGFeRDResult> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 800;

  // Header
  page.drawText(data.seller.name, { x: margin, y, size: 14, font: boldFont });
  y -= 20;
  if (data.seller.street) {
    page.drawText(data.seller.street, { x: margin, y, size: 10, font });
    y -= 14;
  }
  page.drawText(`${data.seller.zip} ${data.seller.city}`, { x: margin, y, size: 10, font });
  y -= 14;
  page.drawText(data.seller.country, { x: margin, y, size: 10, font });
  y -= 30;

  // Invoice title
  page.drawText("Rechnung", { x: margin, y, size: 24, font: boldFont });
  y -= 30;

  // Invoice details
  page.drawText(`Rechnungs-Nr.: ${data.invoiceNumber}`, { x: margin, y, size: 10, font });
  y -= 14;
  page.drawText(`Datum: ${data.invoiceDate}`, { x: margin, y, size: 10, font });
  y -= 14;
  if (data.dueDate) {
    page.drawText(`Fällig: ${data.dueDate}`, { x: margin, y, size: 10, font });
    y -= 14;
  }
  y -= 10;

  // Buyer
  page.drawText("Rechnungsempfänger:", { x: margin, y, size: 10, font: boldFont });
  y -= 14;
  page.drawText(data.buyer.name, { x: margin, y, size: 10, font });
  y -= 14;
  if (data.buyer.street) {
    page.drawText(data.buyer.street, { x: margin, y, size: 10, font });
    y -= 14;
  }
  page.drawText(`${data.buyer.zip} ${data.buyer.city}`, { x: margin, y, size: 10, font });
  y -= 30;

  // Line items
  page.drawText("Posten", { x: margin, y, size: 12, font: boldFont });
  y -= 18;

  for (const item of data.lineItems) {
    const lineTotal = item.quantity * item.unitPrice;
    page.drawText(`${item.name}`, { x: margin, y, size: 10, font });
    page.drawText(`${lineTotal.toFixed(2)} ${data.currency}`, {
      x: 595.28 - margin - 80,
      y,
      size: 10,
      font,
    });
    y -= 16;
  }

  y -= 20;

  // Totals
  const lineTotal = data.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = data.lineItems.reduce(
    (sum, item) => sum + (item.quantity * item.unitPrice * item.taxRate) / 100,
    0
  );
  const grandTotal = lineTotal + taxAmount;

  page.drawText(`Netto: ${lineTotal.toFixed(2)} ${data.currency}`, {
    x: 595.28 - margin - 150,
    y,
    size: 10,
    font,
  });
  y -= 14;
  page.drawText(`MwSt (${data.taxRate}%): ${taxAmount.toFixed(2)} ${data.currency}`, {
    x: 595.28 - margin - 150,
    y,
    size: 10,
    font,
  });
  y -= 14;
  page.drawText(`Gesamt: ${grandTotal.toFixed(2)} ${data.currency}`, {
    x: 595.28 - margin - 150,
    y,
    size: 12,
    font: boldFont,
  });

  // Payment info
  y -= 40;
  if (data.bank?.iban) {
    page.drawText(`IBAN: ${data.bank.iban}`, { x: margin, y, size: 10, font });
    y -= 14;
  }
  if (data.bank?.bic) {
    page.drawText(`BIC: ${data.bank.bic}`, { x: margin, y, size: 10, font });
    y -= 14;
  }

  // Now embed the XML
  const { xml } = generateXRechnungXml(data, "zugferd");
  const xmlBytes = strToUint8Array(xml);
  await pdfDoc.attach(xmlBytes, "factur-x.xml", {
    mimeType: "application/xml",
    description: "Factur-X/ZUGFeRD XML invoice",
    creationDate: new Date(),
    modificationDate: new Date(),
    afRelationship: AFRelationship.Alternative,
  });

  markPdfA3(pdfDoc);

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

  return {
    pdf: pdfBytes,
    filename: `zugferd_${data.invoiceNumber}.pdf`,
    profile: data.profile,
  };
}

/**
 * Extract embedded XML from a ZUGFeRD PDF.
 * Returns the XML string if found, null otherwise.
 *
 * Since pdf-lib doesn't expose a getAttachments() method,
 * we parse the raw PDF bytes to find the embedded XML stream.
 */
export async function extractZugferdXml(pdfBytes: Uint8Array): Promise<string | null> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const catalog = pdfDoc.catalog;
    const context = pdfDoc.context;

    // Helper: try to extract XML from a file spec dict
    const tryExtractFromFileSpec = (fileSpec: unknown): string | null => {
      if (!(fileSpec instanceof PDFDict)) return null;
      const ef = context.lookup(fileSpec.get(PDFName.of("EF")));
      if (!(ef instanceof PDFDict)) return null;
      const fRef = ef.get(PDFName.of("F"));
      if (!fRef) return null;
      const stream = context.lookup(fRef);
      if (!stream) return null;

      const anyStream = stream as unknown as {
        getContents?: () => Uint8Array;
        getUnencodedContents?: () => Uint8Array;
        dict?: PDFDict;
      };

      // Try getUnencodedContents() first (PDFFlateStream decompresses automatically)
      if (typeof anyStream.getUnencodedContents === "function") {
        try {
          const content = anyStream.getUnencodedContents();
          const xml = new TextDecoder().decode(content);
          if (xml.includes("CrossIndustryInvoice") || xml.includes("Invoice")) {
            return xml;
          }
        } catch {
          // Fall through
        }
      }

      // Try getContents (PDFRawStream returns raw stored bytes, possibly compressed)
      if (typeof anyStream.getContents === "function") {
        try {
          let content = anyStream.getContents();

          // Check if the stream is compressed (has /Filter entry)
          const streamDict = (stream as { dict?: PDFDict }).dict;
          if (streamDict instanceof PDFDict) {
            const filter = context.lookup(streamDict.get(PDFName.of("Filter")));
            const filterName = filter?.toString() ?? "";
            if (filterName.includes("FlateDecode") || filterName.includes("Fl")) {
              // Decompress using zlib (Node.js) or pako (browser)
              content = decompress(content);
            }
          }

          const xml = new TextDecoder().decode(content);
          if (xml.includes("CrossIndustryInvoice") || xml.includes("Invoice")) {
            return xml;
          }
        } catch {
          // Fall through
        }
      }

      return null;
    };

    // Path 1: Check catalog AF array
    const af = context.lookup(catalog.get(PDFName.of("AF")));
    if (af instanceof PDFArray) {
      for (let i = 0; i < af.size(); i++) {
        const ref = af.get(i);
        if (ref) {
          const fileSpec = context.lookup(ref);
          const xml = tryExtractFromFileSpec(fileSpec);
          if (xml) return xml;
        }
      }
    }

    // Path 2: Check Names -> EmbeddedFiles -> Names array
    const names = context.lookup(catalog.get(PDFName.of("Names")));
    if (names instanceof PDFDict) {
      const embeddedFiles = context.lookup(names.get(PDFName.of("EmbeddedFiles")));
      if (embeddedFiles instanceof PDFArray) {
        for (let i = 0; i < embeddedFiles.size(); i += 2) {
          const fileRef = embeddedFiles.get(i + 1);
          if (fileRef) {
            const fileSpec = context.lookup(fileRef);
            const xml = tryExtractFromFileSpec(fileSpec);
            if (xml) return xml;
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
