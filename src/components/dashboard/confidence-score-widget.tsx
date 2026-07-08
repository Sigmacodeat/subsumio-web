"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Gauge, Loader2 } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ConfidenceBadge, type ConfidenceInfo } from "@/components/dashboard/confidence-badge";

interface CasePipelineInfo {
  slug: string;
  title: string;
  status: string;
  total_score: number | null;
  ensemble_recommendation: string | null;
  narrative_coherence_score: number | null;
  pipeline_status: string | null;
}

interface PipelineStatePage {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
}

async function fetchCaseConfidence(): Promise<CasePipelineInfo[]> {
  const pages = await api.brain.listPages({ type: "pipeline_state", limit: 100 });
  return (pages as PipelineStatePage[]).map((p) => {
    const fm = p.frontmatter ?? {};
    const caseSlug = String(fm.case_ref ?? p.slug.replace("pipeline/state-", ""));
    return {
      slug: caseSlug,
      title: String(fm.title ?? caseSlug).replace(/^Pipeline-State — /, ""),
      status: String(fm.status ?? "unknown"),
      total_score: typeof fm.total_score === "number" ? fm.total_score : null,
      ensemble_recommendation:
        typeof fm.ensemble_recommendation === "string" ? fm.ensemble_recommendation : null,
      narrative_coherence_score:
        typeof fm.narrative_coherence_score === "number" ? fm.narrative_coherence_score : null,
      pipeline_status: String(fm.status ?? null),
    };
  });
}

export function ConfidenceScoreWidget() {
  const { t, lang } = useLang();
  const { data, isLoading } = useQuery<CasePipelineInfo[]>({
    queryKey: ["pipeline-confidence"],
    queryFn: fetchCaseConfidence,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => (b.total_score ?? -1) - (a.total_score ?? -1)).slice(0, 8);
  }, [data]);

  const stats = useMemo(() => {
    if (!data || data.length === 0) return null;
    const withScore = data.filter((d) => d.total_score !== null);
    const avg =
      withScore.length > 0
        ? Math.round(withScore.reduce((s, d) => s + (d.total_score ?? 0), 0) / withScore.length)
        : null;
    const high = withScore.filter((d) => (d.total_score ?? 0) >= 70).length;
    const medium = withScore.filter(
      (d) => (d.total_score ?? 0) >= 50 && (d.total_score ?? 0) < 70
    ).length;
    const low = withScore.filter((d) => (d.total_score ?? 0) < 50).length;
    const running = data.filter(
      (d) => d.pipeline_status === "running" || d.pipeline_status === "resuming"
    ).length;
    return { avg, high, medium, low, running, total: data.length };
  }, [data]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Gauge size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {lang === "en" ? "AI Analysis Quality" : "KI-Analyse-Qualität"}
          </span>
        </div>
        <div className="flex h-20 items-center justify-center">
          <Loader2 size={18} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      </section>
    );
  }

  if (!data || data.length === 0 || !stats) {
    return (
      <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Gauge size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {lang === "en" ? "AI Analysis Quality" : "KI-Analyse-Qualität"}
          </span>
        </div>
        <p className="text-[13px] text-[color:var(--ds-text-muted)]">
          {lang === "en"
            ? "No AI analyses yet. Open a case and start an analysis to see quality scores here."
            : "Noch keine KI-Analysen. Öffnen Sie eine Akte und starten Sie eine Analyse — die Qualitätswerte erscheinen hier."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {lang === "en" ? "AI Analysis Quality" : "KI-Analyse-Qualität"}
          </span>
        </div>
        {stats.avg !== null && (
          <span className="text-xs text-[color:var(--ds-text-subtle)]">
            {lang === "en" ? "Avg" : "Ø"}{" "}
            <span className="font-semibold text-[color:var(--ds-text)] tabular-nums">
              {stats.avg}
            </span>
            /100
          </span>
        )}
      </div>

      {/* Distribution bar */}
      {stats.total > 0 && (
        <div className="mb-3 flex h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--ds-bg)]">
          {stats.high > 0 && (
            <div
              className="bg-emerald-500"
              style={{ width: `${(stats.high / stats.total) * 100}%` }}
              title={`${stats.high} high`}
            />
          )}
          {stats.medium > 0 && (
            <div
              className="bg-amber-500"
              style={{ width: `${(stats.medium / stats.total) * 100}%` }}
              title={`${stats.medium} medium`}
            />
          )}
          {stats.low > 0 && (
            <div
              className="bg-red-500"
              style={{ width: `${(stats.low / stats.total) * 100}%` }}
              title={`${stats.low} low`}
            />
          )}
          {stats.running > 0 && (
            <div
              className="bg-blue-500"
              style={{ width: `${(stats.running / stats.total) * 100}%` }}
              title={`${stats.running} running`}
            />
          )}
        </div>
      )}

      {/* Case list */}
      <div className="space-y-1.5">
        {sorted.map((c) => {
          const info: ConfidenceInfo = {
            score: c.total_score,
            recommendation: c.ensemble_recommendation,
            coherenceScore: c.narrative_coherence_score,
            status: c.pipeline_status,
          };
          const encoded = c.slug.split("/").map(encodeURIComponent).join("/");
          return (
            <Link
              key={c.slug}
              href={`/dashboard/cases/${encoded}`}
              className="group flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-[color:var(--ds-hover)]"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--ds-text)]">
                {c.title}
              </span>
              <ConfidenceBadge info={info} lang={lang} showScore={true} size="sm" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
