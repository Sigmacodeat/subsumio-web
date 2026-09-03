"use client";

import { useState, useCallback } from "react";
import {
  Loader2,
  AlertTriangle,
  Swords,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  ShieldAlert,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AIActConformityBanner } from "@/components/legal/AIActConformityBanner";
import { useLang } from "@/lib/use-lang";
import type { BerufungsGrund, OpponentFinding } from "@/app/dashboard/berufungs-agent/page";

interface OpponentStepProps {
  caseSlug: string;
  draftContent: string;
  selectedGruende: BerufungsGrund[];
  findings: OpponentFinding[];
  onFindingsChange: (f: OpponentFinding[]) => void;
  onNext: () => void;
  onBack: () => void;
}

const SEVERITY_STYLES = {
  kritisch:
    "bg-[color:var(--ds-danger-bg)]/10 text-[color:var(--ds-danger-text)] border-[color:var(--ds-danger-border)]/30 dark:text-[color:var(--ds-danger-text)]",
  mittel:
    "bg-[color:var(--ds-warning-bg)]/10 text-amber-700 border-[color:var(--ds-warning-border)]/30 dark:text-[color:var(--ds-warning-text)]",
  niedrig:
    "bg-emerald-500/10 text-emerald-700 border-[color:var(--ds-success-border)]/30 dark:text-[color:var(--ds-success-text)]",
} as const;

const SEVERITY_TEXT = {
  kritisch: "berufung.opponent.severity.kritisch",
  mittel: "berufung.opponent.severity.mittel",
  niedrig: "berufung.opponent.severity.niedrig",
} as const;

export function OpponentStep({
  caseSlug,
  draftContent,
  selectedGruende,
  findings,
  onFindingsChange,
  onNext,
  onBack,
}: OpponentStepProps) {
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overallAssessment, setOverallAssessment] = useState("");
  const [recommendedResponse, setRecommendedResponse] = useState("");
  const [streamingProgress, setStreamingProgress] = useState("");
  const { addToast } = useToast();
  const { t } = useLang();

  const simulate = useCallback(async () => {
    if (!draftContent.trim()) {
      addToast({
        type: "error",
        title: t("berufung.opponent.no_draft"),
        description: t("berufung.opponent.no_draft_desc"),
      });
      return;
    }
    setSimulating(true);
    setError(null);
    setStreamingProgress("");
    try {
      const result = await api.legal.opponentSimulation({
        case_slug: caseSlug,
        draft_content: draftContent,
        selected_gruende: selectedGruende.map((g) => ({
          titel: g.titel,
          beschreibung: g.beschreibung,
          erfolgsprognose: g.erfolgsprognose,
        })),
        jurisdiction: "all",
        language: "de",
        onChunk: (chunk) => {
          setStreamingProgress((prev) => prev + chunk);
        },
      });
      onFindingsChange(result.findings);
      setOverallAssessment(result.overall_assessment);
      setRecommendedResponse(result.recommended_response);
      addToast({
        type: "success",
        title: t("berufung.opponent.toast_done"),
        description: `${result.findings.length} ${t("berufung.opponent.toast_weaknesses")}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addToast({ type: "error", title: t("berufung.opponent.failed"), description: msg });
    } finally {
      setSimulating(false);
      setStreamingProgress("");
    }
  }, [caseSlug, draftContent, selectedGruende, onFindingsChange, addToast, t]);

  const hasResults = findings.length > 0 || overallAssessment || recommendedResponse;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Swords className="h-5 w-5 text-[color:var(--brand-primary)]" />
          {t("berufung.opponent.title")}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
          {t("berufung.opponent.desc")}
        </p>
      </div>

      {/* Simulate button */}
      {!hasResults && !simulating && (
        <div className="flex flex-col items-start gap-3 rounded-md border bg-[color:var(--ds-surface-2)]/20 p-4">
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            {t("berufung.opponent.intro")}
          </p>
          <Button
            onClick={simulate}
            disabled={simulating || !draftContent.trim()}
            className="gap-2"
          >
            <Swords className="h-4 w-4" />
            {t("berufung.opponent.start")}
          </Button>
        </div>
      )}

      {/* Simulating state with streaming progress */}
      {simulating && (
        <div className="space-y-3 rounded-md border bg-[color:var(--ds-surface-2)]/20 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[color:var(--brand-primary)]" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {t("berufung.opponent.running")}
            </p>
          </div>
          {streamingProgress && (
            <div className="mt-2 max-h-32 overflow-y-auto rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-2">
              <p className="font-mono text-xs whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                {streamingProgress.slice(-800)}
                <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-[color:var(--brand-primary)]" />
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-md border border-[color:var(--ds-danger-border)]/30 bg-[color:var(--ds-danger-bg)]/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[color:var(--ds-danger-text)]" />
          <div className="flex-1">
            <p className="text-sm font-medium text-[color:var(--ds-danger-text)]">
              {t("berufung.opponent.failed")}
            </p>
            <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">{error}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={simulate}
            disabled={simulating}
            className="gap-2"
          >
            <RefreshCw className="h-3 w-3" />
            {t("berufung.opponent.retry")}
          </Button>
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <div
          className="animate-in fade-in slide-in-from-bottom-2 space-y-4 duration-300"
          aria-live="polite"
        >
          <AIActConformityBanner purpose="Gegner-Simulation" compact />

          {/* Overall assessment */}
          {overallAssessment && (
            <div className="rounded-lg border border-[color:var(--ds-warning-border)]/30 bg-[color:var(--ds-warning-bg)]/5 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4 text-[color:var(--ds-warning-text)]" />
                {t("berufung.opponent.overall")}
              </h3>
              <p className="text-sm text-[color:var(--ds-text-muted)]">{overallAssessment}</p>
            </div>
          )}

          {/* Findings */}
          {findings.length > 0 && (
            <div className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Swords className="h-4 w-4 text-[color:var(--brand-primary)]" />
                  {t("berufung.opponent.weaknesses")} ({findings.length})
                </h3>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={simulate}
                  disabled={simulating}
                  className="gap-2"
                >
                  <RefreshCw className="h-3 w-3" />
                  {t("berufung.opponent.resimulate")}
                </Button>
              </div>
              <ul className="space-y-2">
                {findings.map((finding, idx) => (
                  <li key={idx} className="rounded-md bg-[color:var(--ds-surface-2)]/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 text-sm font-medium">{finding.argument}</p>
                      <Badge
                        variant="default"
                        className={cn("shrink-0 text-xs", SEVERITY_STYLES[finding.severity])}
                      >
                        {t(SEVERITY_TEXT[finding.severity])}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1.5 text-sm">
                      <p>
                        <span className="font-medium text-[color:var(--ds-danger-text)]">
                          {t("berufung.opponent.counterarg")}
                        </span>{" "}
                        <span className="text-[color:var(--ds-text-muted)]">
                          {finding.gegenargument}
                        </span>
                      </p>
                      <p>
                        <span className="font-medium text-[color:var(--brand-primary)]">
                          {t("berufung.opponent.recommendation")}
                        </span>{" "}
                        <span className="text-[color:var(--ds-text-muted)]">
                          {finding.empfehlung}
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended response */}
          {recommendedResponse && (
            <div className="rounded-lg border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Lightbulb className="h-4 w-4 text-[color:var(--brand-primary)]" />
                {t("berufung.opponent.strategy")}
              </h3>
              <p className="text-sm text-[color:var(--ds-text-muted)]">{recommendedResponse}</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t("berufung.opponent.back")}
        </Button>
        <Button onClick={onNext} className="gap-2">
          {t("berufung.opponent.next")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
