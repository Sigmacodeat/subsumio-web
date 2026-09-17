/**
 * E-Invoice Adapter
 * =================
 *
 * Converts existing InvoiceFrontmatter + KanzleiSettings to EInvoiceData
 * for XRechnung/ZUGFeRD generation.
 */

import type { InvoiceFrontmatter } from "../legal-types";
import type { KanzleiSettings } from "../kanzlei-settings";
import type {
  EInvoiceData,
  EInvoiceLineItem,
  EInvoiceParty,
  TaxCategoryCode,
  UnitCode,
} from "./types";

/**
 * Convert InvoiceFrontmatter + KanzleiSettings to EInvoiceData.
 */
/** Street, postcode and city from a multi-line address block, if recognisable. */
export function parsePostalAddress(block: string | undefined): {
  street?: string;
  zip?: string;
  city?: string;
} {
  if (!block) return {};
  const lines = block
    .split(/\r?\n|,/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^(?:[A-Z]{1,2}[- ])?(\d{4,5})\s+(.+)$/);
    if (m) return { zip: m[1], city: m[2], street: i > 0 ? lines[i - 1] : undefined };
  }
  return {};
}

export function invoiceToEInvoiceData(
  invoice: InvoiceFrontmatter,
  settings: KanzleiSettings,
  options?: {
    leitwegId?: string;
    buyerReference?: string;
    buyerAddress?: {
      name: string;
      street?: string;
      zip: string;
      city: string;
      country: string;
      vatId?: string;
      email?: string;
    };
  }
): EInvoiceData {
  // Build seller from KanzleiSettings
  const seller: EInvoiceParty = {
    name: settings.kanzleiName || "Kanzlei",
    contactName: settings.anwaltName,
    street: settings.street,
    zip: settings.zip ?? "",
    city: settings.city ?? "",
    country: settings.country ?? "DE",
    vatId: settings.ustId,
    email: settings.kanzleiEmail,
    phone: settings.kanzleiTelefon,
  };

  // Build buyer from invoice client + optional address. Without an explicit
  // address, read street, postcode and city from the stored address block
  // ("Name\nFirma\nStraße 1\n1010 Wien").
  const parsed = parsePostalAddress(invoice.client_address);
  const buyer: EInvoiceParty = {
    name: options?.buyerAddress?.name ?? invoice.client ?? "Mandant",
    street: options?.buyerAddress?.street ?? parsed.street ?? invoice.client_address,
    zip: options?.buyerAddress?.zip ?? parsed.zip ?? "",
    city: options?.buyerAddress?.city ?? parsed.city ?? "",
    country: options?.buyerAddress?.country ?? settings.country ?? "AT",
    vatId: options?.buyerAddress?.vatId,
    email: options?.buyerAddress?.email,
  };

  // Determine tax category: S = standard, E = exempt (§19 UStG Kleinunternehmer)
  const isKleinunternehmer = settings.kleinunternehmer === true;
  const taxCategory: TaxCategoryCode = isKleinunternehmer ? "E" : "S";
  // Percent. Austrian standard rate when the invoice carries none (AT pilot).
  // The invoicing UI stores the rate as a fraction (0.2), older data and the
  // API as percent (20). A rate of at most 1 can only be a fraction — there is
  // no 1 % VAT rate in Austria — so normalise instead of printing 0.2 %.
  const rawRate = invoice.vat_rate ?? 20;
  const taxRate = isKleinunternehmer
    ? 0
    : rawRate > 0 && rawRate <= 1
      ? Math.round(rawRate * 10000) / 100
      : rawRate;

  // Convert items
  const lineItems: EInvoiceLineItem[] = (invoice.items ?? []).map((item, idx) => ({
    id: String(idx + 1),
    name: item.description,
    description: undefined,
    quantity: item.hours > 0 ? item.hours : 1,
    unit: (item.hours > 0 ? "HUR" : "C62") as UnitCode,
    unitPrice: item.hours > 0 ? item.rate : item.amount,
    taxRate,
    taxCategory,
  }));

  // Convert expenses as line items
  const expenseItems: EInvoiceLineItem[] = (invoice.expenses ?? []).map((exp, idx) => ({
    id: String(lineItems.length + idx + 1),
    name: exp.description,
    description: "Auslage",
    quantity: 1,
    unit: "C62" as UnitCode,
    unitPrice: exp.amount,
    taxRate,
    taxCategory,
  }));

  const allItems = [...lineItems, ...expenseItems];

  // Determine invoice type code
  const typeCode =
    invoice.invoice_type === "gutschrift"
      ? "381"
      : invoice.invoice_type === "teilrechnung"
        ? "326"
        : "380";

  return {
    invoiceNumber: invoice.invoice_number ?? "",
    invoiceDate: invoice.date ?? new Date().toISOString().slice(0, 10),
    dueDate: invoice.due_date,
    invoiceTypeCode: typeCode as EInvoiceData["invoiceTypeCode"],
    currency: "EUR",
    profile: settings.eInvoiceProfile ?? "BASIC",
    seller,
    buyer,
    lineItems: allItems,
    taxRate,
    taxCategory,
    advancePayment: invoice.advance_payment,
    paymentTerms: invoice.payment_terms,
    bank: invoice.bank
      ? {
          name: invoice.bank.name,
          iban: invoice.bank.iban ?? "",
          bic: invoice.bank.bic,
        }
      : undefined,
    leitwegId: options?.leitwegId,
    buyerReference: options?.buyerReference,
    caseReference: invoice.case_number,
    notes: invoice.notes,
    taxExemptionReason: isKleinunternehmer ? "Kleinunternehmer gemäß §19 (1) UStG" : undefined,
  };
}
