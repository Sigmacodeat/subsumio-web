/**
 * View model of the invoicing page: invoice/matter rows read from engine
 * pages, the overview sums, error texts and the e-invoice request payload.
 * Pure — no React, no fetch — so it is unit-tested on its own.
 */
import {
  caseFrontmatter,
  invoiceFrontmatter,
  type ExpenseEntry,
  type InvoiceExpenseEntry,
  type TimeEntry,
} from "@/lib/legal-types";

export interface InvoiceItem {
  description: string;
  date: string;
  hours: number;
  rate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  number: string;
  client: string;
  clientSlug?: string;
  clientAddress?: string;
  caseNumber?: string;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  expenses: InvoiceExpenseEntry[];
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  subtotal: number;
  expenseTotal: number;
  advancePayment: number;
  paidAmount?: number;
  paidAt?: string;
  vatRate: number;
  tax: number;
  total: number;
  paymentTerms?: string;
  bank?: {
    name?: string;
    iban?: string;
    bic?: string;
  };
  notes?: string;
  reminderCount?: number;
  reminderSentAt?: string[];
  reminderFee?: number;
  invoiceType?: "standard" | "teilrechnung" | "sammelrechnung" | "gutschrift" | "storno";
  parentInvoiceId?: string;
  caseSlugs?: string[];
  leitwegId?: string;
  taxBreakdown?: Array<{ rate: number; net: number; tax: number }>;
  reverseCharge?: boolean;
  clientVatId?: string;
  parentInvoiceNumber?: string;
  parentInvoiceDate?: string;
  eInvoiceChannel?: "peppol" | "erechnung_gv_at";
  eInvoiceReference?: string;
  eInvoiceStatus?: "queued" | "delivered" | "failed";
}

export interface InvoiceCase {
  slug: string;
  title: string;
  caseNumber: string;
  clientName?: string;
  clientSlug?: string;
  timeEntries?: TimeEntry[];
  expenses?: ExpenseEntry[];
}

export interface InvoicingCache {
  invoices: Invoice[];
  cases: InvoiceCase[];
}

/** Engine page as the invoicing list reads it. */
export interface InvoicingPageLike {
  slug: string;
  title: string;
  created_at: string;
  frontmatter?: Record<string, unknown>;
}

export function invoiceFromPage(p: InvoicingPageLike): Invoice {
  const fm = invoiceFrontmatter(p);
  return {
    id: p.slug,
    number: fm.invoice_number || p.slug,
    client: fm.client || "",
    clientSlug: fm.client_slug,
    clientAddress: fm.client_address,
    caseNumber: fm.case_number,
    date: fm.date || p.created_at,
    dueDate: fm.due_date || "",
    items: fm.items || [],
    expenses: fm.expenses || [],
    status: (fm.status as Invoice["status"]) || "draft",
    subtotal: fm.subtotal || 0,
    expenseTotal: fm.expense_total || 0,
    advancePayment: fm.advance_payment || 0,
    paidAmount: fm.paid_amount,
    paidAt: fm.paid_at,
    vatRate: fm.vat_rate ?? 0.2,
    tax: fm.tax || 0,
    total: fm.total || 0,
    paymentTerms: fm.payment_terms,
    bank: fm.bank,
    notes: fm.notes,
    reminderCount: fm.reminder_count,
    reminderSentAt: fm.reminder_sent_at,
    reminderFee: fm.reminder_fee,
    invoiceType: fm.invoice_type,
    parentInvoiceId: fm.parent_invoice_id,
    parentInvoiceNumber: fm.parent_invoice_number,
    parentInvoiceDate: fm.parent_invoice_date,
    eInvoiceChannel: fm.e_invoice_channel,
    eInvoiceReference: fm.e_invoice_reference,
    eInvoiceStatus: fm.e_invoice_status,
    caseSlugs: fm.case_slugs,
    leitwegId: fm.leitweg_id,
    taxBreakdown: fm.tax_breakdown,
    reverseCharge: fm.reverse_charge === true,
    clientVatId: fm.client_vat_id,
  };
}

export function invoiceCaseFromPage(p: InvoicingPageLike): InvoiceCase {
  const fm = caseFrontmatter(p);
  return {
    slug: p.slug,
    title: p.title,
    caseNumber: fm.case_number || p.slug,
    clientName: fm.client_name,
    clientSlug: fm.client_slug,
    timeEntries: fm.time_entries || [],
    expenses: fm.expenses || [],
  };
}

/**
 * Deep link into the invoice list: `?case=<slug>` opens the create dialog
 * with that matter preset, `?invoice=<number>` narrows the list to that
 * invoice (links from a matter's billed entries).
 */
export function invoicingDeepLink(params: { get(name: string): string | null }): {
  presetCaseSlug?: string;
  invoiceQuery?: string;
} {
  const caseSlug = params.get("case")?.trim();
  const invoice = params.get("invoice")?.trim();
  return {
    ...(caseSlug ? { presetCaseSlug: caseSlug } : {}),
    ...(invoice ? { invoiceQuery: invoice } : {}),
  };
}

/** The matter an invoice was issued for (first of `case_slugs`). */
export function invoiceCaseSlug(inv: Pick<Invoice, "caseSlugs">): string | undefined {
  const slug = inv.caseSlugs?.find((s) => typeof s === "string" && s.trim());
  return slug || undefined;
}

/** Sum of invoice totals, added in cents so the overview never drifts by a float remainder. */
export function sumOfTotals(list: Invoice[]): number {
  const cents = list.reduce((s, i) => s + Math.round((Number(i.total) || 0) * 100), 0);
  return cents / 100;
}

/** The overview tiles: drafts, outstanding (sent or overdue), paid. */
export function invoiceOverview(invoices: Invoice[]): {
  drafts: Invoice[];
  outstanding: Invoice[];
  overdueCount: number;
  paid: Invoice[];
} {
  return {
    drafts: invoices.filter((i) => i.status === "draft"),
    outstanding: invoices.filter((i) => i.status === "sent" || i.status === "overdue"),
    overdueCount: invoices.filter((i) => i.status === "overdue").length,
    paid: invoices.filter((i) => i.status === "paid"),
  };
}

/** Invoice fields sent to /api/e-invoice/generate (XML and ZUGFeRD). */
export function eInvoicePayload(inv: Invoice) {
  return {
    invoice_number: inv.number,
    client: inv.client,
    client_address: inv.clientAddress,
    case_number: inv.caseNumber,
    date: inv.date,
    due_date: inv.dueDate,
    items: inv.items,
    expenses: inv.expenses,
    subtotal: inv.subtotal,
    expense_total: inv.expenseTotal,
    advance_payment: inv.advancePayment,
    vat_rate: inv.vatRate,
    tax: inv.tax,
    total: inv.total,
    payment_terms: inv.paymentTerms,
    bank: inv.bank,
    notes: inv.notes,
    invoice_type: inv.invoiceType,
    leitweg_id: inv.leitwegId,
    reverse_charge: inv.reverseCharge,
    client_vat_id: inv.clientVatId,
    parent_invoice_number: inv.parentInvoiceNumber,
    parent_invoice_date: inv.parentInvoiceDate,
  };
}

/** Server error codes → plain German. Never show a raw code or provider message. */
export function invoiceErrorText(code: unknown, fallback: string): string {
  switch (code) {
    case "smtp_not_configured":
    case "mail_not_configured":
      return "E-Mail-Versand ist nicht eingerichtet. Bitte hinterlegen Sie den Postausgang in den Einstellungen.";
    case "validation_failed":
      return "Die E-Rechnung ist unvollständig. Bitte prüfen Sie Mandantenadresse, Kanzleidaten und Positionen.";
    case "xml_not_wellformed":
      return "Die Datei ist keine gültige E-Rechnung (XML nicht lesbar).";
    case "not_found":
      return "Die Rechnung wurde nicht gefunden. Bitte laden Sie die Seite neu.";
    case "no_recipient_email":
      return "Für diesen Mandanten ist keine E-Mail-Adresse hinterlegt.";
    case "invoice_not_overdue":
      return "Eine Mahnung ist nur für versendete Rechnungen möglich.";
    case "no_embedded_xml":
      return "Das PDF enthält keine eingebettete E-Rechnung (ZUGFeRD/Factur-X).";
    default:
      return fallback;
  }
}
