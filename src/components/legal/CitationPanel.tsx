"use client";

import { useState, useMemo } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Gauge,
  FileText,
  ChevronDown,
  ChevronRight,
  Scale,
  BookOpen,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CitationLink, GroundingBadge } from "@/components/legal/CitationLink";
import { AI_BADGE_LABEL, AI_NOTICE } from "@/lib/ai-act";
import { assessGroundedness } from "@/lib/groundedness";
import type { GroundedCitation } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────

export interface CitationPanelData {
  /** Brain citations (slug + title) from the engine. */
  citations?: Array<{ slug: string; title: string }>;
  /** Gaps reported by the engine. */
  gaps?: string[];
  /** Corpus grounding metadata from citation-gate. */
  grounding?: {
    citations_verified: number;
    citations_unverified: number;
    corpus_checked: boolean;
    grounded_citations: GroundedCitation[];
    analyzed_at: string;
  } | null;
  /** Whether the AI output has been fully streamed / is final. */
  isStreaming?: boolean;
  /** Whether attorney review is required (default: true for legal AI). */
  attorneyReviewRequired?: boolean;
  /** Optional jurisdiction label for display. */
  jurisdiction?: string;
}

interface CitationPanelProps {
  data: CitationPanelData;
  /** Compact mode: fewer details, inline badges only. */
  compact?: boolean;
  className?: string;
}

// ── Main Component ────────────────────────────────────────────────────

export function CitationPanel({ data, compact = false, className }: CitationPanelProps) {
  const [expanded, setExpanded] = useState(!compact);

  const ground = useMemo(
    () => assessGroundedness(data.citations, data.gaps),
    [data.citations, data.gaps]
  );

  const hasGroundingData = data.grounding != null;
  const hasGrounding = data.grounding && data.grounding.corpus_checked;
  const hasCitations = (data.citations?.length ?? 0) > 0;
  const hasGaps = (data.gaps?.length ?? 0) > 0;
  const hasGroundedCitations = (data.grounding?.grounded_citations?.length ?? 0) > 0;
  const showAnything = hasCitations || hasGaps || hasGroundingData || !data.isStreaming;

  if (!showAnything && data.isStreaming) return null;

  const requiresReview = data.attorneyReviewRequired ?? true;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]",
        className
      )}
      data-testid="citation-panel"
    >
      {/* Header row: badges */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        {/* AI Act Art. 50 badge */}
        {!data.isStreaming && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                  aria-label={AI_NOTICE}
                >
                  <Info size={10} aria-hidden="true" />
                  {AI_BADGE_LABEL}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
                {AI_NOTICE}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Groundedness badge (Brain source coverage) */}
        {!data.isStreaming && (
          <span
            title={ground.hint}
            aria-label={`Quellendeckung: ${ground.label}. ${ground.hint}`}
            className={cn(
              "inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              ground.cls
            )}
          >
            <Gauge size={10} aria-hidden="true" />
            {ground.label}
            {ground.citationCount > 0 && (
              <span className="opacity-70">· {ground.citationCount}</span>
            )}
          </span>
        )}

        {/* Corpus grounding badge */}
        {hasGroundingData && (
          <GroundingBadge
            verified={data.grounding!.citations_verified}
            unverified={data.grounding!.citations_unverified}
            corpusChecked={data.grounding!.corpus_checked}
          />
        )}

        {/* Attorney review warning */}
        {requiresReview && !data.isStreaming && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400"
            title="Diese AI-Ausgabe erfordert anwaltliche Prüfung, bevor sie verwendet wird."
          >
            <ShieldAlert size={10} aria-hidden="true" />
            Anwaltlich zu prüfen
          </span>
        )}

        {/* Jurisdiction badge */}
        {data.jurisdiction && (
          <Badge variant="accent" className="text-xs">
            {data.jurisdiction.toUpperCase()}
          </Badge>
        )}

        {/* Expand/collapse toggle */}
        {(hasCitations || hasGaps || hasGroundedCitations) && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
            aria-expanded={expanded}
            aria-label={expanded ? "Details ausblenden" : "Details einblenden"}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? "Weniger" : "Mehr"}
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (hasCitations || hasGaps || hasGroundedCitations) && (
        <div className="space-y-3 border-t border-[color:var(--ds-border)] px-4 py-3">
          {/* Grounded citations list (corpus-verified) */}
          {hasGroundedCitations && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Scale size={12} className="text-[color:var(--ds-text-muted)]" />
                <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  Corpus-Grounding ({data.grounding!.grounded_citations.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {data.grounding!.grounded_citations.map((gc, i) => (
                  <div
                    key={`${gc.code}-${gc.paragraph}-${i}`}
                    className="flex items-start gap-2 text-xs"
                  >
                    {gc.verified ? (
                      <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                    ) : (
                      <AlertCircle size={12} className="mt-0.5 shrink-0 text-amber-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <CitationLink
                        citation={`${gc.paragraph} ${gc.code}`}
                        grounding={gc}
                        className="text-xs"
                      />
                      {gc.verified && gc.source_text && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--ds-text-subtle)]">
                          {gc.source_text}
                        </p>
                      )}
                      {!gc.verified && (
                        <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-500">
                          Nicht im Corpus gefunden — möglicherweise erfunden oder außerhalb des
                          abgedeckten Rechtskreises.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Brain citations (source pages) */}
          {hasCitations && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <FileText size={12} className="text-[color:var(--ds-text-muted)]" />
                <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  Brain-Quellen ({data.citations!.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.citations!.map((c) => (
                  <a
                    key={c.slug}
                    href={`/dashboard/brain/${c.slug.split("/").map(encodeURIComponent).join("/")}`}
                    className="hover:brand-text hover:brand-border inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    target="_blank"
                    rel="noopener noreferrer"
                    title={c.title}
                  >
                    <BookOpen size={9} />
                    {c.title}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {hasGaps && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-amber-600" />
                <span className="text-xs font-medium text-amber-600">
                  Lücken im Brain ({data.gaps!.length})
                </span>
              </div>
              <ul className="space-y-1">
                {data.gaps!.map((gap, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-500"
                  >
                    <span className="shrink-0 text-amber-500">⚠</span>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Grounding timestamp */}
          {hasGrounding && data.grounding!.analyzed_at && (
            <div className="border-t border-[color:var(--ds-border)] pt-1 text-xs text-[color:var(--ds-text-subtle)]">
              Corpus geprüft am {new Date(data.grounding!.analyzed_at).toLocaleString("de-DE")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline badge strip (for compact spaces like chat messages) ────────

export function CitationBadgesInline({
  data,
  className,
}: {
  data: CitationPanelData;
  className?: string;
}) {
  const ground = assessGroundedness(data.citations, data.gaps);
  const hasGrounding = data.grounding && data.grounding.corpus_checked;

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {!data.isStreaming && (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
          title={AI_NOTICE}
        >
          <Info size={9} />
          {AI_BADGE_LABEL}
        </span>
      )}
      {!data.isStreaming && (
        <span
          title={ground.hint}
          className={cn(
            "inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
            ground.cls
          )}
        >
          <Gauge size={9} />
          {ground.label}
        </span>
      )}
      {hasGrounding && (
        <GroundingBadge
          verified={data.grounding!.citations_verified}
          unverified={data.grounding!.citations_unverified}
          corpusChecked={data.grounding!.corpus_checked}
        />
      )}
    </div>
  );
}
