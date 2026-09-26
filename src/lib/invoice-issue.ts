/**
 * Ausstellen einer Rechnung (Entwurf → versendet/bezahlt/überfällig).
 *
 * Ab dem Ausstellen ist die Rechnung unveränderbar (§ 132 BAO) und bekommt
 * einen offenen Posten. Deshalb prüft der Server an genau diesem Übergang,
 * ob sie ausgestellt werden darf — egal über welchen Weg (Statuswechsel,
 * E-Mail-Versand, e-Rechnung):
 *
 *  - Rechnungsnummer vorhanden;
 *  - Summen passen zu den Positionen (Cent, USt je Satz — invoice-totals);
 *  - Name und Anschrift des Leistungsempfängers (§ 11 Abs 1 Z 3 lit b UStG
 *    1994; bei Kleinbetragsrechnungen bis 400 € brutto genügt der Name,
 *    § 11 Abs 6);
 *  - bei Übergang der Steuerschuld die UID des Empfängers.
 *
 * Über die generischen Seiten-Routen kann eine Rechnung gar nicht ausgestellt
 * werden (billing-write-guards: checkInvoiceGenericWrite).
 */

import { FINALIZED_INVOICE_STATUSES, type GuardRejection } from "@/lib/page-write-guards";
import {
  checkStoredInvoiceTotals,
  computeInvoiceTotals,
  toCents,
  totalsInputFromFrontmatter,
} from "@/lib/invoice-totals";

/** § 11 Abs 6 UStG 1994: Kleinbetragsrechnung bis 400 € brutto. */
export const SMALL_INVOICE_LIMIT_CENTS = 40_000;

export function isIssuingTransition(prevStatus: unknown, nextStatus: unknown): boolean {
  const prev = String(prevStatus ?? "draft") || "draft";
  return (
    !FINALIZED_INVOICE_STATUSES.has(prev) &&
    FINALIZED_INVOICE_STATUSES.has(String(nextStatus ?? ""))
  );
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

/** Why this invoice may not be issued yet — `null` when it may. */
export function invoiceIssueProblem(fm: Record<string, unknown>): GuardRejection | null {
  if (!text(fm.invoice_number)) {
    return {
      status: 422,
      error: "invoice_number_missing",
      message: "Die Rechnung hat keine Rechnungsnummer und kann nicht ausgestellt werden.",
    };
  }
  const mismatched = checkStoredInvoiceTotals(fm);
  if (mismatched.length > 0) {
    return {
      status: 409,
      error: "invoice_totals_inconsistent",
      message: `Die Rechnungssummen passen nicht zu den Positionen (${mismatched.join(", ")}). Die Rechnung wurde nicht ausgestellt — bitte den Entwurf löschen und neu erstellen.`,
    };
  }
  if (!text(fm.client)) {
    return {
      status: 422,
      error: "client_missing",
      message: "Name des Leistungsempfängers fehlt — die Rechnung wurde nicht ausgestellt.",
    };
  }
  const gross = computeInvoiceTotals(totalsInputFromFrontmatter(fm)).gross;
  if (Math.abs(toCents(gross)) > SMALL_INVOICE_LIMIT_CENTS && !text(fm.client_address)) {
    return {
      status: 422,
      error: "client_address_missing",
      message:
        "Anschrift des Leistungsempfängers fehlt (Pflichtangabe ab 400 € brutto). Die Rechnung wurde nicht ausgestellt — bitte im Mandantenblatt ergänzen und den Entwurf neu erstellen.",
    };
  }
  if (fm.reverse_charge === true && !text(fm.client_vat_id)) {
    return {
      status: 422,
      error: "client_vat_id_required",
      message:
        "Bei Übergang der Steuerschuld (Reverse Charge) ist die UID-Nummer des Mandanten Pflicht.",
    };
  }
  return null;
}
