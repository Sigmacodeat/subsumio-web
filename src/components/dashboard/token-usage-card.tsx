"use client";

/**
 * TokenUsageCard — Token-genaue Credit-Abrechnung (Goldstandard wie OpenAI).
 *
 * Zeigt pro Modell:
 *   - Credits verbraucht (EUR)
 *   - Input/Cached/Output Tokens
 *   - Call-Anzahl
 *   - Cache-Hit-Rate
 *
 * Wie OpenAI Usage Dashboard, aber für Subsumio's DACH-Rechts-Pipeline.
 */

import { Cpu, TrendingUp, Zap, Database, Gauge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTokenUsage } from "@/lib/queries/settings";
import { useLang } from "@/lib/use-lang";
import { getModelById } from "@/lib/model-config";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function formatCredits(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TokenUsageCard() {
  const { lang } = useLang();
  const { data, isLoading } = useTokenUsage();

  if (isLoading) {
    return (
      <Card>
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-2.5">
            <Cpu size={16} className="brand-text animate-pulse" aria-hidden />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Token-Verbrauch</h2>
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

  if (!data?.ok || !data.usage.length) {
    return (
      <Card>
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-2.5">
            <Cpu size={16} className="brand-text" aria-hidden />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Token-Verbrauch</h2>
          </div>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ds-border)]">
              <Zap size={20} className="text-[color:var(--ds-text-muted)]" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-medium text-[color:var(--ds-text)]">
                Noch keine Token-Usage
              </p>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                Starte eine Legal-Pipeline um token-genaue Abrechnung zu sehen.
              </p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const { usage, totals } = data;
  const totalCredits = totals.totalCredits;
  const cacheHitPct = Math.round(totals.cacheHitRate * 100);

  return (
    <Card>
      <div className="space-y-4 p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Cpu size={16} className="brand-text" aria-hidden />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Token-Verbrauch</h2>
          </div>
          <Badge variant="info">
            {totals.totalCalls.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} Calls
          </Badge>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-[color:var(--ds-border)] p-3">
            <div className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
              <TrendingUp size={12} aria-hidden />
              <span>Credits</span>
            </div>
            <p className="mt-1 font-mono text-lg font-semibold text-[color:var(--ds-text)]">
              {formatCredits(totalCredits)} €
            </p>
          </div>
          <div className="rounded-md border border-[color:var(--ds-border)] p-3">
            <div className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
              <Database size={12} aria-hidden />
              <span>Input</span>
            </div>
            <p className="mt-1 font-mono text-lg font-semibold text-[color:var(--ds-text)]">
              {formatTokens(totals.totalInputTokens)}
            </p>
          </div>
          <div className="rounded-md border border-[color:var(--ds-border)] p-3">
            <div className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
              <Zap size={12} aria-hidden />
              <span>Output</span>
            </div>
            <p className="mt-1 font-mono text-lg font-semibold text-[color:var(--ds-text)]">
              {formatTokens(totals.totalOutputTokens)}
            </p>
          </div>
          <div className="rounded-md border border-[color:var(--ds-border)] p-3">
            <div className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
              <Gauge size={12} aria-hidden />
              <span>Cache-Hit</span>
            </div>
            <p className="mt-1 font-mono text-lg font-semibold text-[color:var(--ds-success-text)]">
              {cacheHitPct}%
            </p>
          </div>
        </div>

        {/* Per-Model Breakdown */}
        <div className="space-y-3">
          {usage.map((row) => {
            const model = getModelById(row.modelId);
            const modelName = model?.name ?? row.modelId;
            const provider = model ? model.provider : "—";
            const pct = totalCredits > 0 ? (row.totalCredits / totalCredits) * 100 : 0;
            const rowCachePct =
              row.totalInputTokens + row.totalCachedTokens > 0
                ? Math.round(
                    (row.totalCachedTokens / (row.totalInputTokens + row.totalCachedTokens)) * 100
                  )
                : 0;

            return (
              <div key={row.modelId}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[color:var(--ds-text)]">
                      {modelName}
                    </span>
                    <span className="text-xs tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                      {provider}
                    </span>
                    {model?.dataResidency === "eu" && (
                      <span className="text-xs font-medium text-[color:var(--ds-success-text)]">
                        EU
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs text-[color:var(--ds-text-muted)]">
                    {formatCredits(row.totalCredits)} €
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]"
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${modelName} credit usage`}
                >
                  <div
                    className="brand-soft h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--ds-text-subtle)]">
                  <span title="Input Tokens">{formatTokens(row.totalInputTokens)} in</span>
                  {row.totalCachedTokens > 0 && (
                    <span
                      title="Cached Input Tokens (Anthropic Prompt Caching)"
                      className="text-[color:var(--ds-success-text)]"
                    >
                      {formatTokens(row.totalCachedTokens)} cached ({rowCachePct}%)
                    </span>
                  )}
                  <span title="Output Tokens">{formatTokens(row.totalOutputTokens)} out</span>
                  <span title="LLM Calls">
                    {row.callCount.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} calls
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          Token-genaue Abrechnung wie OpenAI/ChatGPT. 1 Credit = 1 €. Cached-Tokens kosten 10%
          (Anthropic Prompt Caching).
        </p>
      </div>
    </Card>
  );
}
