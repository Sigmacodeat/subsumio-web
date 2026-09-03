"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  AlertTriangle,
  FileText,
  Target,
  TrendingUp,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { api, type BrainPage } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { AIActConformityBanner } from "@/components/legal/AIActConformityBanner";
import { useLang } from "@/lib/use-lang";
import type { ActAnalysis } from "@/app/dashboard/berufungs-agent/page";

interface ActAnalysisStepProps {
  caseSlug: string;
  onCaseSelect: (slug: string) => void;
  analysis: ActAnalysis | null;
  onAnalysisComplete: (a: ActAnalysis | null) => void;
  onNext: () => void;
  canProceed: boolean;
}

const RISK_COLORS = {
  high: "bg-[color:var(--ds-danger-bg)]/10 text-[color:var(--ds-danger-text)] border-[color:var(--ds-danger-border)]/30 dark:text-[color:var(--ds-danger-text)]",
  medium:
    "bg-[color:var(--ds-warning-bg)]/10 text-amber-700 border-[color:var(--ds-warning-border)]/30 dark:text-[color:var(--ds-warning-text)]",
  low: "bg-emerald-500/10 text-emerald-700 border-[color:var(--ds-success-border)]/30 dark:text-[color:var(--ds-success-text)]",
} as const;

const RISK_LABELS = { high: "Hoch", medium: "Mittel", low: "Niedrig" } as const;

export function ActAnalysisStep({
  caseSlug,
  onCaseSelect,
  analysis,
  onAnalysisComplete,
  onNext,
  canProceed,
}: ActAnalysisStepProps) {
  const [cases, setCases] = useState<BrainPage[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();
  const { t } = useLang();

  // Load case list (type=case)
  useEffect(() => {
    let cancelled = false;
    setLoadingCases(true);
    api.brain
      .listPages({ type: "case", limit: 100 })
      .then((pages) => {
        if (!cancelled) setCases(pages);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[berufungs-agent] case list error:", err);
          setCases([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCases(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!caseSlug) return;
    setAnalyzing(true);
    setError(null);
    try {
      const result = await api.legal.caseStrategy(caseSlug, {
        jurisdiction: "all",
        language: "de",
      });
      onAnalysisComplete(result as ActAnalysis);
      addToast({ type: "success", title: "Akt-Analyse abgeschlossen" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addToast({
        type: "error",
        title: "Analyse fehlgeschlagen",
        description: msg,
      });
    } finally {
      setAnalyzing(false);
    }
  }, [caseSlug, onAnalysisComplete, addToast]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <FileText className="h-5 w-5 text-[color:var(--brand-primary)]" />
          {t("act_analysis.step_title")}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
          {t("act_analysis.step_desc")}
        </p>
      </div>

      {/* Case selector */}
      <div className="space-y-2">
        <Label htmlFor="case-select">{t("act_analysis.select_case")}</Label>
        {loadingCases ? (
          <div className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("act_analysis.loading_cases")}
          </div>
        ) : cases.length === 0 ? (
          <div className="rounded-md border border-dashed bg-[color:var(--ds-surface-2)]/30 p-4 text-sm text-[color:var(--ds-text-muted)]">
            Keine Akten gefunden. Erstellen Sie zuerst eine Akte unter{" "}
            <Link href="/dashboard/cases" className="text-[color:var(--brand-primary)] underline">
              Akten
            </Link>
            .
          </div>
        ) : (
          <select
            id="case-select"
            value={caseSlug}
            onChange={(e) => onCaseSelect(e.target.value)}
            className="w-full max-w-md rounded-md border bg-[color:var(--ds-bg)] px-3 py-2 text-sm focus:ring-2 focus:ring-[color:var(--ds-ring)] focus:outline-none"
          >
            <option value="">— Bitte Akte wählen —</option>
            {cases.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title || c.slug}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Analyze button */}
      {caseSlug && !analysis && (
        <div className="flex flex-col items-start gap-3 rounded-md border bg-[color:var(--ds-surface-2)]/20 p-4">
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Die KI analysiert die Akte und erstellt eine Fall-Strategie mit Erfolgsprognose.
          </p>
          <Button onClick={runAnalysis} disabled={analyzing} className="gap-2">
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("act_analysis.analyzing")}
              </>
            ) : (
              <>
                <Scale className="h-4 w-4" />
                {t("act_analysis.analyze")}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-md border border-[color:var(--ds-danger-border)]/30 bg-[color:var(--ds-danger-bg)]/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[color:var(--ds-danger-text)]" />
          <div className="flex-1">
            <p className="text-sm font-medium text-[color:var(--ds-danger-text)]">
              Analyse fehlgeschlagen
            </p>
            <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">{error}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={runAnalysis}
            disabled={analyzing}
            className="gap-2"
          >
            <RefreshCw className="h-3 w-3" />
            Erneut
          </Button>
        </div>
      )}

      {/* Analysis result */}
      {analysis && (
        <div
          className="animate-in fade-in slide-in-from-bottom-2 space-y-4 duration-300"
          aria-live="polite"
        >
          <AIActConformityBanner purpose="Akt-Analyse & Fall-Strategie" compact />

          {/* Success probability */}
          <div className="from-primary/5 to-primary/10 flex items-center gap-4 rounded-lg border bg-gradient-to-br p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--brand-primary)]/15">
              <TrendingUp className="h-7 w-7 text-[color:var(--brand-primary)]" />
            </div>
            <div>
              <p className="text-xs tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                Erfolgsprognose
              </p>
              <p className="text-2xl font-bold text-[color:var(--ds-text)]">
                {Math.round((analysis.success_probability ?? 0) * 100)}%
              </p>
            </div>
            <div className="ml-auto text-right">
              {analysis.cost_estimate && (
                <>
                  <p className="text-xs tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                    Kostenschätzung
                  </p>
                  <p className="text-sm font-medium">
                    {analysis.cost_estimate.min}–{analysis.cost_estimate.max}{" "}
                    {analysis.cost_estimate.currency}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg border p-4">
            <h3 className="mb-2 text-sm font-semibold">Zusammenfassung</h3>
            <p className="text-sm text-[color:var(--ds-text-muted)]">{analysis.summary}</p>
          </div>

          {/* Recommended approach */}
          {analysis.recommendedApproach && (
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Target className="h-4 w-4 text-[color:var(--brand-primary)]" />
                Empfohlener Ansatz
              </h3>
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                {analysis.recommendedApproach}
              </p>
            </div>
          )}

          {/* Risks */}
          {analysis.risks.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4 text-[color:var(--ds-warning-text)]" />
                Risiken ({analysis.risks.length})
              </h3>
              <ul className="space-y-2">
                {analysis.risks.map((risk, idx) => (
                  <li key={idx} className="rounded-md bg-[color:var(--ds-surface-2)]/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{risk.description}</p>
                      <div className="flex shrink-0 gap-1">
                        <Badge
                          variant="default"
                          className={cn("text-xs", RISK_COLORS[risk.probability])}
                        >
                          {RISK_LABELS[risk.probability]}
                        </Badge>
                        <Badge
                          variant="default"
                          className={cn("text-xs", RISK_COLORS[risk.impact])}
                        >
                          {RISK_LABELS[risk.impact]}
                        </Badge>
                      </div>
                    </div>
                    {risk.mitigation && (
                      <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                        <span className="font-medium">Maßnahme:</span> {risk.mitigation}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next steps */}
          {analysis.next_steps.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 text-sm font-semibold">Nächste Schritte</h3>
              <ol className="list-inside list-decimal space-y-1 text-sm text-[color:var(--ds-text-muted)]">
                {analysis.next_steps.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Re-analyze + next */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={runAnalysis}
              disabled={analyzing}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Erneut analysieren
            </Button>
            <Button onClick={onNext} disabled={!canProceed} className="gap-2">
              {t("act_analysis.next")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
