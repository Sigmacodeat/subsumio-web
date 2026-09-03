"use client";

import { useEffect, useState, useCallback } from "react";
import { Coins, TrendingDown, History, Zap, Download, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";
import { useToast } from "@/components/ui/toast";

interface CreditBalance {
  ownerId: string;
  ownerType: string;
  /** Available credits = included + purchased - used. */
  balance: number;
  /** Monthly included credits from SaaS plan (€60 Solo / €200 Kanzlei/seat). */
  includedCredit: number;
  /** Credits used this billing period. */
  usedCredit: number;
  /** Permanent purchased credits (from credit packs). */
  purchasedCredit: number;
  /** Overage this period (used - included, if positive). */
  overage: number;
  autoReloadEnabled: boolean;
  autoReloadThreshold: number;
  autoReloadPackId: string | null;
  updatedAt: string;
}

interface CreditTransaction {
  id: string;
  ownerId: string;
  ownerType: string;
  type: string;
  amount: number;
  balanceAfter: number;
  operation?: string;
  caseSlug?: string;
  stripeSessionId?: string;
  description?: string;
  createdAt: string;
}

interface CreditPack {
  id: string;
  name: string;
  credits: number;
  priceEur: number;
  savingsPct: number;
}

interface CreditsData {
  balance: CreditBalance;
  transactions: CreditTransaction[];
  creditPacks: CreditPack[];
  creditCosts: Record<string, number>;
}

const OPERATION_LABELS: Record<string, string> = {
  think: "Think (Q&A)",
  document_analysis: "Dokument-Analyse",
  subsumption: "Subsumption",
  agent: "Agent-Run",
  deadline_detect: "Fristen-Erkennung",
  frist_engine: "Frist-Engine",
};

const TX_TYPE_LABELS: Record<string, string> = {
  purchase: "Kauf",
  consumption: "Verbrauch",
  refund: "Erstattung",
  grant: "Gutschrift",
  expiry: "Ablauf",
};

export function CreditCard() {
  const { t } = useLang();
  const { addToast } = useToast();
  const [data, setData] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(false);
  const [autoReloadThreshold, setAutoReloadThreshold] = useState(10);
  const [autoReloadPack, setAutoReloadPack] = useState<string>("standard");
  const [savingAutoReload, setSavingAutoReload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    try {
      const res = await csrfFetch("/api/billing/credits", { method: "GET" });
      if (res.ok) {
        const json = (await res.json()) as CreditsData;
        setData(json);
        setAutoReloadEnabled(json.balance.autoReloadEnabled);
        setAutoReloadThreshold(json.balance.autoReloadThreshold);
        setAutoReloadPack(json.balance.autoReloadPackId ?? "standard");
      }
    } catch {
      // Non-critical — credits may not be configured
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCredits();
  }, [fetchCredits]);

  async function buyCredits(packId: string) {
    setBuying(packId);
    setError(null);
    try {
      const res = await csrfFetch("/api/billing/credit-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const json = (await res.json()) as { url?: string; error?: string; message?: string };
      if (res.ok && json.url) {
        window.location.assign(json.url);
        return;
      }
      setError(json.message ?? json.error ?? "Checkout fehlgeschlagen");
    } catch {
      setError("Netzwerkfehler");
    }
    setBuying(null);
  }

  async function saveAutoReload() {
    setSavingAutoReload(true);
    try {
      const res = await csrfFetch("/api/billing/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: autoReloadEnabled,
          threshold: autoReloadThreshold,
          packId: autoReloadEnabled ? autoReloadPack : null,
        }),
      });
      if (res.ok) {
        addToast({ type: "success", title: "Auto-Reload gespeichert" });
        void fetchCredits();
      } else {
        const json = (await res.json()) as { message?: string };
        addToast({ type: "error", title: json.message ?? "Speichern fehlgeschlagen" });
      }
    } catch {
      addToast({ type: "error", title: "Netzwerkfehler" });
    }
    setSavingAutoReload(false);
  }

  async function downloadCaseUsage() {
    try {
      const res = await csrfFetch("/api/billing/case-usage?csv=1", { method: "GET" });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ai-costs-per-case-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        addToast({ type: "error", title: "Export fehlgeschlagen" });
      }
    } catch {
      addToast({ type: "error", title: "Netzwerkfehler beim Export" });
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="space-y-5 p-6">
          <div className="flex items-center gap-2.5">
            <Coins size={18} className="brand-text animate-pulse" aria-hidden />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("billing.credits_title") || "Credits"}
            </h2>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-[color:var(--ds-border)]" />
            ))}
          </div>
        </div>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card>
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-2.5">
            <Coins size={18} className="brand-text" aria-hidden />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("billing.credits_title") || "Credits"}
            </h2>
          </div>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ds-border)]">
              <Coins size={20} className="text-[color:var(--ds-text-muted)]" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-medium text-[color:var(--ds-text)]">
                Credits nicht verfügbar
              </p>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                Billing ist noch nicht konfiguriert.
              </p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const { balance, transactions, creditPacks, creditCosts } = data;
  const lowBalance = balance.balance <= 5;

  return (
    <Card>
      <div className="space-y-5 p-6">
        {/* Header + Balance */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Coins size={18} className="brand-text" aria-hidden />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("billing.credits_title") || "Credits"}
            </h2>
            {balance.ownerType === "org" && (
              <Badge variant="accent">{t("billing.team_pool") || "Team-Pool"}</Badge>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-bold ${lowBalance ? "text-[color:var(--ds-warning-text)]" : "text-[color:var(--ds-text)]"}`}
            >
              {balance.balance}
            </span>
            <span className="text-sm text-[color:var(--ds-text-muted)]">
              {t("billing.credits_remaining") || "Credits verfügbar"}
            </span>
          </div>
        </div>

        {/* Credit breakdown: included + purchased - used = available */}
        {(balance.includedCredit > 0 || balance.purchasedCredit > 0) && (
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="text-center">
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("billing.credits_included") || "Inklusiv"}
              </p>
              <p className="text-lg font-semibold text-[color:var(--ds-text)]">
                {balance.includedCredit}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("billing.credits_purchased") || "Gekauft"}
              </p>
              <p className="text-lg font-semibold text-[color:var(--ds-text)]">
                {balance.purchasedCredit}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("billing.credits_used") || "Verbraucht"}
              </p>
              <p className="text-lg font-semibold text-[color:var(--ds-text)]">
                {balance.usedCredit}
              </p>
            </div>
          </div>
        )}

        {/* Overage warning */}
        {balance.overage > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3">
            <TrendingDown size={14} className="text-[color:var(--ds-warning-text)]" />
            <p className="text-xs text-[color:var(--ds-warning-text)]">
              {(
                t("billing.overage_notice") ||
                "Überplan-Nutzung: {overage} Credits über dem Inklusiv-Kontingent — wird am Periodenende abgerechnet."
              ).replace("{overage}", String(balance.overage))}
            </p>
          </div>
        )}

        {/* Low balance warning */}
        {lowBalance && (
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3">
            <TrendingDown size={14} className="text-[color:var(--ds-warning-text)]" />
            <p className="text-xs text-[color:var(--ds-warning-text)]">
              {t("billing.low_credits") ||
                "Wenige Credits übrig — kaufe ein Pack, um AI-Features weiter zu nutzen."}
            </p>
          </div>
        )}

        {/* Credit Packs */}
        <div>
          <p className="mb-3 text-xs font-medium tracking-wider text-[color:var(--ds-text-muted)] uppercase">
            {t("billing.buy_credits") || "Credits kaufen"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {creditPacks.map((pack) => (
              <div
                key={pack.id}
                className="flex flex-col rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {pack.name}
                  </span>
                  {pack.savingsPct > 0 && <Badge variant="success">-{pack.savingsPct}%</Badge>}
                </div>
                <p className="mb-1 text-2xl font-bold text-[color:var(--ds-text)]">
                  {pack.credits}
                  <span className="ml-1 text-xs font-normal text-[color:var(--ds-text-muted)]">
                    Credits
                  </span>
                </p>
                <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">{pack.priceEur} €</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  loading={buying === pack.id}
                  onClick={() => buyCredits(pack.id)}
                >
                  {t("billing.buy") || "Kaufen"} <ArrowRight size={12} />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Credit Costs Table */}
        <div>
          <p className="mb-2 text-xs font-medium tracking-wider text-[color:var(--ds-text-muted)] uppercase">
            {t("billing.credit_costs") || "Kosten pro Operation"}
          </p>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(creditCosts).map(([op, cost]) => (
              <div
                key={op}
                className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] px-3 py-2"
              >
                <span className="text-xs text-[color:var(--ds-text-muted)]">
                  {OPERATION_LABELS[op] ?? op}
                </span>
                <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {cost === 0 ? "gratis" : `${cost}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Auto-Reload */}
        <div className="rounded-xl border border-[color:var(--ds-border)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Zap size={14} className="brand-text" />
            <p className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("billing.auto_reload") || "Auto-Reload"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <input
                type="checkbox"
                checked={autoReloadEnabled}
                onChange={(e) => setAutoReloadEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-[color:var(--ds-border)]"
              />
              {t("billing.auto_reload_desc") ||
                "Automatisch Credits kaufen, wenn der Saldo unter den Schwellwert fällt"}
            </label>
            {autoReloadEnabled && (
              <>
                <select
                  value={autoReloadThreshold}
                  onChange={(e) => setAutoReloadThreshold(parseInt(e.target.value, 10))}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)]"
                >
                  <option value={5}>≤ 5 Credits</option>
                  <option value={10}>≤ 10 Credits</option>
                  <option value={20}>≤ 20 Credits</option>
                  <option value={50}>≤ 50 Credits</option>
                </select>
                <select
                  value={autoReloadPack}
                  onChange={(e) => setAutoReloadPack(e.target.value)}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)]"
                >
                  {creditPacks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.credits} Credits)
                    </option>
                  ))}
                </select>
              </>
            )}
            <Button variant="outline" size="sm" loading={savingAutoReload} onClick={saveAutoReload}>
              {t("billing.save") || "Speichern"}
            </Button>
          </div>
        </div>

        {/* Transaction History Toggle */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-xs font-medium text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            <History size={14} />
            {t("billing.transaction_history") || "Transaktionsverlauf"}
            {transactions.length > 0 && <Badge variant="default">{transactions.length}</Badge>}
          </button>
          <Button variant="ghost" size="sm" onClick={downloadCaseUsage}>
            <Download size={12} /> {t("billing.export_case_usage") || "AI-Kosten pro Akte"}
          </Button>
        </div>

        {/* Transaction History */}
        {showHistory && transactions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-left text-[color:var(--ds-text-muted)]">
                  <th className="pr-4 pb-2 font-medium">Datum</th>
                  <th className="pr-4 pb-2 font-medium">Typ</th>
                  <th className="pr-4 pb-2 font-medium">Operation</th>
                  <th className="pr-4 pb-2 font-medium">Akte</th>
                  <th className="pr-4 pb-2 text-right font-medium">Credits</th>
                  <th className="pb-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 20).map((tx) => (
                  <tr key={tx.id} className="border-b border-[color:var(--ds-border)]/50">
                    <td className="py-2 pr-4 text-[color:var(--ds-text-muted)]">
                      {new Date(tx.createdAt).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge
                        variant={
                          tx.type === "purchase" || tx.type === "grant" || tx.type === "refund"
                            ? "success"
                            : tx.type === "consumption"
                              ? "default"
                              : "warning"
                        }
                      >
                        {TX_TYPE_LABELS[tx.type] ?? tx.type}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-[color:var(--ds-text-muted)]">
                      {tx.operation
                        ? (OPERATION_LABELS[tx.operation] ?? tx.operation)
                        : (tx.description ?? "—")}
                    </td>
                    <td className="py-2 pr-4 text-[color:var(--ds-text-muted)]">
                      {tx.caseSlug ?? "—"}
                    </td>
                    <td
                      className={`py-2 pr-4 text-right font-semibold ${tx.amount > 0 ? "text-[color:var(--ds-success-text)]" : "text-[color:var(--ds-text)]"}`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount}
                    </td>
                    <td className="py-2 text-right text-[color:var(--ds-text-muted)]">
                      {tx.balanceAfter}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showHistory && transactions.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <History size={24} className="text-[color:var(--ds-text-muted)]" aria-hidden />
            <p className="text-xs text-[color:var(--ds-text-muted)]">Noch keine Transaktionen.</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-[color:var(--ds-error-border)] bg-[color:var(--ds-error-bg)] p-3">
            <p className="text-xs text-[color:var(--ds-error-text)]">{error}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
