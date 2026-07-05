/**
 * E-Invoice Module
 * ================
 *
 * XRechnung / ZUGFeRD (EN 16931) e-invoicing for Germany/EU.
 * Swiss QR-Bill for Switzerland.
 * EPC-QR (GiroCode) for SEPA.
 *
 * Usage:
 * ```ts
 * import { generateXRechnungXml, validateEInvoice, invoiceToEInvoiceData } from "@/lib/e-invoice";
 *
 * const data = invoiceToEInvoiceData(invoice, settings, { leitwegId: "..." });
 * const result = validateEInvoice(data);
 * if (result.valid) {
 *   const { xml } = generateXRechnungXml(data);
 * }
 * ```
 */

export * from "./types";
export * from "./xrechnung";
export * from "./zugferd";
export * from "./qr-bill";
export * from "./validator";
export * from "./adapter";
