"use client";

import { useState, useEffect } from "react";
import {
  Lightbulb,
  X,
  Loader2,
  FileText,
  Scale,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { cn } from "@/lib/utils";

interface ExplanationData {
  reasoning: string;
  sources: Array<{
    slug: string;
    title: string;
    snippet: string;
    score: number;
    source: string;
    source_type?: string;
    search_mode?: string;
  }>;
  confidence: "high" | "medium" | "low";
  legalBasis: string[];
  caveats: string[];
}

interface CopilotExplanationPanelProps {
  query: string;
  answer: string;
  onClose: () => void;
}

const CONFIDENCE_STYLES = {
  high: {
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    labelDe: "Hoch",
    labelEn: "High",
  },
  medium: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    labelDe: "Mittel",
    labelEn: "Medium",
  },
  low: {
    icon: AlertTriangle,
    color: "text-red-600",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    labelDe: "Niedrig",
    labelEn: "Low",
  },
};

const SOURCE_TYPE_LABELS_DE: Record<string, string> = {
  statute_corpus: "Gesetzescorpus",
  judgement_api: "Rechtsprechung",
  dms: "Dokument",
  email: "E-Mail",
  whatsapp: "WhatsApp",
  portal: "Mandantenportal",
  upload: "Upload",
  regulatory_feed: "Regulatorisch",
  commercial: "Kommerziell",
  internal: "Intern",
};

export function CopilotExplanationPanel({ query, answer, onClose }: CopilotExplanationPanelProps) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExplanationData | null>(null);
  const [expandedSources, setExpandedSources] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await csrfFetch("/api/copilot/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, answer }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json.explanation);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, answer]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
        <Loader2 size={14} className="animate-spin text-[color:var(--brand-primary)]" />
        <span className="text-xs text-[color:var(--ds-text-muted)]">
          {isEn ? "Analyzing reasoning..." : "Analysiere Begründung..."}
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-600" />
          <span className="text-xs text-red-600">
            {isEn ? "Explanation unavailable" : "Erklärung nicht verfügbar"}
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded p-0.5 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  const conf = CONFIDENCE_STYLES[data.confidence];
  const ConfIcon = conf.icon;

  return (
    <div className="space-y-2.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb size={14} className="text-[color:var(--brand-primary)]" />
          <span className="text-xs font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Explanation" : "Erklärung"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
        >
          <X size={12} />
        </button>
      </div>

      {/* Confidence */}
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2 py-1",
          conf.border,
          conf.bg
        )}
      >
        <ConfIcon size={12} className={conf.color} />
        <span className="text-[11px] font-medium text-[color:var(--ds-text)]">
          {isEn ? "Confidence" : "Konfidenz"}: {isEn ? conf.labelEn : conf.labelDe}
        </span>
      </div>

      {/* Reasoning */}
      <div>
        <p className="mb-1 text-[10px] font-medium tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
          {isEn ? "Reasoning" : "Begründung"}
        </p>
        <p className="text-[11px] leading-relaxed text-[color:var(--ds-text-muted)]">
          {data.reasoning}
        </p>
      </div>

      {/* Legal Basis */}
      {data.legalBasis.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-medium tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
            <Scale size={10} />
            {isEn ? "Legal Basis" : "Rechtsgrundlage"}
          </p>
          <div className="flex flex-wrap gap-1">
            {data.legalBasis.map((basis, i) => (
              <span
                key={i}
                className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--ds-text)]"
              >
                {basis}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {data.sources.length > 0 && (
        <div>
          <button
            onClick={() => setExpandedSources((v) => !v)}
            className="mb-1 flex w-full items-center gap-1 text-[10px] font-medium tracking-wide text-[color:var(--ds-text-subtle)] uppercase hover:text-[color:var(--ds-text)]"
          >
            <FileText size={10} />
            {isEn ? `Sources (${data.sources.length})` : `Quellen (${data.sources.length})`}
            {expandedSources ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
          {expandedSources && (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {data.sources.map((src, i) => (
                <div
                  key={i}
                  className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] font-medium text-[color:var(--ds-text)]">
                      {src.title}
                    </span>
                    <span className="shrink-0 text-[9px] text-[color:var(--ds-text-subtle)]">
                      {(src.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[10px] text-[color:var(--ds-text-muted)]">
                    {src.snippet}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1">
                    <span className="rounded bg-[color:var(--ds-surface)] px-1 py-0.5 text-[8px] text-[color:var(--ds-text-subtle)]">
                      {SOURCE_TYPE_LABELS_DE[src.source_type ?? src.source] ?? src.source}
                    </span>
                    {src.search_mode && (
                      <span className="text-[8px] text-[color:var(--ds-text-subtle)]">
                        · {src.search_mode}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Caveats */}
      {data.caveats.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-medium tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
            <BookOpen size={10} />
            {isEn ? "Caveats" : "Hinweise"}
          </p>
          <ul className="space-y-0.5">
            {data.caveats.map((caveat, i) => (
              <li
                key={i}
                className="flex items-start gap-1 text-[10px] text-[color:var(--ds-text-muted)]"
              >
                <span className="mt-0.5 shrink-0 text-[color:var(--ds-text-subtle)]">•</span>
                <span>{caveat}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
