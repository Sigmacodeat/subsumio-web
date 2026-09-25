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
import { REVERSE_CHARGE_NOTE, rateFraction, roundEur, toCents } from "../invoice-totals";

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
    country: settings.country ?? "AT",
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
    vatId: options?.buyerAddress?.vatId ?? invoice.client_vat_id,
    email: options?.buyerAddress?.email,
  };

  // VAT per line (EN 16931 / ebInterface): fees at the invoice rate, each
  // expense at its own (0 % = durchlaufender Posten, exempt with reason).
  // Kleinunternehmer: everything exempt. Reverse charge: category AE.
  const isKleinunternehmer = settings.kleinunternehmer === true;
  const reverseCharge = !isKleinunternehmer && invoice.reverse_charge === true;
  const country = String(settings.country ?? "AT").toUpperCase();
  const kuReason =
    country === "DE"
      ? "Umsatzsteuerbefreit – Kleinunternehmer gem. § 19 Abs. 1 UStG"
      : "Umsatzsteuerbefreit – Kleinunternehmer gem. § 6 Abs. 1 Z 27 UStG 1994";
  const toPercent = (fraction: number) => Math.round(fraction * 10000) / 100;
  // The invoicing UI stores the rate as a fraction (0.2), older data and the
  // API as percent (20) — rateFraction reads both.
  const invoiceRate = rateFraction(invoice.vat_rate, 0.2);
  const taxRate = isKleinunternehmer || reverseCharge ? 0 : toPercent(invoiceRate);
  const taxCategory: TaxCategoryCode = isKleinunternehmer ? "E" : reverseCharge ? "AE" : "S";
  const vatFor = (
    fraction: number
  ): { taxRate: number; taxCategory: TaxCategoryCode; exemptionReason?: string } => {
    if (isKleinunternehmer) return { taxRate: 0, taxCategory: "E", exemptionReason: kuReason };
    if (reverseCharge)
      return { taxRate: 0, taxCategory: "AE", exemptionReason: REVERSE_CHARGE_NOTE };
    if (fraction === 0) {
      return {
        taxRate: 0,
        taxCategory: "E",
        exemptionReason: "Durchlaufender Posten (§ 4 Abs. 3 UStG 1994)",
      };
    }
    return { taxRate: toPercent(fraction), taxCategory: "S" };
  };

  // A Storno-Note is stored with negative amounts; as an e-invoice it is a
  // credit note (381) with positive amounts referring to the original.
  const isStorno = invoice.invoice_type === "storno";
  const sign = isStorno ? -1 : 1;

  // Quantity × unit price must give exactly the stored line amount — the
  // receiver recomputes it. Hours only when they do; otherwise one lump sum
  // with the stored amount (and the hours in the description).
  const lineItems: EInvoiceLineItem[] = (invoice.items ?? []).map((item, idx) => {
    const amount = roundEur(sign * Number(item.amount ?? 0));
    const hours = Number(item.hours) || 0;
    const rate = Number(item.rate) || 0;
    const exactHours = hours > 0 && rate > 0 && toCents(hours * rate) === toCents(amount);
    return {
      id: String(idx + 1),
      name: item.description,
      description:
        !exactHours && hours > 0 && rate > 0
          ? `${hours.toLocaleString("de-AT", { maximumFractionDigits: 4 })} Std. à ${rate.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
          : undefined,
      quantity: exactHours ? hours : 1,
      unit: (exactHours ? "HUR" : "C62") as UnitCode,
      unitPrice: exactHours ? rate : amount,
      ...vatFor(invoiceRate),
    };
  });

  // Convert expenses as line items
  const expenseItems: EInvoiceLineItem[] = (invoice.expenses ?? []).map((exp, idx) => ({
    id: String(lineItems.length + idx + 1),
    name: exp.description,
    description: "Auslage",
    quantity: 1,
    unit: "C62" as UnitCode,
    unitPrice: roundEur(sign * Number(exp.amount ?? 0)),
    ...vatFor(rateFraction(exp.vat_rate, invoiceRate)),
  }));

  const allItems = [...lineItems, ...expenseItems];

  // Determine invoice type code
  const typeCode =
    invoice.invoice_type === "gutschrift" || isStorno
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
    advancePayment:
      invoice.advance_payment !== undefined
        ? roundEur(sign * Number(invoice.advance_payment))
        : undefined,
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
    taxExemptionReason: isKleinunternehmer
      ? kuReason
      : reverseCharge
        ? REVERSE_CHARGE_NOTE
        : undefined,
    precedingInvoice:
      isStorno && invoice.parent_invoice_number
        ? { number: invoice.parent_invoice_number, date: invoice.parent_invoice_date }
        : undefined,
  };
}
