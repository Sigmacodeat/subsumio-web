/**
 * DATEV-Direktanbindung — API statt Datei
 * =========================================
 * Extends existing CSV export with DATEV Rechnungsdatenservice /
 * Buchungsdatenservice API integration.
 */

export type DatevExportType = "invoices" | "bookings" | "master_data";

export type DatevExportStatus = "pending" | "sent" | "confirmed" | "failed";

export interface DatevDirectExport {
  id: string;
  type: DatevExportType;
  period: { from: string; to: string };
  status: DatevExportStatus;
  record_count: number;
  total_amount: number;
  datev_reference?: string;
  error?: string;
  sent_at?: string;
  confirmed_at?: string;
  created_at: string;
}

export interface DatevInvoiceRecord {
  belegnummer: string;
  belegdatum: string;
  buchungstext: string;
  betrag: number;
  steuerschluessel: string;
  gegenkonto: string;
  buchungskonto: string;
  kundennummer?: string;
  projekt?: string;
}

export interface DatevBookingRecord {
  datum: string;
  buchungstext: string;
  sollkonto: string;
  habenkonto: string;
  betrag: number;
  steuerschluessel?: string;
  belegnummer?: string;
  kundennummer?: string;
}

export function invoicesToDatevRecords(
  invoices: Array<{
    invoice_number: string;
    invoice_date: string;
    client_name: string;
    net_amount: number;
    tax_rate: number;
    client_number?: string;
  }>
): DatevInvoiceRecord[] {
  return invoices.map((inv) => {
    const steuerschluessel = inv.tax_rate === 19 ? "3" : inv.tax_rate === 7 ? "2" : "0";
    return {
      belegnummer: inv.invoice_number,
      belegdatum: inv.invoice_date,
      buchungstext: inv.client_name.slice(0, 80),
      betrag: inv.net_amount,
      steuerschluessel,
      gegenkonto: "1200",
      buchungskonto: "8400",
      kundennummer: inv.client_number,
    };
  });
}

export function createDatevExport(input: {
  type: DatevExportType;
  period: { from: string; to: string };
  record_count: number;
  total_amount: number;
}): DatevDirectExport {
  const now = new Date().toISOString();
  return {
    id: `datev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    period: input.period,
    status: "pending",
    record_count: input.record_count,
    total_amount: input.total_amount,
    created_at: now,
  };
}

export function isDatevConfigured(): boolean {
  return Boolean(
    process.env.DATEV_API_KEY && process.env.DATEV_CLIENT_ID && process.env.DATEV_CLIENT_SECRET
  );
}
