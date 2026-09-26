"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FileText,
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
  RefreshCw,
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
  invoiceCaseFromPage,
  invoiceErrorText,
  invoiceFromPage,
  invoiceOverview,
  sumOfTotals,
  type Invoice,
  type InvoiceCase,
  type InvoicingCache,
} from "@/lib/invoicing-view";
import { invoicePrintHtml } from "@/lib/invoice-print-html";
import { loadKanzleiSettings, type KanzleiSettings, vatRateFor } from "@/lib/kanzlei-settings";
import { OFFLINE_KEYS, getCache, isOnline, setCache } from "@/lib/offline-store";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { SearchBar } from "@/components/dashboard/search-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowSkeleton, Skeleton } from "@/components/dashboard/skeleton";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { InvoiceQuickCreateDialog } from "@/components/legal/InvoiceQuickCreateDialog";
import { HubMenuLink, IconAction, InvoiceStat } from "@/components/legal/invoicing-parts";

const STATUS_CONFIG: Record<string, { labelKey: DashboardKey; color: StatusColor }> = {
  draft: { labelKey: "inv.status_draft", color: "gray" },
  sent: { labelKey: "inv.status_sent", color: "blue" },
  paid: { labelKey: "inv.status_paid", color: "emerald" },
  overdue: { labelKey: "inv.status_overdue", color: "red" },
  cancelled: { labelKey: "inv.status_cancelled", color: "gray" },
};

export default function InvoicingPage() {
  const confirm = useConfirm();
  const { t, lang } = useLang();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cases, setCases] = useState<InvoiceCase[]>([]);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  /** The list could not be loaded and no offline copy exists — never shown as "no invoices". */
  const [loadError, setLoadError] = useState(false);
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
    setLoadError(false);
    try {
      // Every invoice and matter (read in batches of 100): a list cut at 200
      // would hide invoices and their open amounts without a word.
      const batch = await api.brain.batchListPagesDetailed(["invoice", "legal_case"], 10_000);
      if (batch.errors.length) throw new Error(`batch list failed: ${batch.errors.join(",")}`);
      const invoicePages = batch.results["invoice"] ?? [];
      const casePages = batch.results["legal_case"] ?? [];
      const loadedInvoices: Invoice[] = invoicePages.map(invoiceFromPage);
      const loadedCases: InvoiceCase[] = casePages.map(invoiceCaseFromPage);
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
        setLoadError(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function printInvoice(inv: Invoice) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const settings = kanzlei ?? (await loadKanzleiSettings());
    const vatRate = inv.vatRate ?? vatRateFor(settings);
    const html = invoicePrintHtml(inv, settings, vatRate, lang);
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
      taxBreakdown: inv.taxBreakdown,
      reverseCharge: inv.reverseCharge,
      clientVatId: inv.clientVatId,
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
    try {
      const res = await csrfFetch("/api/e-invoice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          invoiceSlug: inv.id,
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
    setStatusMessage("ZUGFeRD-PDF wird erstellt …");
    try {
      const res = await csrfFetch("/api/e-invoice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "zugferd_scratch",
          invoiceSlug: inv.id,
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

  async function sendEInvoiceAction(inv: Invoice, channel: "peppol" | "erechnung_gv_at") {
    setStatusMessage(
      channel === "peppol"
        ? "PEPPOL-Übertragung läuft …"
        : "Übertragung an e-Rechnung.gv.at läuft …"
    );
    try {
      const res = await csrfFetch("/api/e-invoice/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Nur den Slug senden — Belegdaten und Kanzlei-Settings (inkl. IBAN)
        // lädt die Route serverseitig, damit kein manipulierter Client
        // Rechnungs-XML mit fremden Daten unter Kanzlei-Identität erzeugt.
        body: JSON.stringify({
          channel,
          format: channel === "erechnung_gv_at" ? "ebinterface" : "xrechnung",
          receiver_id: inv.leitwegId,
          invoiceSlug: inv.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(
          invoiceErrorText(data.error, "e-Rechnung konnte nicht versendet werden."),
          "error",
          6000
        );
        return;
      }
      const payload = data.data ?? data;
      setStatusMessage(
        payload.message,
        payload.status === "not_configured" ? "error" : "success",
        8000
      );
      // A delivered draft is issued by the server (status "sent" + open item).
      if (payload.issued) void loadAll();
      // Transport-Referenz persistieren, damit der Zustellstatus später
      // gepollt werden kann (queued → delivered).
      if (payload.reference && (payload.status === "queued" || payload.status === "delivered")) {
        const refFrontmatter = {
          e_invoice_channel: channel,
          e_invoice_reference: payload.reference,
          e_invoice_status: payload.status,
        };
        try {
          await api.invoices.update(inv.id, refFrontmatter);
          setInvoices((prev) =>
            prev.map((i) =>
              i.id === inv.id
                ? {
                    ...i,
                    eInvoiceChannel: channel,
                    eInvoiceReference: payload.reference,
                    eInvoiceStatus: payload.status,
                  }
                : i
            )
          );
        } catch {
          // Referenz-Persistenz ist best-effort — Versand selbst war erfolgreich.
        }
      }
    } catch (err) {
      setStatusMessage("e-Rechnung konnte nicht versendet werden.", "error", 6000);
      console.error("[e-invoice] send failed:", err);
    }
  }

  async function pollEInvoice(inv: Invoice) {
    if (!inv.eInvoiceChannel || !inv.eInvoiceReference || busySlug) return;
    setBusySlug(inv.id);
    setStatusMessage("Zustellstatus wird abgefragt …");
    try {
      const res = await fetch(
        `/api/e-invoice/send?channel=${inv.eInvoiceChannel}&reference=${encodeURIComponent(inv.eInvoiceReference)}`,
        { credentials: "same-origin" }
      );
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(
          invoiceErrorText(data.error, "Statusabfrage fehlgeschlagen."),
          "error",
          6000
        );
        return;
      }
      const payload = data.data ?? data;
      setStatusMessage(payload.message, payload.status === "failed" ? "error" : "success", 8000);
      if (payload.status !== inv.eInvoiceStatus) {
        try {
          await api.invoices.update(inv.id, { e_invoice_status: payload.status });
        } catch {
          // best-effort
        }
        setInvoices((prev) =>
          prev.map((i) => (i.id === inv.id ? { ...i, eInvoiceStatus: payload.status } : i))
        );
      }
    } catch {
      setStatusMessage("Statusabfrage fehlgeschlagen.", "error", 6000);
    } finally {
      setBusySlug(null);
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
      const statusFrontmatter = {
        status,
        ...(status === "paid"
          ? { paid_at: paidPatch.paidAt, paid_amount: paidPatch.paidAmount }
          : {}),
      };
      // Only online: /api/invoices/[slug] checks sums and mandatory details
      // before a draft is issued and keeps issued invoices frozen. A queued
      // generic page write would bypass both (and is refused on replay).
      if (!isOnline()) {
        setStatusMessage(t("inv.online_only_action" as DashboardKey), "error");
        return;
      }
      await api.invoices.update(inv.id, statusFrontmatter);
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
    // Only online: /api/invoices/[slug] deletes drafts only and releases
    // their billed work for a corrected invoice.
    if (!isOnline()) {
      setStatusMessage(t("inv.online_only_action" as DashboardKey), "error");
      return;
    }
    try {
      await api.invoices.delete(inv.id);
      const nextInvoices = invoices.filter((i) => i.id !== inv.id);
      setInvoices(nextInvoices);
      await setCache<InvoicingCache>(OFFLINE_KEYS.invoices, { invoices: nextInvoices, cases });
      setStatusMessage(`${inv.number} ${t("inv.deleted")}`, "success", 4000);
    } catch (err) {
      console.error("[invoicing] delete failed:", err instanceof Error ? err.message : err);
      setStatusMessage(t("inv.delete_fail"), "error");
    }
  }

  // A sent/paid/overdue invoice can't be edited in place (immutability —
  // see api.invoices.update above). Correcting a mistake means issuing a
  // Storno-Note instead: a second, negated invoice referencing this one via
  // parent_invoice_id (api/invoices/[slug]/storno/route.ts), never touching
  // the original. This tracks which invoices already have one so the
  // action only offers itself once.
  const stornoedInvoiceSlugs = useMemo(
    () =>
      new Set(
        invoices
          .filter((i) => i.invoiceType === "storno" && i.parentInvoiceId)
          .map((i) => i.parentInvoiceId as string)
      ),
    [invoices]
  );

  async function stornoInvoice(inv: Invoice) {
    if (busySlug) return;
    const ok = await confirm({
      title: "Rechnung stornieren",
      message: `Für ${inv.number} wird eine eigene Storno-Note mit negierten Beträgen erstellt. Die Originalrechnung bleibt unverändert bestehen (GoBD-Grundsatz), erscheint danach aber als storniert.`,
      confirmLabel: "Storno-Note erstellen",
      variant: "danger",
    });
    if (!ok) return;
    setBusySlug(inv.id);
    setStatusMessage(null);
    try {
      await api.invoices.storno(inv.id);
      await loadAll();
      setStatusMessage(`Storno-Note für ${inv.number} erstellt.`, "success", 5000);
    } catch (err) {
      console.error("[invoicing] storno failed:", err instanceof Error ? err.message : err);
      setStatusMessage("Storno-Note konnte nicht erstellt werden.", "error");
    } finally {
      setBusySlug(null);
    }
  }

  const filtered = invoices.filter(
    (inv) =>
      inv.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.client.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { drafts, outstanding, overdueCount, paid } = invoiceOverview(invoices);
  const en = lang === "en";
  const countLabel = (n: number) =>
    en ? `${n} ${n === 1 ? "invoice" : "invoices"}` : `${n} ${n === 1 ? "Rechnung" : "Rechnungen"}`;
  const positionsLabel = (n: number) =>
    en ? `${n} ${n === 1 ? "item" : "items"}` : `${n} ${n === 1 ? "Position" : "Positionen"}`;
  const canSend = userRole === "admin" || userRole === "lawyer" || userRole === "assistant";
  const canManage = userRole === "admin" || userRole === "lawyer";

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
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
            <PrimaryAction onClick={() => setQuickCreateOpen(true)}>
              {t("inv.create")}
            </PrimaryAction>
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
            value={formatEur(sumOfTotals(drafts), lang)}
            sub={countLabel(drafts.length)}
          />
          <InvoiceStat
            label={t("inv.outstanding")}
            value={formatEur(sumOfTotals(outstanding), lang)}
            sub={
              overdueCount > 0
                ? `${countLabel(outstanding.length)} · ${overdueCount} ${t("inv.status_overdue").toLowerCase()}`
                : countLabel(outstanding.length)
            }
            tone={overdueCount > 0 ? "danger" : outstanding.length > 0 ? "warning" : undefined}
          />
          <InvoiceStat
            label={t("inv.paid")}
            value={formatEur(sumOfTotals(paid), lang)}
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
      ) : loadError ? (
        <EmptyState
          icon={AlertTriangle}
          title={en ? "Invoices could not be loaded" : "Rechnungen konnten nicht geladen werden"}
          description={
            en
              ? "The list is not empty — it could not be read. Please try again."
              : "Die Liste ist nicht leer, sie konnte nur nicht gelesen werden. Bitte erneut versuchen."
          }
          actionLabel={en ? "Try again" : "Erneut laden"}
          onAction={() => void loadAll()}
        />
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
                      {canManage && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => void sendEInvoiceAction(inv, "erechnung_gv_at")}
                            disabled={busy}
                            className="gap-2 text-xs"
                          >
                            <Send size={13} />
                            {t("inv.einvoice_send_erv")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void sendEInvoiceAction(inv, "peppol")}
                            disabled={busy}
                            className="gap-2 text-xs"
                          >
                            <Send size={13} />
                            {t("inv.einvoice_send_peppol")}
                          </DropdownMenuItem>
                          {inv.eInvoiceReference && (
                            <DropdownMenuItem
                              onClick={() => void pollEInvoice(inv)}
                              disabled={busy}
                              className="gap-2 text-xs"
                            >
                              <RefreshCw size={13} />
                              Zustellstatus prüfen
                              {inv.eInvoiceStatus ? ` (${inv.eInvoiceStatus})` : ""}
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                      {canManage && inv.status === "draft" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => void deleteInvoice(inv)}
                            disabled={busy}
                            className="gap-2 text-xs text-[color:var(--ds-danger-text)] focus:text-[color:var(--ds-danger-text)]"
                          >
                            <XCircle size={13} />
                            {t("inv.cancel_invoice")}
                          </DropdownMenuItem>
                        </>
                      )}
                      {canManage &&
                        (inv.status === "sent" ||
                          inv.status === "paid" ||
                          inv.status === "overdue") &&
                        !stornoedInvoiceSlugs.has(inv.id) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => void stornoInvoice(inv)}
                              disabled={busy}
                              className="gap-2 text-xs text-[color:var(--ds-danger-text)] focus:text-[color:var(--ds-danger-text)]"
                            >
                              <XCircle size={13} />
                              Stornieren (Storno-Note erstellen)
                            </DropdownMenuItem>
                          </>
                        )}
                      {stornoedInvoiceSlugs.has(inv.id) && (
                        <div className="px-2 py-1.5 text-xs text-[color:var(--ds-text-subtle)]">
                          Bereits storniert
                        </div>
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
