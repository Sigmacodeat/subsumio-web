"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FileText, Calculator, AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { api } from "@/lib/api";
import { isOnline, enqueueMutation, getCache, setCache, OFFLINE_KEYS } from "@/lib/offline-store";
import { useToast } from "@/components/ui/toast";
import {
  caseFrontmatter,
  invoiceFrontmatter,
  type ExpenseEntry,
  type InvoiceExpenseEntry,
  type TimeEntry,
} from "@/lib/legal-types";
import { sha256Hex, gobdFrontmatter, invoiceContentString } from "@/lib/gobd";
import { loadKanzleiSettings, type KanzleiSettings } from "@/lib/kanzlei-settings";
import { calculateRvg, type RvgResult } from "@/lib/rvg";
import type { BrainPage } from "@/lib/types";

interface InvoiceQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

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
  bank?: { name?: string; iban?: string; bic?: string };
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

const INVOICE_TYPE_OPTIONS: Array<{ value: string; labelKey: DashboardKey }> = [
  { value: "standard", labelKey: "inv.type_standard" },
  { value: "teilrechnung", labelKey: "inv.type_teilrechnung" },
  { value: "sammelrechnung", labelKey: "inv.type_sammelrechnung" },
  { value: "gutschrift", labelKey: "inv.type_gutschrift" },
];

function nextInvoiceNumber(invoices: Invoice[]): string {
  const year = new Date().getFullYear();
  const prefix = `R-${year}-`;
  const nums = invoices
    .filter((i) => i.number.startsWith(prefix))
    .map((i) => parseInt(i.number.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  let candidate = `${prefix}${String(next).padStart(4, "0")}`;
  while (invoices.some((i) => i.number === candidate)) {
    const suffix = candidate.includes("-") ? candidate.split("-").pop()! : candidate;
    candidate = `${prefix}${String(parseInt(suffix, 10) + 1).padStart(4, "0")}`;
  }
  return candidate;
}

export function InvoiceQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: InvoiceQuickCreateDialogProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();

  const [selectedCaseSlug, setSelectedCaseSlug] = useState("");
  const [invoiceType, setInvoiceType] = useState<Invoice["invoiceType"]>("standard");
  const [advancePayment, setAdvancePayment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cases, setCases] = useState<InvoiceCase[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [kanzlei, setKanzlei] = useState<KanzleiSettings | null>(null);
  const [loadingCases, setLoadingCases] = useState(false);
  const [showRvg, setShowRvg] = useState(false);
  const [streitwert, setStreitwert] = useState("");
  const [rvgResult, setRvgResult] = useState<RvgResult | null>(null);

  const resetForm = useCallback(() => {
    setSelectedCaseSlug("");
    setInvoiceType("standard");
    setAdvancePayment("");
    setShowRvg(false);
    setStreitwert("");
    setRvgResult(null);
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCases(true);
    (async () => {
      try {
        const [invoicePages, casePages] = await Promise.all([
          api.brain.listPages({ type: "invoice", limit: 200 }).catch(() => [] as BrainPage[]),
          api.brain.listPages({ type: "legal_case", limit: 200 }).catch(() => [] as BrainPage[]),
        ]);
        if (cancelled) return;
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
      } catch {
        const cached = await getCache<InvoicingCache>(OFFLINE_KEYS.invoices);
        if (!cancelled && cached) {
          setInvoices(cached.invoices);
          setCases(cached.cases);
        }
      } finally {
        if (!cancelled) setLoadingCases(false);
      }
    })();
    loadKanzleiSettings().then((s) => !cancelled && setKanzlei(s)).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  const selectedCase = cases.find((c) => c.slug === selectedCaseSlug);
  const openTime = (selectedCase?.timeEntries ?? []).filter(
    (entry) => entry.billable !== false && !entry.billed
  );
  const openExpenses = (selectedCase?.expenses ?? []).filter(
    (entry) => entry.billable !== false && !entry.billed
  );
  const totalMinutes = openTime.reduce((s, e) => s + (e.minutes || 0), 0);
  const expenseTotal = openExpenses.reduce((s, e) => s + e.amount, 0);
  const estimatedFee = Math.round(
    (totalMinutes / 60) * parseInt(kanzlei?.stundensatz || "200", 10)
  );
  const hasBillable = openTime.length > 0 || openExpenses.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const c = selectedCase;
    if (!c || !hasBillable) return;
    setSubmitting(true);

    try {
      const settings = kanzlei ?? (await loadKanzleiSettings());
      let clientAddress: string | undefined;
      if (c.clientSlug) {
        try {
          const page = await api.brain.getPage(c.clientSlug);
          const fm = page.frontmatter as Record<string, unknown>;
          const addr = String(fm.address ?? "");
          const company = String(fm.company ?? "");
          const name = String(fm.name ?? c.clientName ?? "");
          clientAddress = [name, company, addr].filter(Boolean).join("\n");
        } catch {}
      }
      const defaultRate = parseInt(settings?.stundensatz || "200", 10);
      const billableTime = (c.timeEntries ?? []).filter(
        (entry) => entry.billable !== false && !entry.billed
      );
      const billableExpenses = (c.expenses ?? []).filter(
        (entry) => entry.billable !== false && !entry.billed
      );
      if (billableTime.length === 0 && billableExpenses.length === 0) {
        setSubmitting(false);
        return;
      }

      const items: InvoiceItem[] = billableTime.map((entry) => {
        const hours = entry.minutes / 60;
        const rate = entry.rate || defaultRate;
        return {
          description: entry.description,
          date: entry.date.split("T")[0],
          hours: Math.round(hours * 100) / 100,
          rate,
          amount: Math.round(hours * rate * 100) / 100,
        };
      });
      const expenses: InvoiceExpenseEntry[] = billableExpenses.map((entry) => ({
        description: entry.description,
        date: entry.date.split("T")[0],
        amount: entry.amount,
      }));

      const subtotal = items.reduce((s, i) => s + i.amount, 0);
      const expTotal = expenses.reduce((s, i) => s + i.amount, 0);
      const parsedAdvance = Math.max(0, parseFloat(advancePayment) || 0);
      const vatRate = settings?.tarifModell === "ratg" ? 0.2 : 0.19;
      const taxableBase = subtotal + expTotal;
      const tax = Math.round(taxableBase * vatRate * 100) / 100;
      const total = Math.max(0, Math.round((taxableBase + tax - parsedAdvance) * 100) / 100);
      const paymentDays = Math.max(1, parseInt(settings?.zahlungszielTage || "14", 10) || 14);

      const invoice: Invoice = {
        id: `invoice/${Date.now()}`,
        number: nextInvoiceNumber(invoices),
        client: c.clientName || t("inv.unknown_client" as DashboardKey),
        clientSlug: c.clientSlug,
        clientAddress,
        caseNumber: c.caseNumber,
        date: new Date().toISOString().split("T")[0],
        dueDate: new Date(Date.now() + paymentDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        items,
        expenses,
        status: "draft",
        subtotal,
        expenseTotal: expTotal,
        advancePayment: parsedAdvance,
        vatRate,
        tax,
        total,
        paymentTerms: `${paymentDays} ${t("inv.days_net" as DashboardKey)}`,
        bank: { name: settings?.bankName, iban: settings?.iban, bic: settings?.bic },
        notes: `${t("inv.invoice_for_case" as DashboardKey)} ${c.caseNumber}`,
      };

      const issuedAt = new Date();
      const hash = await sha256Hex(invoiceContentString(invoice));

      const invoicePayload = {
        slug: invoice.id,
        title: `Rechnung ${invoice.number}`,
        type: "invoice" as const,
        frontmatter: {
          type: "invoice",
          invoice_number: invoice.number,
          client: invoice.client,
          client_slug: invoice.clientSlug,
          client_address: invoice.clientAddress,
          case_number: invoice.caseNumber,
          date: invoice.date,
          due_date: invoice.dueDate,
          items: invoice.items,
          expenses: invoice.expenses,
          status: invoice.status,
          subtotal: invoice.subtotal,
          expense_total: invoice.expenseTotal,
          advance_payment: invoice.advancePayment,
          vat_rate: invoice.vatRate,
          tax: invoice.tax,
          total: invoice.total,
          payment_terms: invoice.paymentTerms,
          bank: invoice.bank,
          notes: invoice.notes,
          invoice_type: invoiceType,
          ...gobdFrontmatter(hash, issuedAt),
        },
      };
      if (isOnline()) {
        await api.brain.createPage(invoicePayload);
      } else {
        await enqueueMutation({ type: "createPage", payload: invoicePayload });
      }

      const billedTimeIds = new Set(billableTime.map((entry) => entry.id));
      const billedExpenseIds = new Set(billableExpenses.map((entry) => entry.id));
      const updatedTimeEntries = (c.timeEntries ?? []).map((entry) =>
        billedTimeIds.has(entry.id)
          ? { ...entry, billed: true, invoice_number: invoice.number }
          : entry
      );
      const updatedExpenses = (c.expenses ?? []).map((entry) =>
        billedExpenseIds.has(entry.id)
          ? { ...entry, billed: true, invoice_number: invoice.number }
          : entry
      );
      const caseUpdatePayload = {
        slug: c.slug,
        frontmatter: { time_entries: updatedTimeEntries, expenses: updatedExpenses },
      };
      if (isOnline()) {
        await api.brain.updatePage(caseUpdatePayload);
      } else {
        await enqueueMutation({ type: "updatePage", payload: caseUpdatePayload });
      }

      const nextInvoices = [invoice, ...invoices];
      const nextCases = cases.map((ca) =>
        ca.slug === c.slug
          ? { ...ca, timeEntries: updatedTimeEntries, expenses: updatedExpenses }
          : ca
      );
      setInvoices(nextInvoices);
      setCases(nextCases);
      await setCache<InvoicingCache>(OFFLINE_KEYS.invoices, {
        invoices: nextInvoices,
        cases: nextCases,
      });

      addToast({ type: "success", title: t("inv.quick_created" as DashboardKey) });
      onOpenChange(false);
      if (onCreated) onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("inv.quick_create_failed" as DashboardKey);
      addToast({ type: "error", title: msg });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!selectedCaseSlug && hasBillable;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                <FileText size={16} className="text-emerald-600" />
              </div>
              <DialogTitle>{t("inv.quick_title" as DashboardKey)}</DialogTitle>
            </div>
            <DialogDescription>{t("inv.quick_desc" as DashboardKey)}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-2">
            {/* Case selection */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-invoice-case" className="text-xs">
                {t("inv.select_case" as DashboardKey)} *
              </Label>
              <Select
                value={selectedCaseSlug}
                onValueChange={setSelectedCaseSlug}
                disabled={loadingCases}
              >
                <SelectTrigger id="quick-invoice-case">
                  <SelectValue placeholder={t("inv.select_case" as DashboardKey)} />
                </SelectTrigger>
                <SelectContent>
                  {cases.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.caseNumber} — {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Billable summary */}
            {selectedCaseSlug && (
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
                {hasBillable ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">
                        {openTime.length} {t("inv.open_bookings" as DashboardKey)}
                      </span>
                      <span className="font-medium text-[color:var(--ds-text)]">
                        {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}min
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">
                        {openExpenses.length} {t("inv.expenses" as DashboardKey)}
                      </span>
                      <span className="font-medium text-[color:var(--ds-text)]">
                        {expenseTotal.toFixed(2)} €
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-[color:var(--ds-border)] pt-2">
                      <span className="text-[color:var(--ds-text-muted)]">
                        {t("inv.fee_estimated" as DashboardKey)}
                      </span>
                      <span className="font-bold text-emerald-600">
                        {estimatedFee.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertTriangle size={14} />
                    {t("inv.no_billable" as DashboardKey)}
                  </div>
                )}
              </div>
            )}

            {/* Invoice type + Advance payment */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-invoice-type" className="text-xs">
                  {t("inv.invoice_type" as DashboardKey)}
                </Label>
                <Select
                  value={invoiceType}
                  onValueChange={(v) => setInvoiceType(v as Invoice["invoiceType"])}
                >
                  <SelectTrigger id="quick-invoice-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVOICE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {t(o.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-advance" className="text-xs">
                  {t("inv.advance_payment" as DashboardKey)}
                </Label>
                <Input
                  id="quick-advance"
                  type="number"
                  step="0.01"
                  value={advancePayment}
                  onChange={(e) => setAdvancePayment(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>

            {/* RVG Calculator (collapsible) */}
            <button
              type="button"
              onClick={() => setShowRvg((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
            >
              <Calculator size={13} />
              {showRvg
                ? t("inv.quick_hide_rvg" as DashboardKey)
                : t("inv.quick_show_rvg" as DashboardKey)}
            </button>

            {showRvg && (
              <div className="space-y-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="quick-rvg-sw" className="text-xs">
                    {t("inv.rvg_streitwert" as DashboardKey)} (€)
                  </Label>
                  <Input
                    id="quick-rvg-sw"
                    type="number"
                    value={streitwert}
                    onChange={(e) => {
                      setStreitwert(e.target.value);
                      const sv = parseFloat(e.target.value);
                      setRvgResult(sv > 0 ? calculateRvg(sv) : null);
                    }}
                    placeholder="z. B. 10000"
                  />
                </div>
                {rvgResult && (
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">{t("inv.rvg_basis" as DashboardKey)} (1,0)</span>
                      <span className="text-[color:var(--ds-text)]">{rvgResult.basisGebuehr.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">{t("inv.rvg_verfahren" as DashboardKey)} (1,3)</span>
                      <span className="text-[color:var(--ds-text)]">{rvgResult.verfahrensgebuehr.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">{t("inv.rvg_termins" as DashboardKey)} (1,2)</span>
                      <span className="text-[color:var(--ds-text)]">{rvgResult.terminsgebuehr.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between font-semibold text-emerald-600 border-t border-[color:var(--ds-border)] pt-1.5">
                      <span>{t("inv.rvg_brutto" as DashboardKey)}</span>
                      <span>{rvgResult.summeBrutto.toFixed(2)} €</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-[color:var(--ds-border)] px-6 py-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-[color:var(--ds-text-muted)]"
              >
                {t("inv.quick_cancel" as DashboardKey)}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting || !canSubmit}
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {t("inv.create" as DashboardKey)}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
