"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  Plus,
  Search,
  Trash2,
  ChevronRight,
  Download,
  AlertCircle,
  RefreshCw,
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  FileBarChart,
  Scale,
  Lock,
  CheckCircle2,
} from "lucide-react";
import {
  TRANSACTION_TYPE_LABELS_DE,
  TRANSACTION_TYPE_COLORS,
  RECONCILIATION_STATUS_LABELS_DE,
  exportTransactionsCsv,
  generateQuarterlyReport,
  matterBalances,
  signedAmount,
  type BookableTrustType,
  type TrustTransaction,
  type ReconciliationStatus,
} from "@/lib/trust-accounting";
import { caseFrontmatter } from "@/lib/legal-types";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/dashboard/skeleton";
import type { BrainPage } from "@/lib/types";

interface TrustAccount {
  slug: string;
  title?: string;
  frontmatter?: {
    type?: string;
    account_name?: string;
    account_number?: string;
    bank_name?: string;
    iban?: string;
    bic?: string;
    status?: "active" | "frozen" | "closed" | "overdrawn";
    currency?: string;
    opening_balance?: number;
    current_balance?: number;
    matter_slug?: string;
    matter_title?: string;
    client_name?: string;
    transactions?: TrustTransaction[];
    created_at?: string;
    updated_at?: string;
  };
}

const TX_TYPES: Exclude<BookableTrustType, "reversal">[] = [
  "deposit",
  "withdrawal",
  "fee",
  "interest",
];

function formatCurrency(amount: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("de-AT", { style: "currency", currency }).format(
    Number.isFinite(amount) ? amount : 0
  );
}

/**
 * Error → Klartext. Server-side refusals for bookings are already German
 * sentences and stay as they are; rate limits, network failures and technical
 * codes are replaced with a plain explanation.
 */
function plainError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!msg) return fallback;
  if (/too many|rate.?limit|slow down|429/i.test(msg))
    return "Zu viele Anfragen in kurzer Zeit. Bitte warten Sie einen Moment und laden Sie die Seite neu.";
  if (/failed to fetch|network|timeout|ECONN|HTTP \d|^[a-z0-9_.]+$|[{}]|internal/i.test(msg))
    return fallback;
  if (/\b(the|please|error|not|cannot|invalid)\b/i.test(msg)) return fallback;
  return msg;
}

export default function TrustAccountingPage() {
  const { t } = useLang();
  const confirm = useConfirm();

  const [accounts, setAccounts] = useState<TrustAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Create form
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newBank, setNewBank] = useState("");
  const [newIban, setNewIban] = useState("");
  const [newBic, setNewBic] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newMatter, setNewMatter] = useState("");

  // Transaction form
  const [txType, setTxType] = useState<Exclude<BookableTrustType, "reversal">>("deposit");
  const [txAmount, setTxAmount] = useState(0);
  const [txDescription, setTxDescription] = useState("");
  const [txReference, setTxReference] = useState("");
  const [txMatterSlug, setTxMatterSlug] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cases, setCases] = useState<BrainPage[]>([]);

  // Reconciliation form
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcileBankBalance, setReconcileBankBalance] = useState(0);
  const [reconcileNotes, setReconcileNotes] = useState("");
  const [reconcileStep, setReconcileStep] = useState<"input" | "review" | "done">("input");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.legal.trustAccounts.list({ limit: 100 });
      setAccounts(data as unknown as TrustAccount[]);
    } catch (err) {
      console.error("[trust] load failed:", err instanceof Error ? err.message : err);
      setError(
        plainError(
          err,
          "Die Treuhandkonten konnten nicht geladen werden. Bitte laden Sie die Seite neu."
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    api.brain
      .listPages({ type: "legal_case", limit: 200 })
      .then(setCases)
      .catch(() => setCases([]));
  }, []);

  const caseTitle = useCallback(
    (slug?: string) => {
      if (!slug) return "Ohne Akte (Altbestand)";
      const c = cases.find((x) => x.slug === slug);
      if (!c) return slug;
      const nr = caseFrontmatter(c).case_number;
      return nr ? `${nr} – ${c.title}` : c.title;
    },
    [cases]
  );

  const filtered = useMemo(() => {
    if (!search) return accounts;
    const q = search.toLowerCase();
    return accounts.filter((a) => {
      const fm = a.frontmatter;
      const name = (fm?.account_name ?? a.title ?? "").toLowerCase();
      const num = (fm?.account_number ?? "").toLowerCase();
      const client = (fm?.client_name ?? "").toLowerCase();
      return name.includes(q) || num.includes(q) || client.includes(q);
    });
  }, [accounts, search]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.slug === selectedSlug),
    [accounts, selectedSlug]
  );

  const sortedTxs = useMemo(() => {
    if (!selectedAccount?.frontmatter?.transactions) return [];
    return [...selectedAccount.frontmatter.transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [selectedAccount]);

  async function handleCreate() {
    if (!newName || !newNumber) return;
    setSaving(true);
    try {
      await api.legal.trustAccounts.create({
        accountName: newName,
        accountNumber: newNumber,
        bankName: newBank || undefined,
        iban: newIban || undefined,
        bic: newBic || undefined,
        clientName: newClient || undefined,
        matterTitle: newMatter || undefined,
      });
      showToast(t("trust.success_created" as DashboardKey));
      setShowCreate(false);
      setNewName("");
      setNewNumber("");
      setNewBank("");
      setNewIban("");
      setNewBic("");
      setNewClient("");
      setNewMatter("");
      await loadAccounts();
    } catch (err) {
      setError(
        plainError(err, "Das Konto konnte nicht angelegt werden. Bitte versuchen Sie es erneut.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTransaction() {
    if (!selectedAccount || !txDescription.trim() || !txMatterSlug || !(txAmount > 0)) return;
    setSaving(true);
    setTxError(null);
    try {
      const res = await api.legal.trustAccounts.addTransaction(selectedAccount.slug, {
        type: txType,
        amount: Math.round(txAmount * 100) / 100,
        description: txDescription.trim(),
        matterSlug: txMatterSlug,
        matterTitle: caseTitle(txMatterSlug),
        reference: txReference.trim() || undefined,
      });
      showToast(t("trust.success_saved" as DashboardKey));
      setNotice(res.warnings?.[0] ?? null);
      setShowAddTx(false);
      setTxType("deposit");
      setTxAmount(0);
      setTxDescription("");
      setTxReference("");
      await loadAccounts();
    } catch (err) {
      // Stay in the dialog and say why the booking was refused.
      setTxError(
        plainError(err, "Die Buchung wurde nicht gespeichert. Bitte versuchen Sie es erneut.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleReverse(tx: TrustTransaction) {
    if (!selectedAccount) return;
    const ok = await confirm({
      title: `Buchung Nr. ${tx.number ?? "–"} stornieren?`,
      message: `Eine Gegenbuchung über ${formatCurrency(tx.amount, tx.currency)} wird erfasst. Die ursprüngliche Buchung bleibt sichtbar.`,
      confirmLabel: "Stornieren",
      variant: "danger",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.legal.trustAccounts.addTransaction(selectedAccount.slug, {
        type: "reversal",
        amount: tx.amount,
        reversesId: tx.id,
        matterSlug: tx.matterSlug ?? "",
        description: `Storno zu Nr. ${tx.number ?? "–"}: ${tx.description}`,
      });
      showToast("Buchung storniert.");
      await loadAccounts();
    } catch (err) {
      setError(
        plainError(err, "Das Storno wurde nicht gespeichert. Bitte versuchen Sie es erneut.")
      );
    } finally {
      setSaving(false);
    }
  }

  const reconciliations = useMemo(() => {
    if (!selectedAccount?.frontmatter) return [];
    const raw = (selectedAccount.frontmatter as Record<string, unknown>).reconciliations as
      | Array<{
          id: string;
          date: string;
          bankBalance: number;
          bookBalance: number;
          difference: number;
          status: ReconciliationStatus;
          reconciledBy?: string;
          notes?: string;
        }>
      | undefined;
    return raw ?? [];
  }, [selectedAccount]);

  const overdueReconciliation = useMemo(() => {
    if (!selectedAccount?.frontmatter?.transactions) return false;
    const now = new Date();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    const currentYear = now.getFullYear();
    const hasCurrentQuarter = reconciliations.some((r) => {
      const rDate = new Date(r.date);
      return (
        Math.floor(rDate.getMonth() / 3) + 1 === currentQuarter &&
        rDate.getFullYear() === currentYear
      );
    });
    // Show warning if we're past month 1 of the quarter and no reconciliation exists
    const quarterStartMonth = (currentQuarter - 1) * 3;
    const isPastGracePeriod = now.getMonth() > quarterStartMonth;
    return isPastGracePeriod && !hasCurrentQuarter;
  }, [selectedAccount, reconciliations]);

  async function handleReconcile() {
    if (!selectedAccount) return;
    setSaving(true);
    try {
      // The server computes the book balance and records who reconciled.
      const { reconciliation } = await api.legal.trustAccounts.reconcile(selectedAccount.slug, {
        bankBalance: Math.round(reconcileBankBalance * 100) / 100,
        notes: reconcileNotes || undefined,
      });
      const difference = Number(reconciliation.difference ?? 0);
      showToast(
        difference === 0
          ? "Quartalsabstimmung erfolgreich — Saldo ausgeglichen."
          : `Quartalsabstimmung gespeichert — Differenz: ${formatCurrency(Math.abs(difference), selectedAccount.frontmatter?.currency)}`
      );
      setReconcileStep("done");
      await loadAccounts();
    } catch (err) {
      setError(
        plainError(err, "Die Abstimmung wurde nicht gespeichert. Bitte versuchen Sie es erneut.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedAccount) return;
    const ok = await confirm({ message: t("trust.delete_confirm" as DashboardKey) });
    if (!ok) return;
    setSaving(true);
    try {
      await api.legal.trustAccounts.delete(selectedAccount.slug);
      showToast(t("trust.success_deleted" as DashboardKey));
      setSelectedSlug(null);
      await loadAccounts();
    } catch (err) {
      setError(
        plainError(err, "Das Konto konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.")
      );
    } finally {
      setSaving(false);
    }
  }

  function handleExportCsv() {
    if (!selectedAccount?.frontmatter?.transactions) return;
    const csv = exportTransactionsCsv(selectedAccount.frontmatter.transactions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `anderkonto-${selectedAccount.slug.replace(/\//g, "-")}.csv`;
    a.click();
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("trust.title" as DashboardKey)}
        description={t("trust.description" as DashboardKey)}
        breadcrumbs={[
          { label: "Übersicht", href: "/dashboard" },
          { label: t("trust.title" as DashboardKey) },
        ]}
        actions={
          <Button
            variant="primary"
            size="sm"
            className="whitespace-nowrap"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} aria-hidden="true" />
            {t("trust.new" as DashboardKey)}
          </Button>
        }
      />

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => void loadAccounts()}
          >
            Erneut laden
          </Button>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-xs"
            aria-label="Hinweis schließen"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed right-6 bottom-6 z-50 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm text-[color:var(--ds-text)] shadow-[var(--ds-shadow-2)]"
        >
          {toast}
        </div>
      )}

      {/* Filters — only once there is something to filter */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("trust.search" as DashboardKey)}
              className="pl-9"
            />
          </div>
          <Button
            variant="ghost"
            onClick={loadAccounts}
            className="gap-2 text-sm"
            aria-label={t("common.refresh" as DashboardKey)}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && accounts.length === 0 && (
        <div
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Konten werden geladen"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state — never while a load error is showing */}
      {!loading &&
        !error &&
        filtered.length === 0 &&
        (search ? (
          <EmptyState
            icon={Wallet}
            title="Keine passenden Konten"
            description="Kein Konto entspricht Ihrer Suche nach Bezeichnung, Kontonummer oder Mandant."
          />
        ) : (
          <EmptyState
            icon={Wallet}
            title={t("trust.empty" as DashboardKey)}
            description="Legen Sie Ihr Anderkonto an und buchen Sie Fremdgeld je Akte — mit fortlaufender Nummerierung und Quartalsabstimmung."
            actionLabel={t("trust.new" as DashboardKey)}
            onAction={() => setShowCreate(true)}
          />
        ))}

      {/* Account cards */}
      {filtered.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const fm = a.frontmatter!;
            const balance = fm.current_balance ?? 0;
            const isOverdrawn = balance < 0;
            return (
              <button
                key={a.slug}
                onClick={() => setSelectedSlug(a.slug)}
                className="group rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-left transition-[background-color,border-color,color,box-shadow,transform,opacity] hover:border-[color:var(--brand-primary)] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-[color:var(--ds-text-muted)]" />
                    <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                      {fm.account_name ?? a.title}
                    </span>
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-[color:var(--ds-text-subtle)] transition-transform group-hover:translate-x-1"
                  />
                </div>
                <div className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
                  <div className="font-mono">{fm.account_number}</div>
                  {fm.client_name && <div>{fm.client_name}</div>}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Badge variant="default" className="text-xs">
                    {t(`trust.status_${fm.status ?? "active"}` as DashboardKey)}
                  </Badge>
                  <span
                    className={`text-sm font-semibold tabular-nums ${isOverdrawn ? "text-[color:var(--ds-danger-text)]" : "text-[color:var(--ds-text)]"}`}
                  >
                    {formatCurrency(balance, fm.currency)}
                  </span>
                </div>
                {isOverdrawn && (
                  <div className="mt-2 text-xs text-[color:var(--ds-danger-text)]">
                    {t("trust.warning_overdrawn" as DashboardKey)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      {selectedAccount && (
        <Dialog open={!!selectedSlug} onOpenChange={(open) => !open && setSelectedSlug(null)}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck size={18} />
                {selectedAccount.frontmatter?.account_name ?? selectedAccount.title}
              </DialogTitle>
              <DialogDescription>
                {selectedAccount.frontmatter?.account_number}
                {selectedAccount.frontmatter?.iban &&
                  ` · IBAN: ${selectedAccount.frontmatter.iban}`}
              </DialogDescription>
            </DialogHeader>

            {/* Balance */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("trust.opening_balance" as DashboardKey)}
                </div>
                <div className="mt-1 text-lg font-bold text-[color:var(--ds-text)]">
                  {formatCurrency(
                    selectedAccount.frontmatter?.opening_balance ?? 0,
                    selectedAccount.frontmatter?.currency
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("trust.current_balance" as DashboardKey)}
                </div>
                <div
                  className={`mt-1 text-lg font-semibold tabular-nums ${(selectedAccount.frontmatter?.current_balance ?? 0) < 0 ? "text-[color:var(--ds-danger-text)]" : "text-[color:var(--ds-text)]"}`}
                >
                  {formatCurrency(
                    selectedAccount.frontmatter?.current_balance ?? 0,
                    selectedAccount.frontmatter?.currency
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setShowAddTx(true)}
              >
                <Plus size={14} />
                {t("trust.add_transaction" as DashboardKey)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleExportCsv}
              >
                <Download size={14} />
                {t("trust.export_csv" as DashboardKey)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => {
                  setReconcileBankBalance(selectedAccount.frontmatter?.current_balance ?? 0);
                  setReconcileNotes("");
                  setReconcileStep("input");
                  setShowReconcile(true);
                }}
              >
                <Scale size={14} />
                Quartalsabstimmung
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:text-[color:var(--ds-danger-text)]"
                onClick={handleDelete}
                disabled={saving}
              >
                <Trash2 size={14} />
                {t("trust.delete" as DashboardKey)}
              </Button>
            </div>

            {notice && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                <span>{notice}</span>
              </div>
            )}

            {/* Guthaben je Akte */}
            {sortedTxs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  Guthaben je Akte
                </h4>
                <ul className="divide-y divide-[color:var(--ds-border)] rounded-lg border border-[color:var(--ds-border)] text-sm">
                  {[...matterBalances(sortedTxs).entries()].map(([slug, balance]) => (
                    <li
                      key={slug || "none"}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-[color:var(--ds-text)]">
                        {caseTitle(slug || undefined)}
                      </span>
                      <span
                        className={`shrink-0 font-medium tabular-nums ${balance < 0 ? "text-[color:var(--ds-danger-text)]" : "text-[color:var(--ds-text)]"}`}
                      >
                        {formatCurrency(balance, selectedAccount.frontmatter?.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Transactions */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("trust.transactions" as DashboardKey)}
              </h4>
              {sortedTxs.length === 0 ? (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("trust.no_transactions" as DashboardKey)}
                </p>
              ) : (
                sortedTxs.map((tx) => {
                  const signed = signedAmount(tx, sortedTxs);
                  const reversed = Boolean(tx.reversedById);
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                    >
                      <div className="shrink-0">
                        {signed >= 0 ? (
                          <ArrowDownCircle
                            size={16}
                            style={{ color: TRANSACTION_TYPE_COLORS[tx.type] }}
                            aria-hidden
                          />
                        ) : (
                          <ArrowUpCircle
                            size={16}
                            style={{ color: TRANSACTION_TYPE_COLORS[tx.type] }}
                            aria-hidden
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm font-medium text-[color:var(--ds-text)] ${reversed ? "line-through" : ""}`}
                        >
                          {tx.number ? `Nr. ${tx.number} · ` : ""}
                          {tx.description}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-[color:var(--ds-text-muted)]">
                          <span>{TRANSACTION_TYPE_LABELS_DE[tx.type]}</span>
                          <span>· {formatDate(tx.date)}</span>
                          <span>· {caseTitle(tx.matterSlug)}</span>
                          {tx.reference && <span>· {tx.reference}</span>}
                          {tx.createdBy && <span>· {tx.createdBy}</span>}
                          {reversed && <Badge variant="warning">storniert</Badge>}
                        </div>
                      </div>
                      <div
                        className="shrink-0 text-sm font-bold tabular-nums"
                        style={{ color: TRANSACTION_TYPE_COLORS[tx.type] }}
                      >
                        {signed >= 0 ? "+" : "−"}
                        {formatCurrency(Math.abs(signed), tx.currency)}
                      </div>
                      {tx.type !== "reversal" && !reversed && tx.number && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => void handleReverse(tx)}
                          aria-label={`Buchung Nr. ${tx.number} stornieren`}
                        >
                          Storno
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Overdue Reconciliation Warning */}
            {overdueReconciliation && (
              <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]">
                <AlertCircle size={16} />
                <span>Die Quartalsabstimmung für dieses Anderkonto ist überfällig.</span>
              </div>
            )}

            {/* Reconciliation History */}
            {reconciliations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">Abstimmungen</h4>
                {reconciliations
                  .slice()
                  .reverse()
                  .map((rec) => (
                    <div
                      key={rec.id}
                      className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                    >
                      <div className="shrink-0">
                        {rec.status === "balanced" ? (
                          <CheckCircle2 size={16} className="text-[color:var(--ds-success-text)]" />
                        ) : rec.status === "discrepancy" ? (
                          <AlertCircle size={16} className="text-[color:var(--ds-warning-text)]" />
                        ) : (
                          <Scale size={16} className="text-[color:var(--ds-text-muted)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[color:var(--ds-text)]">
                            {formatDate(rec.date)}
                          </span>
                          <Badge
                            variant="default"
                            className={`text-[10px] ${
                              rec.status === "balanced"
                                ? "border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]"
                                : rec.status === "discrepancy"
                                  ? "border-[color:var(--ds-warning-border)] text-[color:var(--ds-warning-text)]"
                                  : ""
                            }`}
                          >
                            {RECONCILIATION_STATUS_LABELS_DE[rec.status]}
                          </Badge>
                          {rec.notes && (
                            <span className="truncate text-xs text-[color:var(--ds-text-muted)]">
                              {rec.notes}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                          Bank:{" "}
                          {formatCurrency(rec.bankBalance, selectedAccount?.frontmatter?.currency)}
                          {" · "}
                          Buch:{" "}
                          {formatCurrency(rec.bookBalance, selectedAccount?.frontmatter?.currency)}
                          {" · "}
                          Differenz:{" "}
                          {formatCurrency(rec.difference, selectedAccount?.frontmatter?.currency)}
                        </div>
                      </div>
                      <Lock size={12} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                    </div>
                  ))}
              </div>
            )}

            {/* Quarterly Report */}
            {selectedAccount.frontmatter?.transactions &&
              (() => {
                const now = new Date();
                const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
                const currentYear = now.getFullYear();
                const report = generateQuarterlyReport(
                  {
                    slug: selectedAccount.slug,
                    accountName:
                      selectedAccount.frontmatter.account_name ?? selectedAccount.title ?? "",
                    accountNumber: selectedAccount.frontmatter.account_number ?? "",
                    openingBalance: selectedAccount.frontmatter.opening_balance ?? 0,
                    currentBalance: selectedAccount.frontmatter.current_balance ?? 0,
                    currency: selectedAccount.frontmatter.currency ?? "EUR",
                    transactions: selectedAccount.frontmatter.transactions,
                    reconciliations: [],
                    status: selectedAccount.frontmatter.status ?? "active",
                    createdAt: selectedAccount.frontmatter.created_at ?? "",
                    updatedAt: selectedAccount.frontmatter.updated_at ?? "",
                  },
                  currentQuarter,
                  currentYear
                );
                return (
                  <div className="space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
                    <div className="flex items-center gap-2">
                      <FileBarChart size={14} className="text-[color:var(--brand-primary)]" />
                      <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">
                        Quartalsbericht Q{currentQuarter} {currentYear}
                      </h4>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div>
                        <span className="text-[color:var(--ds-text-muted)]">Eröffnungssaldo</span>
                        <p className="font-semibold text-[color:var(--ds-text)]">
                          {formatCurrency(
                            report.openingBalance,
                            selectedAccount.frontmatter.currency
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-[color:var(--ds-text-muted)]">Einzahlungen</span>
                        <p className="font-semibold text-[color:var(--ds-success-text)]">
                          +
                          {formatCurrency(
                            report.totalDeposits,
                            selectedAccount.frontmatter.currency
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-[color:var(--ds-text-muted)]">Auszahlungen</span>
                        <p className="font-semibold text-[color:var(--ds-danger-text)]">
                          -
                          {formatCurrency(
                            report.totalWithdrawals,
                            selectedAccount.frontmatter.currency
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-[color:var(--ds-text-muted)]">Endsaldo</span>
                        <p className="font-semibold text-[color:var(--ds-text)]">
                          {formatCurrency(
                            report.closingBalance,
                            selectedAccount.frontmatter.currency
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 border-t border-[color:var(--ds-border)] pt-2 text-xs text-[color:var(--ds-text-muted)]">
                      <span>
                        Gebühren:{" "}
                        {formatCurrency(report.totalFees, selectedAccount.frontmatter.currency)}
                      </span>
                      <span>
                        Zinsen:{" "}
                        {formatCurrency(report.totalInterest, selectedAccount.frontmatter.currency)}
                      </span>
                      <span>Transaktionen: {report.transactionCount}</span>
                      {report.matters.length > 0 && <span>Akten: {report.matters.length}</span>}
                    </div>
                  </div>
                );
              })()}
          </DialogContent>
        </Dialog>
      )}

      {/* Add Transaction Dialog */}
      {showAddTx && selectedAccount && (
        <Dialog open={showAddTx} onOpenChange={setShowAddTx}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("trust.add_transaction" as DashboardKey)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="trust-tx-matter"
                  className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]"
                >
                  Akte *
                </label>
                <select
                  id="trust-tx-matter"
                  value={txMatterSlug}
                  onChange={(e) => setTxMatterSlug(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
                >
                  <option value="">Akte wählen</option>
                  {cases.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {caseTitle(c.slug)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="trust-tx-type"
                  className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]"
                >
                  {t("trust.tx_type" as DashboardKey)}
                </label>
                <select
                  id="trust-tx-type"
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as (typeof TX_TYPES)[number])}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
                >
                  {TX_TYPES.map((tp) => (
                    <option key={tp} value={tp}>
                      {TRANSACTION_TYPE_LABELS_DE[tp]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="trust-tx-amount"
                  className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]"
                >
                  {t("trust.tx_amount" as DashboardKey)} *
                </label>
                <Input
                  id="trust-tx-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0.01}
                  value={txAmount}
                  onChange={(e) => setTxAmount(Number(e.target.value))}
                />
              </div>
              <div>
                <label
                  htmlFor="trust-tx-description"
                  className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]"
                >
                  {t("trust.tx_description" as DashboardKey)} *
                </label>
                <Input
                  id="trust-tx-description"
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="trust-tx-reference"
                  className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]"
                >
                  {t("trust.tx_reference" as DashboardKey)}
                </label>
                <Input
                  id="trust-tx-reference"
                  value={txReference}
                  onChange={(e) => setTxReference(e.target.value)}
                />
              </div>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Buchungen sind unveränderlich und fortlaufend nummeriert. Fehler korrigieren Sie mit
                einem Storno.
              </p>
              {txError && (
                <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
                  {txError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowAddTx(false)}>
                {t("trust.cancel" as DashboardKey)}
              </Button>
              <Button
                variant="primary"
                className="brand-bg text-white"
                onClick={handleAddTransaction}
                disabled={saving || !txDescription.trim() || !txMatterSlug || !(txAmount > 0)}
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  t("trust.save" as DashboardKey)
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reconciliation Dialog */}
      {showReconcile && selectedAccount && (
        <Dialog open={showReconcile} onOpenChange={setShowReconcile}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Scale size={18} />
                Quartalsabstimmung
              </DialogTitle>
              <DialogDescription>
                {selectedAccount.frontmatter?.account_name ?? selectedAccount.title}
                {" · "}
                Buchsaldo:{" "}
                {formatCurrency(
                  selectedAccount.frontmatter?.current_balance ?? 0,
                  selectedAccount.frontmatter?.currency
                )}
              </DialogDescription>
            </DialogHeader>
            {reconcileStep === "input" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                    Bankbestand (Kontoauszug) *
                  </label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={reconcileBankBalance}
                    onChange={(e) => setReconcileBankBalance(Number(e.target.value))}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                    Notiz (optional)
                  </label>
                  <Input
                    value={reconcileNotes}
                    onChange={(e) => setReconcileNotes(e.target.value)}
                    placeholder="z. B. Kontoauszug vom 30.09."
                  />
                </div>
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[color:var(--ds-text-muted)]">Buchsaldo</span>
                    <span className="font-medium text-[color:var(--ds-text)]">
                      {formatCurrency(
                        selectedAccount.frontmatter?.current_balance ?? 0,
                        selectedAccount.frontmatter?.currency
                      )}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-[color:var(--ds-text-muted)]">Bankbestand</span>
                    <span className="font-medium text-[color:var(--ds-text)]">
                      {formatCurrency(reconcileBankBalance, selectedAccount.frontmatter?.currency)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-[color:var(--ds-border)] pt-1">
                    <span className="text-[color:var(--ds-text-muted)]">Differenz</span>
                    <span
                      className={`font-bold ${
                        Math.abs(
                          reconcileBankBalance - (selectedAccount.frontmatter?.current_balance ?? 0)
                        ) < 0.01
                          ? "text-[color:var(--ds-success-text)]"
                          : "text-[color:var(--ds-warning-text)]"
                      }`}
                    >
                      {formatCurrency(
                        reconcileBankBalance - (selectedAccount.frontmatter?.current_balance ?? 0),
                        selectedAccount.frontmatter?.currency
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {reconcileStep === "review" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    {Math.abs(
                      reconcileBankBalance - (selectedAccount.frontmatter?.current_balance ?? 0)
                    ) < 0.01 ? (
                      <CheckCircle2 size={18} className="text-[color:var(--ds-success-text)]" />
                    ) : (
                      <AlertCircle size={18} className="text-[color:var(--ds-warning-text)]" />
                    )}
                    <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                      {Math.abs(
                        reconcileBankBalance - (selectedAccount.frontmatter?.current_balance ?? 0)
                      ) < 0.01
                        ? "Saldo ausgeglichen"
                        : "Differenz festgestellt"}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">Buchsaldo (System)</span>
                      <span className="font-medium text-[color:var(--ds-text)]">
                        {formatCurrency(
                          selectedAccount.frontmatter?.current_balance ?? 0,
                          selectedAccount.frontmatter?.currency
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">
                        Bankbestand (Kontoauszug)
                      </span>
                      <span className="font-medium text-[color:var(--ds-text)]">
                        {formatCurrency(
                          reconcileBankBalance,
                          selectedAccount.frontmatter?.currency
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-[color:var(--ds-border)] pt-1.5">
                      <span className="font-medium text-[color:var(--ds-text)]">Differenz</span>
                      <span
                        className={`font-bold ${
                          Math.abs(
                            reconcileBankBalance -
                              (selectedAccount.frontmatter?.current_balance ?? 0)
                          ) < 0.01
                            ? "text-[color:var(--ds-success-text)]"
                            : "text-[color:var(--ds-warning-text)]"
                        }`}
                      >
                        {formatCurrency(
                          reconcileBankBalance -
                            (selectedAccount.frontmatter?.current_balance ?? 0),
                          selectedAccount.frontmatter?.currency
                        )}
                      </span>
                    </div>
                    {reconcileNotes && (
                      <div className="flex justify-between border-t border-[color:var(--ds-border)] pt-1.5">
                        <span className="text-[color:var(--ds-text-muted)]">Notiz</span>
                        <span className="text-[color:var(--ds-text)]">{reconcileNotes}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3 text-xs text-[color:var(--ds-warning-text)]">
                  <Lock size={14} className="mt-0.5 shrink-0" />
                  <span>Nach Bestätigung wird die Abstimmung unwiderruflich gesperrt.</span>
                </div>
              </div>
            )}
            {reconcileStep === "done" && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 size={32} className="text-[color:var(--ds-success-text)]" />
                <p className="text-sm text-[color:var(--ds-text)]">
                  Abstimmung gespeichert und gesperrt.
                </p>
              </div>
            )}
            <DialogFooter>
              {reconcileStep === "input" && (
                <>
                  <Button variant="ghost" onClick={() => setShowReconcile(false)}>
                    {t("trust.cancel" as DashboardKey)}
                  </Button>
                  <Button
                    variant="primary"
                    className="brand-bg text-white"
                    onClick={() => setReconcileStep("review")}
                    disabled={saving}
                  >
                    Weiter zur Prüfung
                  </Button>
                </>
              )}
              {reconcileStep === "review" && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => setReconcileStep("input")}
                    disabled={saving}
                  >
                    Zurück
                  </Button>
                  <Button
                    variant="primary"
                    className="brand-bg text-white"
                    onClick={handleReconcile}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Lock size={14} className="mr-1" />
                        Abstimmung bestätigen & sperren
                      </>
                    )}
                  </Button>
                </>
              )}
              {reconcileStep === "done" && (
                <Button
                  variant="primary"
                  className="brand-bg text-white"
                  onClick={() => {
                    setShowReconcile(false);
                    setReconcileStep("input");
                    setReconcileBankBalance(0);
                    setReconcileNotes("");
                  }}
                >
                  Schließen
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("trust.new" as DashboardKey)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("trust.account_name" as DashboardKey)} *
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("trust.ph_account")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("trust.account_number" as DashboardKey)} *
              </label>
              <Input
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="1234567890"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("trust.bank_name" as DashboardKey)}
              </label>
              <Input
                value={newBank}
                onChange={(e) => setNewBank(e.target.value)}
                placeholder={t("trust.ph_bank")}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("trust.iban" as DashboardKey)}
                </label>
                <Input
                  value={newIban}
                  onChange={(e) => setNewIban(e.target.value)}
                  placeholder="AT61 1904 3002 3457 3201"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("trust.bic" as DashboardKey)}
                </label>
                <Input value={newBic} onChange={(e) => setNewBic(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              Vorhandenes Guthaben erfassen Sie nach dem Anlegen als Einzahlung je Akte. So bleibt
              jedes Fremdgeld einer Akte zugeordnet.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("trust.client" as DashboardKey)}
              </label>
              <Input value={newClient} onChange={(e) => setNewClient(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("trust.matter" as DashboardKey)}
              </label>
              <Input value={newMatter} onChange={(e) => setNewMatter(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              {t("trust.cancel" as DashboardKey)}
            </Button>
            <Button
              variant="primary"
              className="brand-bg text-white"
              onClick={handleCreate}
              disabled={saving || !newName || !newNumber}
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                t("trust.save" as DashboardKey)
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
