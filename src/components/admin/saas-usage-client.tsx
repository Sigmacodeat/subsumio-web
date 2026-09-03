"use client";

// SaaS Usage Dashboard — internal cost/margin analytics.
// Shows cost_eur (what we pay LLM providers), sell_eur (what customer pays),
// margin_eur (our profit), broken down by model and workflow.

import { useEffect, useState } from "react";
import { TrendingUp, DollarSign, Percent, Cpu, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UsageByModel {
  model_id: string;
  provider: string;
  total_tokens_input: number;
  total_tokens_output: number;
  total_tokens_cache_read: number;
  total_cost_eur: number;
  total_sell_eur: number;
  total_margin_eur: number;
  call_count: number;
}

interface UsageByWorkflow {
  workflow: string;
  total_cost_eur: number;
  total_sell_eur: number;
  total_margin_eur: number;
  call_count: number;
}

interface UsageOverview {
  byModel: UsageByModel[];
  byWorkflow: UsageByWorkflow[];
  totals: {
    total_cost_eur: number;
    total_sell_eur: number;
    total_margin_eur: number;
    total_calls: number;
    total_tokens_input: number;
    total_tokens_output: number;
    margin_pct: number;
  };
}

function formatEur(n: number): string {
  if (n >= 1000) return `€${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `€${n.toFixed(2)}`;
  return `€${n.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function modelShortName(modelId: string): string {
  const parts = modelId.split(":");
  return parts[1] ?? modelId;
}

export function SaasUsageClient() {
  const [data, setData] = useState<UsageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/saas-usage?days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
        <span className="ml-2 text-sm text-[color:var(--ds-text-muted)]">Lade Usage-Daten…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4">
        <AlertCircle size={18} className="text-[color:var(--ds-danger-text)]" />
        <p className="text-sm text-[color:var(--ds-danger-text)]">
          Fehler beim Laden: {error}. Stellen Sie sicher, dass die saas_usage_ledger-Tabelle
          existiert (Migration v134).
        </p>
      </div>
    );
  }

  if (!data || data.totals.total_calls === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-8">
        <Cpu size={18} className="text-[color:var(--ds-text-muted)]" />
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Noch keine Usage-Daten vorhanden. Die Tabelle wird beim nächsten Pipeline-Lauf automatisch
          befüllt.
        </p>
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="space-y-6">
      {/* Zeitraum-Selector */}
      <div className="flex items-center gap-2">
        {[7, 30, 90, 365].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              days === d
                ? "bg-[color:var(--brand-primary)] text-white"
                : "border border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-surface-2)]"
            }`}
          >
            {d === 365 ? "1 Jahr" : `${d} Tage`}
          </button>
        ))}
      </div>

      {/* KPI-Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
            <DollarSign size={16} />
            <span className="text-xs font-medium">LLM-Kosten (our cost)</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[color:var(--ds-text)]">
            {formatEur(t.total_cost_eur)}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
            <TrendingUp size={16} />
            <span className="text-xs font-medium">Verkaufspreis (customer pays)</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[color:var(--ds-text)]">
            {formatEur(t.total_sell_eur)}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
            <DollarSign size={16} />
            <span className="text-xs font-medium">Marge (profit)</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[color:var(--ds-success-text)]">
            {formatEur(t.total_margin_eur)}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
            <Percent size={16} />
            <span className="text-xs font-medium">Margin %</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[color:var(--ds-text)]">{t.margin_pct}%</p>
        </Card>
      </div>

      {/* Usage by Model */}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-[color:var(--ds-text)]">Usage pro Modell</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[color:var(--ds-border)] text-left text-[color:var(--ds-text-muted)]">
                <th className="pr-4 pb-2 font-medium">Modell</th>
                <th className="pr-4 pb-2 font-medium">Provider</th>
                <th className="pr-4 pb-2 text-right font-medium">Calls</th>
                <th className="pr-4 pb-2 text-right font-medium">Input Tokens</th>
                <th className="pr-4 pb-2 text-right font-medium">Output Tokens</th>
                <th className="pr-4 pb-2 text-right font-medium">Cost</th>
                <th className="pr-4 pb-2 text-right font-medium">Sell</th>
                <th className="pb-2 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {data.byModel.map((m) => (
                <tr
                  key={m.model_id}
                  className="border-b border-[color:var(--ds-border)]/50 hover:bg-[color:var(--ds-surface-2)]/50"
                >
                  <td className="py-2 pr-4 font-mono text-[color:var(--ds-text)]">
                    {modelShortName(m.model_id)}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant="default">{m.provider}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-right text-[color:var(--ds-text-muted)]">
                    {m.call_count.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-right text-[color:var(--ds-text-muted)]">
                    {formatTokens(m.total_tokens_input)}
                  </td>
                  <td className="py-2 pr-4 text-right text-[color:var(--ds-text-muted)]">
                    {formatTokens(m.total_tokens_output)}
                  </td>
                  <td className="py-2 pr-4 text-right text-[color:var(--ds-text-muted)]">
                    {formatEur(m.total_cost_eur)}
                  </td>
                  <td className="py-2 pr-4 text-right font-medium text-[color:var(--ds-text)]">
                    {formatEur(m.total_sell_eur)}
                  </td>
                  <td className="py-2 text-right font-medium text-[color:var(--ds-success-text)]">
                    {formatEur(m.total_margin_eur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Usage by Workflow */}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-[color:var(--ds-text)]">
          Usage pro Workflow
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[color:var(--ds-border)] text-left text-[color:var(--ds-text-muted)]">
                <th className="pr-4 pb-2 font-medium">Workflow</th>
                <th className="pr-4 pb-2 text-right font-medium">Calls</th>
                <th className="pr-4 pb-2 text-right font-medium">Cost</th>
                <th className="pr-4 pb-2 text-right font-medium">Sell</th>
                <th className="pb-2 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {data.byWorkflow.map((w) => (
                <tr
                  key={w.workflow}
                  className="border-b border-[color:var(--ds-border)]/50 hover:bg-[color:var(--ds-surface-2)]/50"
                >
                  <td className="py-2 pr-4 font-mono text-[color:var(--ds-text)]">{w.workflow}</td>
                  <td className="py-2 pr-4 text-right text-[color:var(--ds-text-muted)]">
                    {w.call_count.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-right text-[color:var(--ds-text-muted)]">
                    {formatEur(w.total_cost_eur)}
                  </td>
                  <td className="py-2 pr-4 text-right font-medium text-[color:var(--ds-text)]">
                    {formatEur(w.total_sell_eur)}
                  </td>
                  <td className="py-2 text-right font-medium text-[color:var(--ds-success-text)]">
                    {formatEur(w.total_margin_eur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
