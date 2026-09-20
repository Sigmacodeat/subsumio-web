"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Printer,
  Mail,
  Trash2,
  FileSpreadsheet,
  BarChart3,
  MoreHorizontal,
  FileCode2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, formatEur } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { useMe } from "@/lib/queries/auth";
import { statusBadgeClasses, type StatusColor } from "@/lib/status-colors";
import {
  caseFrontmatter,
  invoiceFrontmatter,
  type ExpenseEntry,
  type InvoiceExpenseEntry,
  type TimeEntry,
} from "@/lib/legal-types";
import { loadKanzleiSettings, type KanzleiSettings, vatRateFor } from "@/lib/kanzlei-settings";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchBar } from "@/components/dashboard/search-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowSkeleton, Skeleton } from "@/components/dashboard/skeleton";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { InvoiceQuickCreateDialog } from "@/components/legal/InvoiceQuickCreateDialog";

interface InvoiceItem {
  description: string;
  date: string;
  hours: number;
  rate: number;
  amount: number;
}

interface Invoice {
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
  invoiceType?: "standard" | "teilrechnung" | "sammelrechnung" | "gutschrift";
  parentInvoiceId?: string;
  caseSlugs?: string[];
  leitwegId?: string;
}

interface InvoiceCase {
  slug: string;
  title: string;
  caseNumber: string;
  clientName?: string;
  clientSlug?: string;
  timeEntries?: TimeEntry[];
  expenses?: ExpenseEntry[];
}

interface InvoicingCache {
  invoices: Invoice[];
  cases: InvoiceCase[];
}

const STATUS_CONFIG: Record<string, { labelKey: DashboardKey; color: StatusColor }> = {
  draft: { labelKey: "inv.status_draft", color: "gray" },
  sent: { labelKey: "inv.status_sent", color: "blue" },
  paid: { labelKey: "inv.status_paid", color: "emerald" },
  overdue: { labelKey: "inv.status_overdue", color: "red" },
  cancelled: { labelKey: "inv.status_cancelled", color: "gray" },
};

/** Server error codes → plain German. Never show a raw code or provider message. */
function invoiceErrorText(code: unknown, fallback: string): string {
  switch (code) {
    case "smtp_not_configured":
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

/** Escape user input before injecting into HTML strings — prevents XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeHtmlLines(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

export default function InvoicingPage() {
  const confirm = useConfirm();
  const { t, lang } = useLang();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cases, setCases] = useState<InvoiceCase[]>([]);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [kanzlei, setKanzlei] = useState<KanzleiSettings | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMessage, setStatusMessageText] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "error" | "info">("info");
  /** Show a status line; `tone` decides colour, `ms` auto-hides it. */
  function setStatusMessage(
    text: string | null,
    tone: "success" | "error" | "info" = "info",
    ms?: number
  ) {
    setStatusMessageText(text);
    setStatusTone(tone);
    if (text && ms)
      setTimeout(() => setStatusMessageText((cur) => (cur === text ? null : cur)), ms);
  }
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("lawyer");

  const meQuery = useMe();

  useEffect(() => {
    if (meQuery.data?.user?.role) setUserRole(meQuery.data.user.role);
  }, [meQuery.data]);

  useEffect(() => {
    loadKanzleiSettings()
      .then(setKanzlei)
      .catch((err) =>
        console.warn(
          "[invoicing] Failed to load kanzlei settings:",
          err instanceof Error ? err.message : err
        )
      );
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => setQuickCreateOpen(true);
    window.addEventListener("subsumio:create-invoice", handler);
    return () => window.removeEventListener("subsumio:create-invoice", handler);
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const batch = await api.brain.batchListPages(["invoice", "legal_case"], 200);
      const invoicePages = batch["invoice"] ?? [];
      const casePages = batch["legal_case"] ?? [];
      const loadedInvoices: Invoice[] = invoicePages.map((p) => {
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
          caseSlugs: fm.case_slugs,
          leitwegId: fm.leitweg_id,
        };
      });
      const loadedCases: InvoiceCase[] = casePages.map((p) => {
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
      });
      setInvoices(loadedInvoices);
      setCases(loadedCases);
      await setCache<InvoicingCache>(OFFLINE_KEYS.invoices, {
        invoices: loadedInvoices,
        cases: loadedCases,
      });
    } catch (err) {
      console.error(
        "[invoicing] loadAll failed:",
        err instanceof Error ? err.message : String(err)
      );
      const cached = await getCache<InvoicingCache>(OFFLINE_KEYS.invoices);
      if (cached) {
        setInvoices(cached.invoices);
        setCases(cached.cases);
        setStatusMessage(t("inv.error_offline"), "info");
      } else {
        setInvoices([]);
        setCases([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function _loadCases() {
    try {
      const pages = await api.brain.listPages({ type: "legal_case", limit: 200 });
      const loadedCases = pages.map((p) => {
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
      });
      setCases(loadedCases);
    } catch (err) {
      console.error(
        "[invoicing] failed to load cases:",
        err instanceof Error ? err.message : String(err)
      );
      const cached = await getCache<InvoicingCache>(OFFLINE_KEYS.invoices);
      setCases(cached?.cases ?? []);
    }
  }

  async function printInvoice(inv: Invoice) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const settings = kanzlei ?? (await loadKanzleiSettings());
    const vatRate = inv.vatRate ?? vatRateFor(settings);
    const num = (n: number) =>
      new Intl.NumberFormat("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        Number.isFinite(n) ? n : 0
      );
    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Rechnung ${inv.number}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: hsl(222, 8%, 20%); font-size: 14px; }
  .header { border-bottom: 2px solid hsl(222, 60%, 52%); padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { margin: 0; font-size: 28px; color: hsl(222, 60%, 52%); }
  .header p { margin: 4px 0; color: hsl(222, 8%, 40%); }
  .meta { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .meta-box { background: hsl(222, 8%, 97%); padding: 15px; border-radius: 8px; }
  .meta-box strong { display: block; margin-bottom: 8px; color: hsl(222, 8%, 20%); }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { background: hsl(222, 8%, 94%); padding: 12px; text-align: left; font-weight: 600; }
  td { padding: 12px; border-bottom: 1px solid hsl(222, 8%, 90%); }
  .right { text-align: right; }
  .totals { margin-top: 20px; border-top: 2px solid hsl(222, 8%, 90%); padding-top: 20px; }
  .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
  .total-row.grand { font-size: 18px; font-weight: bold; color: hsl(222, 60%, 52%); border-top: 2px solid hsl(222, 60%, 52%); margin-top: 10px; padding-top: 15px; }
  .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid hsl(222, 8%, 90%); font-size: 12px; color: hsl(222, 8%, 40%); }
  .muted { color: hsl(222, 8%, 40%); }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <h1>Rechnung</h1>
    <p><strong>${escapeHtml(settings?.kanzleiName || "Kanzlei")}</strong></p>
    <p>${escapeHtml(settings?.anwaltName || "")}</p>
    ${settings?.kanzleiAdresse ? `<p>${escapeHtmlLines(settings.kanzleiAdresse)}</p>` : ""}
    ${settings?.kanzleiEmail || settings?.kanzleiTelefon ? `<p>${escapeHtml([settings?.kanzleiEmail, settings?.kanzleiTelefon].filter(Boolean).join(" · "))}</p>` : ""}
    ${settings?.kammerNummer ? `<p>${escapeHtml(settings.kammerNummer)}</p>` : ""}
    ${settings?.ustId ? `<p>USt-ID: ${escapeHtml(settings.ustId)}</p>` : ""}
  </div>

  <div class="meta">
    <div class="meta-box">
      <strong>Rechnung an:</strong>
      ${escapeHtml(inv.client)}
    </div>
    <div class="meta-box">
      <strong>Rechnungsdetails:</strong>
      <p>Rechnungs-Nr.: ${escapeHtml(inv.number)}</p>
      <p>Datum: ${escapeHtml(formatDate(inv.date))}</p>
      ${inv.dueDate ? `<p>Fällig: ${escapeHtml(formatDate(inv.dueDate))}</p>` : ""}
      ${inv.caseNumber ? `<p>Aktenzeichen: ${escapeHtml(inv.caseNumber)}</p>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Datum</th>
        <th>Beschreibung</th>
        <th class="right">Stunden</th>
        <th class="right">Satz (€)</th>
        <th class="right">Betrag (€)</th>
      </tr>
    </thead>
    <tbody>
      ${inv.items
        .map(
          (item) => `
        <tr>
          <td>${escapeHtml(formatDate(item.date))}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="right">${item.hours > 0 ? num(item.hours) : "—"}</td>
          <td class="right">${item.hours > 0 ? num(item.rate) : "—"}</td>
          <td class="right">${num(item.amount)}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  ${
    inv.expenses.length > 0
      ? `
    <table>
      <thead>
        <tr>
          <th>Datum</th>
          <th>Auslage</th>
          <th class="right">Betrag (€)</th>
        </tr>
      </thead>
      <tbody>
        ${inv.expenses
          .map(
            (item) => `
          <tr>
            <td>${escapeHtml(formatDate(item.date))}</td>
            <td>${escapeHtml(item.description)}</td>
            <td class="right">${num(item.amount)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `
      : ""
  }

  <div class="totals">
    <div class="total-row"><span>Honorar netto</span><span>${formatEur(inv.subtotal, lang)}</span></div>
    ${inv.expenseTotal > 0 ? `<div class="total-row"><span>Auslagen netto</span><span>${formatEur(inv.expenseTotal, lang)}</span></div>` : ""}
    <div class="total-row"><span>Mehrwertsteuer (${(vatRate * 100).toFixed(0)}%)</span><span>${formatEur(inv.tax, lang)}</span></div>
    ${inv.advancePayment > 0 ? `<div class="total-row"><span>Vorschuss / Anzahlung</span><span>− ${formatEur(inv.advancePayment, lang)}</span></div>` : ""}
    <div class="total-row grand"><span>Gesamtbetrag</span><span>${formatEur(inv.total, lang)}</span></div>
  </div>

  ${inv.notes ? `<p style="margin-top: 30px; color: hsl(222, 8%, 40%);">${escapeHtml(inv.notes)}</p>` : ""}

  <div class="footer">
    <p>Zahlungsbedingungen: ${escapeHtml(inv.paymentTerms || "14 Tage netto")}</p>
    ${inv.bank?.iban ? `<p>${escapeHtml([inv.bank.name, inv.bank.iban, inv.bank.bic].filter(Boolean).join(" · "))}</p>` : ""}
    <p>${escapeHtml(settings?.rechnungFooter || "Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer.")}</p>
  </div>

  <script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body>
</html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  async function downloadPdf(inv: Invoice) {
    const pdf = await buildInvoicePdf(inv);
    pdf.save(`Rechnung_${inv.number}.pdf`);
  }

  /** The same PDF for download and for the e-mail attachment. */
  async function buildInvoicePdf(inv: Invoice) {
    const settings = kanzlei ?? (await loadKanzleiSettings());
    const { generateInvoicePdf } = await import("@/lib/invoice-pdf");
    return generateInvoicePdf({
      number: inv.number,
      client: inv.client,
      clientAddress: inv.clientAddress,
      caseNumber: inv.caseNumber,
      date: inv.date,
      dueDate: inv.dueDate,
      items: inv.items,
      expenses: inv.expenses,
      subtotal: inv.subtotal,
      expenseTotal: inv.expenseTotal,
      advancePayment: inv.advancePayment,
      vatRate: inv.vatRate,
      tax: inv.tax,
      total: inv.total,
      paymentTerms: inv.paymentTerms,
      bank: inv.bank,
      notes: inv.notes,
      kanzlei: {
        name: settings?.kanzleiName || "Kanzlei",
        anwaltName: settings?.anwaltName,
        adresse: settings?.kanzleiAdresse,
        email: settings?.kanzleiEmail,
        telefon: settings?.kanzleiTelefon,
        kammerNummer: settings?.kammerNummer,
        ustId: settings?.ustId,
      },
    });
  }

  async function downloadXmlInvoice(inv: Invoice, format: "ebinterface" | "xrechnung") {
    const label = format === "ebinterface" ? "ebInterface" : "XRechnung";
    const settings = kanzlei ?? (await loadKanzleiSettings());
    try {
      const res = await csrfFetch("/api/e-invoice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          invoice: {
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
          },
          settings,
          options: {
            leitwegId: inv.leitwegId,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusMessage(
          invoiceErrorText(
            data.error,
            `${label} konnte nicht erstellt werden. Bitte versuchen Sie es erneut.`
          ),
          "error",
          6000
        );
        return;
      }
      const blob = new Blob([data.xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage(`${label}-Datei heruntergeladen.`, "success", 3000);
    } catch (err) {
      setStatusMessage(
        `${label} konnte nicht erstellt werden. Bitte versuchen Sie es erneut.`,
        "error",
        6000
      );
      console.error("[e-invoice] generate failed:", err);
    }
  }

  async function downloadZugferdPdf(inv: Invoice) {
    const settings = kanzlei ?? (await loadKanzleiSettings());
    setStatusMessage("ZUGFeRD-PDF wird erstellt …");
    try {
      const res = await csrfFetch("/api/e-invoice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "zugferd_scratch",
          invoice: {
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
          },
          settings,
          options: {
            leitwegId: inv.leitwegId,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatusMessage(
          invoiceErrorText(
            data.error,
            "ZUGFeRD-PDF konnte nicht erstellt werden. Bitte versuchen Sie es erneut."
          ),
          "error",
          6000
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zugferd_${inv.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage("ZUGFeRD-PDF heruntergeladen.", "success", 3000);
    } catch (err) {
      setStatusMessage(
        "ZUGFeRD-PDF konnte nicht erstellt werden. Bitte versuchen Sie es erneut.",
        "error",
        6000
      );
      console.error("[e-invoice] zugferd failed:", err);
    }
  }

  async function importEInvoice(file: File) {
    setStatusMessage("E-Rechnung wird eingelesen …");
    try {
      let parsed: import("@/lib/e-invoice/types").ParsedEInvoice | null = null;
      let sourceFormat: "xml" | "pdf" = "xml";

      if (file.name.endsWith(".xml")) {
        const xml = await file.text();
        const res = await csrfFetch("/api/e-invoice/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ xml }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setStatusMessage(
            invoiceErrorText(data.error, "Die E-Rechnung konnte nicht eingelesen werden."),
            "error",
            6000
          );
          return;
        }
        parsed = data.parsed;
        sourceFormat = "xml";
      } else if (file.name.endsWith(".pdf")) {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        const res = await csrfFetch("/api/e-invoice/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: base64 }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setStatusMessage(
            invoiceErrorText(data.error, "Die E-Rechnung konnte nicht eingelesen werden."),
            "error",
            6000
          );
          return;
        }
        parsed = data.parsed;
        sourceFormat = "pdf";
      } else {
        setStatusMessage("Bitte wählen Sie eine XML- oder PDF-Datei.", "error", 4000);
        return;
      }

      if (!parsed) return;

      // Persist as incoming_invoice brain page
      const now = new Date().toISOString();
      const slug = `legal/incoming-invoices/${now.slice(0, 10)}/${parsed.invoiceNumber || Date.now()}`;
      try {
        await api.brain.createPage({
          slug,
          title: `Eingehende Rechnung: ${parsed.invoiceNumber} — ${parsed.seller?.name ?? ""}`,
          type: "incoming_invoice",
          frontmatter: {
            type: "incoming_invoice",
            invoice_number: parsed.invoiceNumber,
            invoice_date: parsed.invoiceDate,
            due_date: parsed.dueDate,
            delivery_date: parsed.deliveryDate,
            invoice_type_code: parsed.invoiceTypeCode,
            currency: parsed.currency,
            profile: parsed.profile,
            seller: parsed.seller,
            buyer: parsed.buyer,
            line_items: parsed.lineItems,
            allowance_charges: parsed.allowanceCharges,
            tax_rate: parsed.taxRate,
            total_net: parsed.totalNet,
            total_tax: parsed.totalTax,
            total_gross: parsed.totalGross,
            advance_payment: parsed.advancePayment,
            bank: parsed.bank,
            payment_terms: parsed.paymentTerms,
            notes: parsed.notes,
            case_reference: parsed.caseReference,
            source_format: sourceFormat,
            source_filename: file.name,
            imported_at: now,
            status: "new",
          },
        });
      } catch {
        // Storage failure is non-fatal — user still sees the parsed result
      }

      setStatusMessage(
        `Eingangsrechnung ${parsed.invoiceNumber}${parsed.seller?.name ? ` von ${parsed.seller.name}` : ""} übernommen.`,
        "success",
        5000
      );
    } catch (err) {
      setStatusMessage("Die E-Rechnung konnte nicht eingelesen werden.", "error", 6000);
      console.error("[e-invoice] import failed:", err);
    }
  }

  async function sendInvoiceEmail(inv: Invoice) {
    if (busySlug) return;
    setBusySlug(inv.id);
    setStatusMessage(t("inv.email_sending"));
    try {
      const res = await csrfFetch("/api/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceSlug: inv.id,
          // The mail says "anbei" — so the invoice goes along as a PDF.
          pdfBase64: (await buildInvoicePdf(inv)).output("datauristring").split(",")[1],
          pdfFilename: `Rechnung_${inv.number}.pdf`,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`${t("inv.email_sent")} ${data.sentTo}`, "success", 4000);
        if (inv.status === "draft") {
          setInvoices((list) =>
            list.map((i) => (i.id === inv.id ? { ...i, status: "sent" as const } : i))
          );
        }
      } else {
        setStatusMessage(
          data.error === "smtp_not_configured"
            ? t("inv.email_smtp_error")
            : invoiceErrorText(data.error, t("inv.email_fail")),
          "error"
        );
      }
    } catch (err) {
      setStatusMessage(t("inv.email_fail"), "error");
      console.error("[invoice-email] failed:", err instanceof Error ? err.message : String(err));
    } finally {
      setBusySlug(null);
    }
  }

  async function sendReminder(inv: Invoice) {
    if (busySlug) return;
    setBusySlug(inv.id);
    setStatusMessage(t("inv.reminder_sending"));
    try {
      const res = await csrfFetch("/api/invoices/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceSlug: inv.id }),
      });
      const data = await res.json();
      if (res.ok) {
        // Refresh invoice list
        await loadAll();
        setStatusMessage(
          `${data.reminderCount}. ${t("inv.reminder_sent")} — ${t("inv.reminder_fee")} ${formatEur(Number(data.fee) || 0, lang)}`,
          "success",
          5000
        );
      } else {
        setStatusMessage(
          data.error === "smtp_not_configured"
            ? t("inv.email_smtp_error")
            : invoiceErrorText(data.error, t("inv.reminder_fail")),
          "error"
        );
      }
    } catch (err) {
      setStatusMessage(t("inv.reminder_fail"), "error");
      console.error("[invoice-reminder] failed:", err instanceof Error ? err.message : String(err));
    } finally {
      setBusySlug(null);
    }
  }

  async function updateStatus(inv: Invoice, status: Invoice["status"]) {
    if (busySlug) return;
    setBusySlug(inv.id);
    const paidPatch: Pick<Invoice, "paidAt" | "paidAmount"> =
      status === "paid"
        ? { paidAt: new Date().toISOString(), paidAmount: inv.total }
        : { paidAt: inv.paidAt, paidAmount: inv.paidAmount };
    setStatusMessage(null);
    try {
      const updatePayload = {
        slug: inv.id,
        frontmatter: {
          status,
          ...(status === "paid"
            ? { paid_at: paidPatch.paidAt, paid_amount: paidPatch.paidAmount }
            : {}),
        },
      };
      if (isOnline()) {
        await api.brain.updatePage(updatePayload);
      } else {
        await enqueueMutation({ type: "updatePage", payload: updatePayload });
      }
      const nextInvoices = invoices.map((i) =>
        i.id === inv.id ? { ...i, status, ...paidPatch } : i
      );
      setInvoices(nextInvoices);
      await setCache<InvoicingCache>(OFFLINE_KEYS.invoices, { invoices: nextInvoices, cases });
      setStatusMessage(`${inv.number} ${t("inv.updated")}`, "success", 4000);
    } catch (err) {
      console.error("[invoicing] status update failed:", err instanceof Error ? err.message : err);
      setStatusMessage(t("inv.status_save_fail"), "error");
    } finally {
      setBusySlug(null);
    }
  }

  async function deleteInvoice(inv: Invoice) {
    const ok = await confirm({
      title: t("inv.confirm_delete_title"),
      message: `${t("inv.confirm_delete_msg")} ${inv.number}?`,
      confirmLabel: t("inv.delete"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      if (isOnline()) {
        await api.brain.deletePage(inv.id);
      } else {
        await enqueueMutation({ type: "deletePage", payload: { slug: inv.id } });
      }
      const nextInvoices = invoices.filter((i) => i.id !== inv.id);
      setInvoices(nextInvoices);
      await setCache<InvoicingCache>(OFFLINE_KEYS.invoices, { invoices: nextInvoices, cases });
      setStatusMessage(`${inv.number} ${t("inv.deleted")}`, "success", 4000);
    } catch (err) {
      console.error("[invoicing] delete failed:", err instanceof Error ? err.message : err);
      setStatusMessage(t("inv.delete_fail"), "error");
    }
  }

  const filtered = invoices.filter(
    (inv) =>
      inv.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.client.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sumOf = (list: Invoice[]) => list.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const drafts = invoices.filter((i) => i.status === "draft");
  const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;
  const paid = invoices.filter((i) => i.status === "paid");
  const en = lang === "en";
  const countLabel = (n: number) =>
    en ? `${n} ${n === 1 ? "invoice" : "invoices"}` : `${n} ${n === 1 ? "Rechnung" : "Rechnungen"}`;
  const positionsLabel = (n: number) =>
    en ? `${n} ${n === 1 ? "item" : "items"}` : `${n} ${n === 1 ? "Position" : "Positionen"}`;
  const canSend = userRole === "admin" || userRole === "lawyer" || userRole === "assistant";
  const canManage = userRole === "admin" || userRole === "lawyer";

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("inv.title")}
        description={t("inv.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("inv.title") },
        ]}
        actions={
          <>
            <input
              type="file"
              accept=".xml,.pdf"
              className="hidden"
              id="e-invoice-import"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importEInvoice(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="primary"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setQuickCreateOpen(true)}
            >
              <Plus size={14} aria-hidden="true" />
              {t("inv.create")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => document.getElementById("e-invoice-import")?.click()}
            >
              <Upload size={14} aria-hidden="true" />
              {en ? "Import e-invoice" : "E-Rechnung einlesen"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap"
                  aria-label={en ? "Related areas" : "Verwandte Bereiche"}
                >
                  <MoreHorizontal size={14} aria-hidden="true" />
                  {en ? "More" : "Mehr"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <HubMenuLink
                  href="/dashboard/fee-agreements"
                  icon={FileText}
                  label={t("nav.fee_agreements")}
                />
                <HubMenuLink href="/dashboard/fibu" icon={FileSpreadsheet} label={t("nav.fibu")} />
                <HubMenuLink
                  href="/dashboard/controlling"
                  icon={BarChart3}
                  label={t("nav.controlling")}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Kennzahlen: Entwürfe · Offen · Bezahlt — jeweils Summe brutto + Anzahl */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <InvoiceStat
            label={en ? "Drafts" : "Entwürfe"}
            value={formatEur(sumOf(drafts), lang)}
            sub={countLabel(drafts.length)}
          />
          <InvoiceStat
            label={t("inv.outstanding")}
            value={formatEur(sumOf(outstanding), lang)}
            sub={
              overdueCount > 0
                ? `${countLabel(outstanding.length)} · ${overdueCount} ${t("inv.status_overdue").toLowerCase()}`
                : countLabel(outstanding.length)
            }
            tone={overdueCount > 0 ? "danger" : outstanding.length > 0 ? "warning" : undefined}
          />
          <InvoiceStat
            label={t("inv.paid")}
            value={formatEur(sumOf(paid), lang)}
            sub={countLabel(paid.length)}
          />
        </div>
      )}

      {statusMessage && (
        <div
          role={statusTone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            statusTone === "error"
              ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
              : statusTone === "success"
                ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]"
          )}
        >
          {statusMessage}
        </div>
      )}

      {/* Quick create dialog */}
      <InvoiceQuickCreateDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onCreated={() => void loadAll()}
      />

      {/* Search — only useful once there is something to search */}
      {(invoices.length > 0 || searchQuery) && (
        <SearchBar
          placeholder={t("inv.search")}
          onSearch={setSearchQuery}
          onClear={() => setSearchQuery("")}
          className="max-w-md"
        />
      )}

      {/* Invoice List */}
      {loading ? (
        <div role="status" aria-label={t("inv.loading")}>
          <RowSkeleton count={4} />
        </div>
      ) : filtered.length === 0 ? (
        searchQuery ? (
          <EmptyState
            icon={FileText}
            title={en ? "No matching invoices" : "Keine passenden Rechnungen"}
            description={
              en
                ? "No invoice number or client matches your search."
                : "Keine Rechnungsnummer und kein Mandant entspricht Ihrer Suche."
            }
          />
        ) : (
          <EmptyState
            icon={FileText}
            title={t("inv.empty_title")}
            description={t("inv.empty_desc")}
            actionLabel={t("inv.create")}
            onAction={() => setQuickCreateOpen(true)}
          />
        )
      ) : (
        <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          {filtered.map((inv) => {
            const status = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.draft;
            const busy = busySlug === inv.id;
            const payable = inv.status === "sent" || inv.status === "overdue";
            return (
              <li
                key={inv.id}
                className="flex items-center gap-3 px-3 py-3 transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] motion-reduce:transition-none sm:gap-4 sm:px-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)] tabular-nums">
                      {inv.number}
                    </span>
                    <Badge
                      variant="default"
                      className={cn("border text-xs", statusBadgeClasses(status.color))}
                    >
                      {t(status.labelKey)}
                    </Badge>
                    {inv.reminderCount ? (
                      <Badge
                        variant="default"
                        className="border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-xs text-[color:var(--ds-warning-text)]"
                      >
                        {inv.reminderCount}. {t("inv.reminder")}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                    {[
                      inv.client || t("inv.unknown_client"),
                      positionsLabel(inv.items.length + inv.expenses.length),
                      formatDate(inv.date),
                      inv.paidAt ? `${t("inv.paid_on")} ${formatDate(inv.paidAt)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-[color:var(--ds-text)] tabular-nums">
                    {formatEur(inv.total, lang)}
                  </div>
                  <div className="hidden text-xs text-[color:var(--ds-text-muted)] sm:block">
                    {t("inv.incl_vat")}
                  </div>
                </div>
                {/* Max. zwei sichtbare Aktionen, der Rest im Mehr-Menü */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconAction
                    label={t("inv.download_pdf")}
                    onClick={() => void downloadPdf(inv)}
                    className="hidden sm:inline-flex"
                  >
                    <FileText size={15} />
                  </IconAction>
                  {inv.status === "draft" && (
                    <IconAction
                      label={t("inv.mark_sent")}
                      onClick={() => updateStatus(inv, "sent")}
                      disabled={busy}
                      className="hidden sm:inline-flex"
                    >
                      <Send size={15} />
                    </IconAction>
                  )}
                  {payable && (
                    <IconAction
                      label={t("inv.mark_paid")}
                      onClick={() => updateStatus(inv, "paid")}
                      disabled={busy}
                      className="hidden sm:inline-flex"
                    >
                      <CheckCircle2 size={15} />
                    </IconAction>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                        aria-label={`${en ? "More actions for" : "Weitere Aktionen für"} ${inv.number}`}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      {inv.status === "draft" && (
                        <DropdownMenuItem
                          onClick={() => updateStatus(inv, "sent")}
                          disabled={busy}
                          className="gap-2 text-xs sm:hidden"
                        >
                          <Send size={13} />
                          {t("inv.mark_sent")}
                        </DropdownMenuItem>
                      )}
                      {payable && (
                        <DropdownMenuItem
                          onClick={() => updateStatus(inv, "paid")}
                          disabled={busy}
                          className="gap-2 text-xs sm:hidden"
                        >
                          <CheckCircle2 size={13} />
                          {t("inv.mark_paid")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => void downloadPdf(inv)}
                        className="gap-2 text-xs sm:hidden"
                      >
                        <FileText size={13} />
                        {t("inv.download_pdf")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void printInvoice(inv)}
                        className="gap-2 text-xs"
                      >
                        <Printer size={13} />
                        {t("inv.print")}
                      </DropdownMenuItem>
                      {canSend && (
                        <DropdownMenuItem
                          onClick={() => void sendInvoiceEmail(inv)}
                          disabled={busy}
                          className="gap-2 text-xs"
                        >
                          <Mail size={13} />
                          {t("inv.send_email")}
                        </DropdownMenuItem>
                      )}
                      {payable && canManage && (
                        <DropdownMenuItem
                          onClick={() => void sendReminder(inv)}
                          disabled={busy}
                          className="gap-2 text-xs"
                        >
                          <AlertTriangle size={13} />
                          {inv.reminderCount
                            ? `${inv.reminderCount + 1}. ${t("inv.reminder")} ${en ? "send" : "senden"}`
                            : t("inv.send_reminder")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => void downloadXmlInvoice(inv, "ebinterface")}
                        className="gap-2 text-xs"
                      >
                        <FileCode2 size={13} />
                        ebInterface (e-rechnung.gv.at)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void downloadXmlInvoice(inv, "xrechnung")}
                        className="gap-2 text-xs"
                      >
                        <FileCode2 size={13} />
                        XRechnung
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void downloadZugferdPdf(inv)}
                        className="gap-2 text-xs"
                      >
                        <FileText size={13} />
                        ZUGFeRD-PDF
                      </DropdownMenuItem>
                      {canManage && inv.status !== "paid" && inv.status !== "cancelled" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => updateStatus(inv, "cancelled")}
                            disabled={busy}
                            className="gap-2 text-xs text-[color:var(--ds-danger-text)] focus:text-[color:var(--ds-danger-text)]"
                          >
                            <XCircle size={13} />
                            {t("inv.cancel_invoice")}
                          </DropdownMenuItem>
                        </>
                      )}
                      {canManage && (
                        <DropdownMenuItem
                          onClick={() => deleteInvoice(inv)}
                          className="gap-2 text-xs text-[color:var(--ds-danger-text)] focus:text-[color:var(--ds-danger-text)]"
                        >
                          <Trash2 size={13} />
                          {t("inv.delete")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function InvoiceStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "warning" | "danger";
}) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "danger"
            ? "text-[color:var(--ds-danger-text)]"
            : tone === "warning"
              ? "text-[color:var(--ds-warning-text)]"
              : "text-[color:var(--ds-text)]"
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)] tabular-nums">{sub}</div>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-40 motion-reduce:transition-none",
        className
      )}
    >
      {children}
    </button>
  );
}

function HubMenuLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <DropdownMenuItem asChild className="gap-2 text-xs">
      <Link href={href}>
        <Icon size={13} aria-hidden="true" />
        {label}
      </Link>
    </DropdownMenuItem>
  );
}
