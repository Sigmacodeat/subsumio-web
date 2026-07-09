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
  type TrustTransaction,
  type TrustTransactionType,
  type ReconciliationStatus,
} from "@/lib/trust-accounting";

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

const TX_TYPES: TrustTransactionType[] = [
  "deposit",
  "withdrawal",
  "transfer",
  "fee",
  "interest",
  "adjustment",
];

function formatCurrency(amount: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(amount);
}

export default function TrustAccountingPage() {
  const { t, lang } = useLang();
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
  const [newOpening, setNewOpening] = useState(0);
  const [newClient, setNewClient] = useState("");
  const [newMatter, setNewMatter] = useState("");

  // Transaction form
  const [txType, setTxType] = useState<TrustTransactionType>("deposit");
  const [txAmount, setTxAmount] = useState(0);
  const [txDescription, setTxDescription] = useState("");
  const [txReference, setTxReference] = useState("");

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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

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
        openingBalance: newOpening,
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
      setNewOpening(0);
      setNewClient("");
      setNewMatter("");
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTransaction() {
    if (!selectedAccount || !txDescription || txAmount === 0) return;
    setSaving(true);
    try {
      await api.legal.trustAccounts.addTransaction(selectedAccount.slug, {
        type: txType,
        amount: txAmount,
        description: txDescription,
        reference: txReference || undefined,
      });
      showToast(t("trust.success_saved" as DashboardKey));
      setShowAddTx(false);
      setTxType("deposit");
      setTxAmount(0);
      setTxDescription("");
      setTxReference("");
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      const now = new Date().toISOString();
      const bookBalance = selectedAccount.frontmatter?.current_balance ?? 0;
      const difference = reconcileBankBalance - bookBalance;
      const status: ReconciliationStatus = Math.abs(difference) < 0.01 ? "balanced" : "discrepancy";
      const newRec = {
        id: `rec-${Date.now()}`,
        date: now,
        bankBalance: reconcileBankBalance,
        bookBalance,
        difference,
        status,
        reconciledBy: "kanzlei-os",
        notes: reconcileNotes || undefined,
      };
      const existingRecs = (selectedAccount.frontmatter as Record<string, unknown>)
        .reconciliations as unknown[] | undefined;
      const updatedRecs = [...(existingRecs ?? []), newRec];
      await api.legal.trustAccounts.update(selectedAccount.slug, {
        reconciliations: updatedRecs,
      } as never);
      showToast(
        status === "balanced"
          ? "Quartalsabstimmung erfolgreich — Saldo ausgeglichen."
          : `Quartalsabstimmung gespeichert — Differenz: ${formatCurrency(Math.abs(difference), selectedAccount.frontmatter?.currency)}`
      );
      setReconcileStep("done");
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
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
    a.download = `trust-${selectedAccount.slug.replace(/\//g, "-")}.csv`;
    a.click();
  }

  if (loading && accounts.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[color:var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("trust.title" as DashboardKey)}
        description={t("trust.description" as DashboardKey)}
        actions={
          <Button
            variant="primary"
            className="brand-bg gap-2 text-sm text-white"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} />
            {t("trust.new" as DashboardKey)}
          </Button>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <AlertCircle size={16} />
          {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed right-6 bottom-6 z-50 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm text-[color:var(--ds-text)] shadow-lg">
          {toast}
        </div>
      )}

      {/* Filters */}
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
        <Button variant="ghost" onClick={loadAccounts} className="gap-2 text-sm">
          <RefreshCw size={14} />
        </Button>
      </div>

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border)] py-16 text-center">
          <Wallet size={32} className="mb-3 text-[color:var(--ds-text-subtle)]" />
          <p className="max-w-md text-sm text-[color:var(--ds-text-muted)]">
            {t("trust.empty" as DashboardKey)}
          </p>
          <Button
            variant="primary"
            className="brand-bg mt-4 gap-2 text-sm text-white"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} />
            {t("trust.new" as DashboardKey)}
          </Button>
        </div>
      )}

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
                className="group rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-left transition-all hover:border-[color:var(--brand-primary)] hover:shadow-md"
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
                    className={`text-sm font-bold ${isOverdrawn ? "text-[color:var(--ds-danger-text)]" : "text-[color:var(--ds-success-text)]"}`}
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
                  className={`mt-1 text-lg font-bold ${(selectedAccount.frontmatter?.current_balance ?? 0) < 0 ? "text-[color:var(--ds-danger-text)]" : "text-[color:var(--ds-success-text)]"}`}
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
                sortedTxs.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                  >
                    <div className="shrink-0">
                      {tx.type === "deposit" || tx.type === "interest" ? (
                        <ArrowDownCircle
                          size={16}
                          style={{ color: TRANSACTION_TYPE_COLORS[tx.type] }}
                        />
                      ) : (
                        <ArrowUpCircle
                          size={16}
                          style={{ color: TRANSACTION_TYPE_COLORS[tx.type] }}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[color:var(--ds-text)]">
                        {tx.description}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                        <span>{TRANSACTION_TYPE_LABELS_DE[tx.type]}</span>
                        <span>
                          ·{" "}
                          {new Date(tx.date).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                        </span>
                        {tx.reference && <span>· {tx.reference}</span>}
                      </div>
                    </div>
                    <div
                      className="shrink-0 text-sm font-bold"
                      style={{ color: TRANSACTION_TYPE_COLORS[tx.type] }}
                    >
                      {tx.type === "withdrawal" || tx.type === "fee" ? "-" : "+"}
                      {formatCurrency(tx.amount, tx.currency)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Overdue Reconciliation Warning */}
            {overdueReconciliation && (
              <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]">
                <AlertCircle size={16} />
                <span>Quartalsabstimmung für dieses Konto ist überfällig (§ 51a BRAO).</span>
              </div>
            )}

            {/* Reconciliation History */}
            {reconciliations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  Abstimmungen (Reconciliation)
                </h4>
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
                            {new Date(rec.date).toLocaleDateString("de-DE")}
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

            {/* Quarterly Report (§ 51a BRAO) */}
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
                        Quartalsbericht Q{currentQuarter} {currentYear} (§ 51a BRAO)
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
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("trust.tx_type" as DashboardKey)}
                </label>
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as TrustTransactionType)}
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
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("trust.tx_amount" as DashboardKey)} *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={txAmount}
                  onChange={(e) => setTxAmount(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("trust.tx_description" as DashboardKey)} *
                </label>
                <Input value={txDescription} onChange={(e) => setTxDescription(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("trust.tx_reference" as DashboardKey)}
                </label>
                <Input value={txReference} onChange={(e) => setTxReference(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowAddTx(false)}>
                {t("trust.cancel" as DashboardKey)}
              </Button>
              <Button
                variant="primary"
                className="brand-bg text-white"
                onClick={handleAddTransaction}
                disabled={saving || !txDescription || txAmount === 0}
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
                    step="0.01"
                    value={reconcileBankBalance}
                    onChange={(e) => setReconcileBankBalance(Number(e.target.value))}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                    Notiz (optional)
                  </label>
                  <Input
                    value={reconcileNotes}
                    onChange={(e) => setReconcileNotes(e.target.value)}
                    placeholder="z.B. Kontoauszug vom ..."
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
                  <span>
                    Nach Bestätigung wird die Abstimmung unwiderruflich gesperrt (§ 51a BRAO).
                  </span>
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
                placeholder="Anderkonto Müller"
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
                placeholder="Commerzbank"
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
                  placeholder="DE89..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("trust.bic" as DashboardKey)}
                </label>
                <Input value={newBic} onChange={(e) => setNewBic(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("trust.opening_balance" as DashboardKey)}
              </label>
              <Input
                type="number"
                step="0.01"
                value={newOpening}
                onChange={(e) => setNewOpening(Number(e.target.value))}
              />
            </div>
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
