"use client";

import { useEffect, useState } from "react";
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
  low: "bg-green-100 text-green-700 border-green-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

const severityIcon: Record<string, typeof AlertTriangle> = {
  info: FileText,
  warning: AlertTriangle,
  critical: AlertCircle,
};

export default function PortfolioInsightsPage() {
  const [data, setData] = useState<PortfolioInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/legal/portfolio-insights?daysBack=180");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="text-destructive h-12 w-12" />
        <p className="text-muted-foreground">Fehler beim Laden der Portfolio-Insights: {error}</p>
        <Button onClick={load} variant="outline">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  if (!data || data.total_contracts === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <FileText className="text-muted-foreground h-12 w-12" />
        <h2 className="text-xl font-semibold">Keine Verträge im Portfolio</h2>
        <p className="text-muted-foreground max-w-md text-center">
          Laden Sie Verträge in den Vault hoch und analysieren Sie diese, um Portfolio-Insights zu
          erhalten.
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
          <p className="text-muted-foreground mt-1 text-sm">
            {data.total_contracts} Verträge · {data.analyzed_contracts} analysiert · Stand:{" "}
            {new Date(data.generated_at).toLocaleString("de-DE")}
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm">
          Aktualisieren
        </Button>
      </div>

      {data.warnings.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800">Hinweise</p>
              <ul className="mt-1 space-y-1 text-yellow-700">
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
              <p className="text-muted-foreground text-sm">Gesamtverträge</p>
              <p className="text-2xl font-bold">{data.total_contracts}</p>
            </div>
            <FileText className="h-8 w-8 text-blue-500" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Analysiert</p>
              <p className="text-2xl font-bold">{data.analyzed_contracts}</p>
            </div>
            <Target className="h-8 w-8 text-green-500" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Offene Obliegenheiten</p>
              <p className="text-2xl font-bold">{data.obligation_summary.total}</p>
              {data.obligation_summary.overdue > 0 && (
                <p className="text-xs text-red-600">{data.obligation_summary.overdue} überfällig</p>
              )}
            </div>
            <Clock className="h-8 w-8 text-orange-500" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Outlier</p>
              <p className="text-2xl font-bold">{data.outlier_provisions.length}</p>
            </div>
            <WarningIcon className="h-8 w-8 text-red-500" />
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
                <div className="bg-muted h-6 flex-1 overflow-hidden rounded-full">
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
            Klausel-Häufigkeiten
          </h2>
          {data.clause_frequencies.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Keine Klausel-Daten verfügbar. Analysieren Sie Verträge mit der KI-Analyse.
            </p>
          ) : (
            <div className="space-y-2">
              {data.clause_frequencies.slice(0, 10).map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b py-2 last:border-0"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.clause_type}</p>
                    <p className="text-muted-foreground text-xs">
                      {c.count} Vorkommen · {c.variants} Varianten
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">{c.percentage}%</span>
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
            <p className="text-muted-foreground text-sm">
              Keine Outlier erkannt. Alle Verträge liegen im Normbereich.
            </p>
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
                            ? "text-red-600"
                            : o.severity === "warning"
                              ? "text-orange-600"
                              : "text-blue-600"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{o.title}</p>
                        <p className="text-muted-foreground mt-0.5 text-xs">{o.clause_type}</p>
                        <p className="mt-1 text-sm">{o.deviation}</p>
                        <div className="text-muted-foreground mt-2 text-xs">
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {data.trends.map((t, i) => (
              <div key={i} className="rounded-lg border p-3 text-center">
                <p className="text-muted-foreground text-xs">{t.period}</p>
                <p className="mt-1 text-xl font-bold">{t.contract_count}</p>
                <p className="text-muted-foreground text-xs">Verträge</p>
                {t.avg_risk_score > 0 && (
                  <Badge variant="default" className="mt-1 text-xs">
                    Ø {t.avg_risk_score}
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
                <span className="text-muted-foreground">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
