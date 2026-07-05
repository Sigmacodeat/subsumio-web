"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Brain, FileText, Network, Scale } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

interface IntelligenceReport {
  metrics: {
    total: number;
    failed: number;
    partial: number;
    classificationPercent: number;
    onCoveragePercent: number;
  };
  classifications: Array<{ classification: string; count: number }>;
  problem_items: Array<{ id: string; relativePath: string; status: string }>;
  pipeline_state: Record<string, unknown> | string | null;
  on_index: Record<string, unknown> | string | null;
}

function countOn(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return new Set(text.match(/ON\s+\d+(?:\.\d+)*/gi) ?? []).size;
}

export function ActIntelligencePanel({ caseSlug }: { caseSlug: string }) {
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const casePage = await api.brain.getPage(caseSlug);
        const sessionId = String(
          (casePage.frontmatter as Record<string, unknown> | undefined)?.active_import_session_id ??
            ""
        );
        if (!sessionId) return;
        const response = await fetch(`/api/act-imports/${encodeURIComponent(sessionId)}/report`, {
          cache: "no-store",
        });
        if (response.ok && !cancelled) setReport((await response.json()) as IntelligenceReport);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseSlug]);
  if (loading)
    return (
      <div className="text-xs text-[color:var(--ds-text-muted)]">
        Aktenintelligenz wird geladen…
      </div>
    );
  if (!report) return null;
  const state =
    typeof report.pipeline_state === "object" && report.pipeline_state ? report.pipeline_state : {};
  const encode = (slug: string) => encodeURIComponent(slug);
  return (
    <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-center gap-2">
        <Brain size={18} className="brand-text" />
        <h3 className="font-semibold">Aktenintelligenz im Brain</h3>
        <Badge variant="info">Snapshot aktiv</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric icon={FileText} label="Dokumente" value={report.metrics.total} />
        <Metric
          icon={Scale}
          label="Klassifiziert"
          value={`${report.metrics.classificationPercent}%`}
        />
        <Metric icon={Network} label="ON-Nummern" value={countOn(report.on_index)} />
        <Metric
          icon={AlertTriangle}
          label="Widersprüche"
          value={Number(state.contradiction_findings ?? 0)}
        />
        <Metric icon={AlertTriangle} label="Problemdateien" value={report.problem_items.length} />
      </div>
      <div className="flex flex-wrap gap-2">
        {report.classifications.map((entry) => (
          <Badge key={entry.classification} variant="info">
            {entry.classification}: {entry.count}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <Link
          className="brand-text hover:underline"
          href={`/dashboard/brain/${encode(`on-index/${caseSlug}`)}`}
        >
          ON-Liste öffnen
        </Link>
        <Link
          className="brand-text hover:underline"
          href={`/dashboard/brain/${encode(`damage-tables/${caseSlug}`)}`}
        >
          Schadenstabelle öffnen
        </Link>
        <Link
          className="brand-text hover:underline"
          href={`/dashboard/brain/${encode(`deadline-calendars/${caseSlug}`)}`}
        >
          Fristenkalender öffnen
        </Link>
        <Link
          className="brand-text hover:underline"
          href={`/dashboard/brain/${encode(`pipeline/state-${caseSlug}`)}`}
        >
          Pipeline-State öffnen
        </Link>
      </div>
      <p className="text-xs text-[color:var(--ds-text-muted)]">
        Copilot verwendet denselben Akten-Slug und aktiven Snapshot. Forensische Antworten bleiben
        auf Dokument, Seite und ON rückführbar.
      </p>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Brain;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-2">
      <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
        <Icon size={12} />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
