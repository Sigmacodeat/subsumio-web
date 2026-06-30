"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Euro,
  Target,
  ListChecks,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardKey } from "@/content/dashboard";

interface TaxStrategyPanelProps {
  returnSlug: string;
}

interface StrategyResult {
  summary: string;
  recommended: string;
  recommendedApproach: string;
  risks: Array<{
    description: string;
    probability: "high" | "medium" | "low";
    impact: "high" | "medium" | "low";
    mitigation: string;
  }>;
  next_steps: string[];
  cost_estimate?: {
    min: number;
    max: number;
    currency: string;
    basis: string;
  };
  success_probability: number;
  generatedAt: string;
}

const PROB_COLORS: Record<string, string> = {
  high: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  medium: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  low: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
};

export function TaxStrategyPanel({ returnSlug }: TaxStrategyPanelProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [showRisks, setShowRisks] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.tax.caseStrategy({ returnSlug });
      setResult(res);
      addToast({ type: "success", title: t("tax.strategy.title") });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tax.strategy.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="brand-soft brand-border flex h-8 w-8 items-center justify-center rounded-lg border">
            <Sparkles size={16} className="brand-text" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("tax.strategy.title")}
            </h3>
            <p className="text-xs text-[color:var(--ds-text-subtle)]">{t("tax.strategy.desc")}</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => void generate()}
          disabled={loading}
          className="brand-bg gap-2 text-white"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? t("tax.strategy.generating") : t("tax.strategy.generate")}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-600">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {!result && !error && !loading && (
        <p className="py-6 text-center text-sm text-[color:var(--ds-text-subtle)]">
          {t("tax.strategy.empty")}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div>
            <p className="mb-1 text-xs font-medium text-[color:var(--ds-text-muted)]">
              {t("tax.strategy.summary")}
            </p>
            <p className="text-sm text-[color:var(--ds-text)]">{result.summary}</p>
          </div>

          {/* Recommended */}
          <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
              <Target size={12} /> {t("tax.strategy.recommended")}
            </p>
            <p className="text-sm font-medium text-[color:var(--ds-text)]">{result.recommended}</p>
          </div>

          {/* Approach */}
          <div>
            <p className="mb-1 text-xs font-medium text-[color:var(--ds-text-muted)]">
              {t("tax.strategy.approach")}
            </p>
            <p className="text-sm text-[color:var(--ds-text)]">{result.recommendedApproach}</p>
          </div>

          {/* Success Probability + Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[color:var(--ds-border)] p-3 text-center">
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("tax.strategy.success_prob")}
              </p>
              <p className="text-lg font-bold text-[color:var(--brand-primary)]">
                {Math.round(result.success_probability * 100)}%
              </p>
            </div>
            {result.cost_estimate && (
              <div className="rounded-lg border border-[color:var(--ds-border)] p-3 text-center">
                <p className="mb-0.5 flex items-center justify-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                  <Euro size={11} /> {t("tax.strategy.cost_estimate")}
                </p>
                <p className="text-sm font-bold text-[color:var(--ds-text)]">
                  {result.cost_estimate.min.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} –{" "}
                  {result.cost_estimate.max.toLocaleString(lang === "en" ? "en-GB" : "de-DE")}{" "}
                  {result.cost_estimate.currency}
                </p>
              </div>
            )}
          </div>

          {/* Risks (collapsible) */}
          {result.risks.length > 0 && (
            <div>
              <button
                onClick={() => setShowRisks((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-medium text-[color:var(--ds-text-muted)]"
              >
                <span className="flex items-center gap-1.5">
                  <TrendingUp size={12} />
                  {t("tax.strategy.risks")} ({result.risks.length})
                </span>
                <ChevronDown
                  size={14}
                  className={cn("transition-transform", showRisks && "rotate-180")}
                />
              </button>
              {showRisks && (
                <div className="mt-2 space-y-2">
                  {result.risks.map((r, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-medium text-[color:var(--ds-text)]">
                          {r.description}
                        </span>
                        <Badge
                          variant="default"
                          className={cn("border", PROB_COLORS[r.probability])}
                        >
                          {r.probability}
                        </Badge>
                      </div>
                      <p className="text-xs text-[color:var(--ds-text-subtle)]">{r.mitigation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Next Steps */}
          {result.next_steps.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
                <ListChecks size={12} /> {t("tax.strategy.next_steps")}
              </p>
              <ul className="space-y-1">
                {result.next_steps.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-[color:var(--ds-text)]"
                  >
                    <span className="brand-text mt-0.5 text-xs">▸</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
