"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ShieldAlert, Loader2, AlertTriangle, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaxRiskAnalysisPanelProps {
  clientSlug?: string;
  returnSlug?: string;
}

interface RiskResult {
  overall_risk_level: "low" | "medium" | "high";
  risks: Array<{
    category: string;
    description: string;
    severity: "low" | "medium" | "high";
    potential_amount?: number;
    mitigation: string;
    legal_basis?: string;
  }>;
  recommendations: string[];
  generatedAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  medium: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  low: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
};

export function TaxRiskAnalysisPanel({ clientSlug, returnSlug }: TaxRiskAnalysisPanelProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RiskResult | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.tax.riskAnalysis({ clientSlug, returnSlug });
      setResult(res);
      addToast({ type: "success", title: t("tax.risk.title") });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tax.risk.error"));
    } finally {
      setLoading(false);
    }
  }

  const levelColor =
    result?.overall_risk_level === "high"
      ? "text-rose-600 bg-rose-500/10 border-rose-500/20"
      : result?.overall_risk_level === "medium"
        ? "text-amber-600 bg-amber-500/10 border-amber-500/20"
        : "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";

  const levelLabel = result ? t(`tax.risk.level_${result.overall_risk_level}` as never) : "";

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
            <ShieldAlert size={16} className="text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("tax.risk.title")}
            </h3>
            <p className="text-xs text-[color:var(--ds-text-subtle)]">{t("tax.risk.desc")}</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => void analyze()}
          disabled={loading || (!clientSlug && !returnSlug)}
          className="gap-2"
          variant="outline"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
          {loading ? t("tax.risk.analyzing") : t("tax.risk.analyze")}
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
          {t("tax.risk.empty")}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          {/* Overall Risk */}
          <div className={cn("flex items-center gap-3 rounded-lg border px-4 py-3", levelColor)}>
            <ShieldAlert size={20} />
            <div>
              <p className="text-xs font-medium opacity-70">{t("tax.risk.overall")}</p>
              <p className="text-sm font-bold">{levelLabel}</p>
            </div>
          </div>

          {/* Risks list */}
          {result.risks.length > 0 && (
            <div className="space-y-2">
              {result.risks.map((r, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                        {r.category}
                      </span>
                      <p className="text-sm font-medium text-[color:var(--ds-text)]">
                        {r.description}
                      </p>
                    </div>
                    <Badge
                      variant="default"
                      className={cn("shrink-0 border", SEVERITY_COLORS[r.severity])}
                    >
                      {r.severity}
                    </Badge>
                  </div>
                  {r.potential_amount != null && (
                    <p className="text-xs text-rose-600">
                      {r.potential_amount.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">{r.mitigation}</p>
                  {r.legal_basis && (
                    <p className="mt-0.5 text-xs font-medium text-[color:var(--brand-primary)]">
                      {r.legal_basis}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
                <Lightbulb size={12} /> {t("tax.risk.recommendations")}
              </p>
              <ul className="space-y-1">
                {result.recommendations.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-[color:var(--ds-text)]"
                  >
                    <span className="brand-text mt-0.5 text-xs">▸</span>
                    {r}
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
