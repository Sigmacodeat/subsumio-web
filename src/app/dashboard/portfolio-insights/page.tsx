"use client";

import {
  TrendingUp,
  AlertTriangle,
  FileText,
  Shield,
  Clock,
  Loader2,
  AlertCircle,
  BarChart3,
  Target,
  AlertTriangle as WarningIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/lib/use-api-query";
import { useLang } from "@/lib/use-lang";

interface ClauseFrequency {
  clause_type: string;
  count: number;
  percentage: number;
  avg_risk_level: string;
  variants: number;
}

interface OutlierProvision {
  slug: string;
  title: string;
  clause_type: string;
  deviation: string;
  severity: string;
  expected: string;
  actual: string;
}

interface ObligationSummary {
  total: number;
  upcoming_30_days: number;
  overdue: number;
  by_type: Record<string, number>;
}

interface RiskDistribution {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

interface PortfolioTrend {
  period: string;
  contract_count: number;
  avg_risk_score: number;
  top_clauses: string[];
}

interface PortfolioInsights {
  total_contracts: number;
  analyzed_contracts: number;
  risk_distribution: RiskDistribution;
  clause_frequencies: ClauseFrequency[];
  outlier_provisions: OutlierProvision[];
  obligation_summary: ObligationSummary;
  trends: PortfolioTrend[];
  negotiation_patterns: string[];
  warnings: string[];
  generated_at: string;
}

const riskColors: Record<string, string> = {
  low: "bg-[color:var(--ds-success-solid)] text-[color:var(--ds-success-text)] border-green-200",
  medium:
    "bg-[color:var(--ds-warning-solid)] text-[color:var(--ds-warning-text)] border-yellow-200",
  high: "bg-[color:var(--ds-attention-solid)] text-[color:var(--ds-attention-text)] border-orange-200",
  critical: "bg-[color:var(--ds-danger-solid)] text-[color:var(--ds-danger-text)] border-red-200",
};

const severityIcon: Record<string, typeof AlertTriangle> = {
  info: FileText,
  warning: AlertTriangle,
  critical: AlertCircle,
};

export default function PortfolioInsightsPage() {
  const { t, lang } = useLang();
  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApiQuery<PortfolioInsights>(async () => {
    const res = await fetch("/api/legal/portfolio-insights?daysBack=180", {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as PortfolioInsights;
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-[color:var(--ds-danger-text)]" />
        <p className="text-[color:var(--ds-text-muted)]">
          Fehler beim Laden der Portfolio-Insights: {error}
        </p>
        <Button onClick={load} variant="outline">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  if (!data || data.total_contracts === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <FileText className="h-12 w-12 text-[color:var(--ds-text-muted)]" />
        <h2 className="text-xl font-semibold">{t("pi.empty_title")}</h2>
        <p className="max-w-md text-center text-[color:var(--ds-text-muted)]">
          {t("pi.empty_desc")}
        </p>
      </div>
    );
  }

  const totalRisk =
    data.risk_distribution.low +
      data.risk_distribution.medium +
      data.risk_distribution.high +
      data.risk_distribution.critical || 1;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 className="h-6 w-6" />
            Contract Portfolio Insights
          </h1>
          <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
            {data.total_contracts} {t("pi.summary")} · {data.analyzed_contracts}{" "}
            {t("pi.summary_analyzed")} · {t("pi.summary_stand")}{" "}
            {new Date(data.generated_at).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm">
          Aktualisieren
        </Button>
      </div>

      {data.warnings.length > 0 && (
        <Card className="border-yellow-200 bg-[color:var(--ds-warning-solid)] p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--ds-warning-text)]" />
            <div className="text-sm">
              <p className="font-medium text-[color:var(--ds-warning-text)]">Hinweise</p>
              <ul className="mt-1 space-y-1 text-[color:var(--ds-warning-text)]">
                {data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[color:var(--ds-text-muted)]">{t("pi.stat_total")}</p>
              <p className="text-2xl font-bold">{data.total_contracts}</p>
            </div>
            <FileText className="h-8 w-8 text-[color:var(--ds-info-text)]" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[color:var(--ds-text-muted)]">Analysiert</p>
              <p className="text-2xl font-bold">{data.analyzed_contracts}</p>
            </div>
            <Target className="h-8 w-8 text-[color:var(--ds-success-text)]" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                {t("pi.stat_obligations")}
              </p>
              <p className="text-2xl font-bold">{data.obligation_summary.total}</p>
              {data.obligation_summary.overdue > 0 && (
                <p className="text-xs text-[color:var(--ds-danger-text)]">
                  {data.obligation_summary.overdue} {t("pi.stat_overdue")}
                </p>
              )}
            </div>
            <Clock className="h-8 w-8 text-[color:var(--ds-attention-text)]" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[color:var(--ds-text-muted)]">Outlier</p>
              <p className="text-2xl font-bold">{data.outlier_provisions.length}</p>
            </div>
            <WarningIcon className="h-8 w-8 text-[color:var(--ds-danger-text)]" />
          </div>
        </Card>
      </div>

      {/* Risk Distribution */}
      <Card className="p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Shield className="h-5 w-5" />
          Risiko-Verteilung
        </h2>
        <div className="space-y-2">
          {(["low", "medium", "high", "critical"] as const).map((level) => {
            const count = data.risk_distribution[level];
            const pct = Math.round((count / totalRisk) * 100);
            return (
              <div key={level} className="flex items-center gap-3">
                <span className="w-20 text-sm capitalize">{level}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
                  <div
                    className={`h-full ${riskColors[level]} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-12 text-right text-sm">
                  {count} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Clause Frequencies */}
        <Card className="p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-5 w-5" />
            {t("pi.clause_freq")}
          </h2>
          {data.clause_frequencies.length === 0 ? (
            <p className="text-sm text-[color:var(--ds-text-muted)]">{t("pi.clause_empty")}</p>
          ) : (
            <div className="space-y-2">
              {data.clause_frequencies.slice(0, 10).map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b py-2 last:border-0"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.clause_type}</p>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {c.count} Vorkommen · {c.variants} Varianten
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[color:var(--ds-text-muted)]">
                      {c.percentage}%
                    </span>
                    <Badge className={riskColors[c.avg_risk_level]} variant="default">
                      {c.avg_risk_level}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Outlier Provisions */}
        <Card className="p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5" />
            Outlier-Provisionen
          </h2>
          {data.outlier_provisions.length === 0 ? (
            <p className="text-sm text-[color:var(--ds-text-muted)]">{t("pi.outliers_empty")}</p>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {data.outlier_provisions.slice(0, 15).map((o, i) => {
                const Icon = severityIcon[o.severity] ?? AlertTriangle;
                return (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="flex items-start gap-2">
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          o.severity === "critical"
                            ? "text-[color:var(--ds-danger-text)]"
                            : o.severity === "warning"
                              ? "text-[color:var(--ds-attention-text)]"
                              : "text-[color:var(--ds-info-text)]"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{o.title}</p>
                        <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                          {o.clause_type}
                        </p>
                        <p className="mt-1 text-sm">{o.deviation}</p>
                        <div className="mt-2 text-xs text-[color:var(--ds-text-muted)]">
                          <span>Erwartet: {o.expected}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Trends */}
      {data.trends.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <TrendingUp className="h-5 w-5" />
            Vertrags-Trends
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {data.trends.map((trend, i) => (
              <div key={i} className="rounded-lg border p-3 text-center">
                <p className="text-xs text-[color:var(--ds-text-muted)]">{trend.period}</p>
                <p className="mt-1 text-xl font-bold">{trend.contract_count}</p>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("pi.trend_contracts")}
                </p>
                {trend.avg_risk_score > 0 && (
                  <Badge variant="default" className="mt-1 text-xs">
                    Ø {trend.avg_risk_score}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Negotiation Patterns */}
      {data.negotiation_patterns.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Verhandlungsmuster</h2>
          <ul className="space-y-2">
            {data.negotiation_patterns.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-[color:var(--ds-text-muted)]">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
