"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Printer,
  Mail,
  Trash2,
  Loader2,
  Calculator,
  FileSpreadsheet,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { csrfFetch } from "@/lib/csrf";
import { useMe } from "@/lib/queries/auth";
import { STATUS_TEXT, STATUS_BG, statusBadgeClasses, type StatusColor } from "@/lib/status-colors";
import {
  caseFrontmatter,
  invoiceFrontmatter,
  type ExpenseEntry,
  type InvoiceExpenseEntry,
  type TimeEntry,
} from "@/lib/legal-types";
import { loadKanzleiSettings, type KanzleiSettings } from "@/lib/kanzlei-settings";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchBar } from "@/components/dashboard/search-bar";
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

const STATUS_CONFIG: Record<
  string,
  { labelKey: DashboardKey; icon: React.ElementType; color: StatusColor }
> = {
  draft: { labelKey: "inv.status_draft", icon: Clock, color: "gray" },
  sent: { labelKey: "inv.status_sent", icon: Send, color: "blue" },
  paid: { labelKey: "inv.status_paid", icon: CheckCircle2, color: "emerald" },
  overdue: { labelKey: "inv.status_overdue", icon: AlertTriangle, color: "red" },
  cancelled: { labelKey: "inv.status_cancelled", icon: XCircle, color: "gray" },
};

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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("lawyer");

  const meQuery = useMe();

  useEffect(() => {
    if (meQuery.data?.user?.role) setUserRole(meQuery.data.user.role);
  }, [meQuery.data]);

  useEffect(() => {
    loadKanzleiSettings()
      .then(setKanzlei)
      .catch(() => {});
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
          vatRate: fm.vat_rate ?? 0.19,
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
        setStatusMessage(t("inv.error_offline"));
      } else {
        setInvoices([]);
        setCases([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadInvoices() {
    try {
      const pages = await api.brain.listPages({ type: "invoice", limit: 200 });
      const loaded: Invoice[] = pages.map((p) => {
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
          vatRate: fm.vat_rate ?? 0.19,
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
        };
      });
      setInvoices(loaded);
    } catch (err) {
      console.error(
        "[invoicing] failed to load invoices:",
        err instanceof Error ? err.message : String(err)
      );
      const cached = await getCache<InvoicingCache>(OFFLINE_KEYS.invoices);
      if (cached) {
        setInvoices(cached.invoices);
        setCases(cached.cases);
        setStatusMessage(t("inv.error_offline"));
      } else {
        setInvoices([]);
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
    const vatRate = inv.vatRate || (settings?.tarifModell === "ratg" ? 0.2 : 0.19);
    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Rechnung ${inv.number}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #333; font-size: 14px; }
  .header { border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { margin: 0; font-size: 28px; color: #6366f1; }
  .header p { margin: 4px 0; color: #666; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .meta-box { background: #f8f9fa; padding: 15px; border-radius: 8px; }
  .meta-box strong { display: block; margin-bottom: 8px; color: #333; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { background: #f1f3f4; padding: 12px; text-align: left; font-weight: 600; }
  td { padding: 12px; border-bottom: 1px solid #e8eaed; }
  .right { text-align: right; }
  .totals { margin-top: 20px; border-top: 2px solid #e8eaed; padding-top: 20px; }
  .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
  .total-row.grand { font-size: 18px; font-weight: bold; color: #6366f1; border-top: 2px solid #6366f1; margin-top: 10px; padding-top: 15px; }
  .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e8eaed; font-size: 12px; color: #666; }
  .muted { color: #666; }
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
      <p>Datum: ${escapeHtml(inv.date)}</p>
      <p>Fällig: ${escapeHtml(inv.dueDate)}</p>
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
          <td>${escapeHtml(item.date)}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="right">${item.hours.toFixed(2)}</td>
          <td class="right">${item.rate.toFixed(2)}</td>
          <td class="right">${item.amount.toFixed(2)}</td>
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
            <td>${escapeHtml(item.date)}</td>
            <td>${escapeHtml(item.description)}</td>
            <td class="right">${item.amount.toFixed(2)}</td>
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
    <div class="total-row"><span>Honorar netto</span><span>${inv.subtotal.toFixed(2)} €</span></div>
    ${inv.expenseTotal > 0 ? `<div class="total-row"><span>Auslagen netto</span><span>${inv.expenseTotal.toFixed(2)} €</span></div>` : ""}
    <div class="total-row"><span>Mehrwertsteuer (${(vatRate * 100).toFixed(0)}%)</span><span>${inv.tax.toFixed(2)} €</span></div>
    ${inv.advancePayment > 0 ? `<div class="total-row"><span>Vorschuss / Anzahlung</span><span>- ${inv.advancePayment.toFixed(2)} €</span></div>` : ""}
    <div class="total-row grand"><span>Gesamtbetrag</span><span>${inv.total.toFixed(2)} €</span></div>
  </div>

  ${inv.notes ? `<p style="margin-top: 30px; color: #666;">${escapeHtml(inv.notes)}</p>` : ""}

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
    const settings = kanzlei ?? (await loadKanzleiSettings());
    const { generateInvoicePdf } = await import("@/lib/invoice-pdf");
    const pdf = generateInvoicePdf({
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
    pdf.save(`Rechnung_${inv.number}.pdf`);
  }

  async function sendInvoiceEmail(inv: Invoice) {
    setStatusMessage(t("inv.email_sending"));
    try {
      const res = await csrfFetch("/api/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceSlug: inv.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`${t("inv.email_sent")} ${data.sentTo}`);
        setTimeout(() => setStatusMessage(null), 4000);
      } else {
        setStatusMessage(
          data.error === "smtp_not_configured"
            ? t("inv.email_smtp_error")
            : `${t("inv.error_prefix")}: ${data.error}`
        );
      }
    } catch (err) {
      setStatusMessage(t("inv.email_fail"));
      console.error("[invoice-email] failed:", err instanceof Error ? err.message : String(err));
    }
  }

  async function sendReminder(inv: Invoice) {
    setStatusMessage(t("inv.reminder_sending"));
    try {
      const res = await csrfFetch("/api/invoices/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceSlug: inv.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(
          `${data.reminderCount}. ${t("inv.reminder_sent")} — ${t("inv.reminder_fee")}: ${data.fee.toFixed(2)} €`
        );
        // Refresh invoice list
        await loadInvoices();
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage(
          data.error === "smtp_not_configured"
            ? t("inv.email_smtp_error")
            : `${t("inv.error_prefix")}: ${data.error}`
        );
      }
    } catch (err) {
      setStatusMessage(t("inv.reminder_fail"));
      console.error("[invoice-reminder] failed:", err instanceof Error ? err.message : String(err));
    }
  }

  async function updateStatus(inv: Invoice, status: Invoice["status"]) {
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
      setStatusMessage(`${t("inv.updated")} ${inv.number}.`);
    } catch (err) {
      setStatusMessage(
        err instanceof Error
          ? `${t("inv.status_save_fail")} ${err.message}`
          : t("inv.status_save_fail")
      );
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
      setStatusMessage(`${t("inv.deleted")} ${inv.number}.`);
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? `${t("inv.delete_fail")} ${err.message}` : t("inv.delete_fail")
      );
    }
  }

  const filtered = invoices.filter(
    (inv) =>
      inv.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.client.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalOutstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("inv.title")}
        description={t("inv.desc")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("inv.title") }]}
        actions={
          <Button
            variant="primary"
            className="gap-2 bg-emerald-600 text-sm text-white hover:bg-emerald-500"
            onClick={() => setQuickCreateOpen(true)}
          >
            <Plus size={14} />
            {t("inv.create")}
          </Button>
        }
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <HubLink
          href="/dashboard/cost-calculator"
          icon={Calculator}
          label={t("nav.cost_calculator")}
        />
        <HubLink
          href="/dashboard/datev-export"
          icon={FileSpreadsheet}
          label={t("nav.datev_export")}
        />
        <HubLink href="/dashboard/controlling" icon={BarChart3} label={t("nav.controlling")} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">{t("inv.outstanding")}</div>
          <div className="text-xl font-bold text-amber-600">
            {totalOutstanding.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €
          </div>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">{t("inv.paid")}</div>
          <div className="text-xl font-bold text-emerald-600">
            {totalPaid.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €
          </div>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">{t("inv.invoices")}</div>
          <div className="text-xl font-bold text-[color:var(--ds-text)]">{invoices.length}</div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            statusMessage.includes("nicht") ||
              statusMessage.includes("fehl") ||
              statusMessage.includes("fail") ||
              statusMessage.includes("not") ||
              statusMessage.includes("error")
              ? "border-red-500/20 bg-red-500/5 text-red-700"
              : "border-emerald-500/20 bg-emerald-500/5 text-emerald-700"
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

      {/* Search */}
      <SearchBar
        placeholder={t("inv.search")}
        onSearch={setSearchQuery}
        onClear={() => setSearchQuery("")}
        className="max-w-md"
      />

      {/* Invoice List */}
      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label={t("inv.loading")}
        >
          <Loader2
            size={24}
            className="animate-spin text-[color:var(--ds-text-muted)]"
            aria-hidden="true"
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
            <FileText size={28} className="text-[color:var(--ds-border-strong)]" />
          </div>
          <h3 className="mb-2 text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
            {t("inv.empty_title")}
          </h3>
          <p className="mb-6 max-w-sm text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
            {t("inv.empty_desc")}
          </p>
          <Button variant="glow" size="md" onClick={() => setQuickCreateOpen(true)}>
            <Plus size={15} /> {t("inv.create")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((inv) => {
            const status = STATUS_CONFIG[inv.status];
            const StatusIcon = status.icon;
            return (
              <div
                key={inv.id}
                className="flex items-center gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)]"
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    STATUS_BG[status.color]
                  )}
                  aria-hidden="true"
                >
                  <StatusIcon size={18} className={STATUS_TEXT[status.color]} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)]">
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
                        className="border border-amber-500/30 bg-amber-600/15 text-xs text-amber-600"
                      >
                        {inv.reminderCount}. {t("inv.reminder")}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {inv.client} · {inv.items.length + inv.expenses.length} {t("inv.positions")} ·{" "}
                    {inv.date}
                    {inv.paidAt
                      ? ` · ${t("inv.paid_on")} ${new Date(inv.paidAt).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}`
                      : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold text-[color:var(--ds-text)]">
                    {inv.total.toFixed(2)} €
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("inv.incl_vat")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => void printInvoice(inv)}
                    className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-emerald-500/10 hover:text-emerald-600"
                    title={t("inv.print")}
                  >
                    <Printer size={14} />
                  </button>
                  <button
                    onClick={() => void downloadPdf(inv)}
                    className="hover:brand-text brand-bg/10 rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    title={t("inv.download_pdf")}
                  >
                    <FileText size={14} />
                  </button>
                  {(userRole === "admin" || userRole === "lawyer" || userRole === "assistant") && (
                    <button
                      onClick={() => void sendInvoiceEmail(inv)}
                      className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-blue-500/10 hover:text-blue-600"
                      title={t("inv.send_email")}
                    >
                      <Mail size={14} />
                    </button>
                  )}
                  {inv.status === "draft" && (
                    <button
                      onClick={() => updateStatus(inv, "sent")}
                      className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-blue-500/10 hover:text-blue-600"
                      title={t("inv.mark_sent")}
                    >
                      <Send size={14} />
                    </button>
                  )}
                  {inv.status === "sent" && (
                    <button
                      onClick={() => updateStatus(inv, "paid")}
                      className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-emerald-500/10 hover:text-emerald-600"
                      title={t("inv.mark_paid")}
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  )}
                  {inv.status !== "paid" &&
                    inv.status !== "cancelled" &&
                    (userRole === "admin" || userRole === "lawyer") && (
                      <button
                        onClick={() => updateStatus(inv, "cancelled")}
                        className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/10 hover:text-red-600"
                        title={t("inv.cancel_invoice")}
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  {(inv.status === "sent" || inv.status === "overdue") &&
                    (userRole === "admin" || userRole === "lawyer") && (
                      <button
                        onClick={() => void sendReminder(inv)}
                        className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-amber-500/10 hover:text-amber-600"
                        title={`${inv.reminderCount ? `${inv.reminderCount}. ` : ""}${t("inv.send_reminder")}`}
                      >
                        <AlertTriangle size={14} />
                      </button>
                    )}
                  {(userRole === "admin" || userRole === "lawyer") && (
                    <button
                      onClick={() => deleteInvoice(inv)}
                      className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/10 hover:text-red-600"
                      title={t("inv.delete")}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HubLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
