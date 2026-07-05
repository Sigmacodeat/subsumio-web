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

  // Build buyer from invoice client + optional address
  const buyer: EInvoiceParty = {
    name: options?.buyerAddress?.name ?? invoice.client ?? "Mandant",
    street: options?.buyerAddress?.street ?? invoice.client_address,
    zip: options?.buyerAddress?.zip ?? "",
    city: options?.buyerAddress?.city ?? "",
    country: options?.buyerAddress?.country ?? "DE",
    vatId: options?.buyerAddress?.vatId,
    email: options?.buyerAddress?.email,
  };

  // Determine tax category: S = standard, E = exempt (§19 UStG Kleinunternehmer)
  const isKleinunternehmer = settings.kleinunternehmer === true;
  const taxCategory: TaxCategoryCode = isKleinunternehmer ? "E" : "S";
  const taxRate = isKleinunternehmer ? 0 : (invoice.vat_rate ?? 19);

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
  };
}
