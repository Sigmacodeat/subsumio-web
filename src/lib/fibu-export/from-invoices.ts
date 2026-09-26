/**
 * Rechnungsseiten → Buchungssätze für den BMD-/RZL-Export.
 *
 *  - Eine Buchung pro Steuersatz (Honorar 20 %, durchlaufende Auslagen 0 %
 *    …), aus der gespeicherten Steueraufschlüsselung bzw. — bei älteren
 *    Rechnungen ohne sie — aus den Positionen nachgerechnet.
 *  - Betrag = Netto + USt der Leistung. Eine Akontozahlung mindert nur den
 *    Zahlbetrag der Schlussrechnung, nicht Erlös und USt; sie wird nicht
 *    vom Buchungsbetrag abgezogen.
 *  - Storno-Noten (negativ gespeichert) gehen als Typ „storno“ mit
 *    Beträgen ohne Vorzeichen hinaus — die Exporter setzen das Vorzeichen
 *    genau einmal. Original + Storno im selben Zeitraum ergeben 0.
 */

import {
  computeInvoiceTotals,
  fromCents,
  toCents,
  totalsInputFromFrontmatter,
  type TaxBreakdownRow,
} from "@/lib/invoice-totals";
import type { FibuBookingInput } from "./types";

/** Issued invoices — a draft is not a booking. */
export const BOOKABLE_INVOICE_STATUS = new Set(["sent", "paid", "overdue"]);

export interface InvoicePageLike {
  slug: string;
  created_at?: string;
  frontmatter?: Record<string, unknown>;
}

function breakdownOf(fm: Record<string, unknown>): TaxBreakdownRow[] {
  const stored = fm.tax_breakdown;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored
      .filter((r): r is TaxBreakdownRow => !!r && typeof r === "object")
      .map((r) => ({
        rate: Number(r.rate) || 0,
        net: Number(r.net) || 0,
        tax: Number(r.tax) || 0,
      }));
  }
  return computeInvoiceTotals(totalsInputFromFrontmatter(fm)).tax_breakdown;
}

/** Booking lines of one invoice page (empty when it is not bookable). */
export function invoiceBookingInputs(page: InvoicePageLike): FibuBookingInput[] {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  const status = String(fm.status ?? "draft");
  const number = String(fm.invoice_number ?? "");
  if (!BOOKABLE_INVOICE_STATUS.has(status) || !number) return [];

  const type = fm.invoice_type;
  const invoiceType: FibuBookingInput["invoiceType"] =
    type === "storno" ? "storno" : type === "gutschrift" ? "gutschrift" : "standard";
  const date = String(fm.date ?? page.created_at ?? "").slice(0, 10);
  const clientName = String(fm.client ?? "");

  return breakdownOf(fm)
    .filter((r) => toCents(r.net) !== 0 || toCents(r.tax) !== 0)
    .map((r) => {
      const netCents = Math.abs(toCents(r.net));
      const vatCents = Math.abs(toCents(r.tax));
      return {
        invoiceNumber: number,
        date,
        clientName,
        net: fromCents(netCents),
        vat: fromCents(vatCents),
        vatRatePercent: Math.round(r.rate * 100),
        gross: fromCents(netCents + vatCents),
        invoiceType,
      };
    });
}

/** Booking lines of all bookable invoices whose date lies in [from, to]. */
export function bookingInputsForPeriod(
  pages: InvoicePageLike[],
  from: string,
  to: string
): FibuBookingInput[] {
  return pages.flatMap((p) =>
    invoiceBookingInputs(p).filter((e) => e.date >= from && e.date <= to)
  );
}
