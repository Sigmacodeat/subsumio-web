"use client";

/**
 * AccountBalancePill — dezentes Live-Credit-Balance Widget für Topbar.
 *
 - Goldstandard wie ChatGPT's Credit-Anzeige im Header.
 - Zeigt aktuellen Credit-Stand, wird bei niedrigem Stand gelb/rot.
 - Klick → /dashboard/billing
 - Pollt alle 60s + invalidiert nach Pipeline-Settlement.
 */

import { useEffect } from "react";
import { Coins, TrendingUp, AlertTriangle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/lib/use-lang";
import { apiGet } from "@/lib/queries/settings";
import { cn } from "@/lib/utils";

interface BalanceResponse {
  balance: {
    balance: number;
    ownerId: string;
    ownerType: string;
    autoReloadEnabled: boolean;
    updatedAt: string;
  };
}

async function fetchBalance(): Promise<BalanceResponse> {
  return apiGet<BalanceResponse>("/api/billing/credits");
}

function formatBalance(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return n.toFixed(0);
  return n.toFixed(1);
}

export function AccountBalancePill() {
  const { t, lang } = useLang();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["billing", "balance-pill"],
    queryFn: fetchBalance,
    refetchInterval: 60_000, // 60s polling
    staleTime: 30_000,
    retry: 2,
  });

  // Invalidate balance when a pipeline-settle event fires (custom event)
  useEffect(() => {
    const onSettle = () => {
      qc.invalidateQueries({ queryKey: ["billing", "balance-pill"] });
      qc.invalidateQueries({ queryKey: ["billing", "token-usage"] });
    };
    window.addEventListener("subsumio:pipeline-settled", onSettle);
    return () => window.removeEventListener("subsumio:pipeline-settled", onSettle);
  }, [qc]);

  if (isError) {
    return (
      <div
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs text-[color:var(--ds-text-muted)]"
        title="Guthaben nicht verfügbar"
        aria-label="Guthaben nicht verfügbar"
      >
        <AlertTriangle size={14} className="text-amber-500" />
        <span>—</span>
      </div>
    );
  }

  if (isLoading || !data?.balance) {
    return (
      <div
        className="flex h-9 animate-pulse items-center gap-1.5 rounded-lg px-2.5 text-xs text-[color:var(--ds-text-muted)]"
        aria-hidden
      >
        <Coins size={14} />
        <span>—</span>
      </div>
    );
  }

  const balance = data.balance.balance;
  const autoReload = data.balance.autoReloadEnabled;
  const low = balance < 10;
  const medium = balance < 50 && !low;
  const locale = lang === "en" ? "en-GB" : "de-DE";

  return (
    <a
      href="/dashboard/billing"
      className={cn(
        "group flex h-9 items-center gap-1.5 rounded-lg px-2.5 transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none active:scale-[0.98]",
        low && "bg-[color:var(--ds-warning-soft)]",
        medium && !low && "hover:bg-[color:var(--ds-hover)]"
      )}
      title={t("billing.balance_tooltip")}
      aria-label={`${t("billing.balance_label")}: ${balance.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
    >
      {low ? (
        <AlertTriangle size={14} className="text-[color:var(--ds-warning-text)]" aria-hidden />
      ) : (
        <Coins size={14} className="brand-text" aria-hidden />
      )}
      <span
        className={cn(
          "font-mono text-xs font-medium tabular-nums",
          low ? "text-[color:var(--ds-warning-text)]" : "text-[color:var(--ds-text)]"
        )}
      >
        {formatBalance(balance)} €
      </span>
      {autoReload && (
        <TrendingUp
          size={10}
          className="text-[color:var(--ds-success-text)] opacity-60"
          aria-hidden
        />
      )}
    </a>
  );
}
