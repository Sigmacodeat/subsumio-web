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
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CitationLink, GroundingBadge } from "@/components/legal/CitationLink";
import { AI_BADGE_LABEL, AI_NOTICE } from "@/lib/ai-act";
import { assessGroundedness } from "@/lib/groundedness";
import { formatCitationTitle } from "@/lib/ogh-format";
import type { GroundedCitation } from "@/lib/types";
import { useLang } from "@/lib/use-lang";
import { extractStatuteCitations } from "@/lib/citation-gate-client";
import { openNormReader, readerJurisdiction } from "@/lib/norm-reader-events";

// ── Types ─────────────────────────────────────────────────────────────

export interface CitationPanelData {
  /** Brain citations (slug + title) from the engine; `quote` opens the page at that passage. */
  citations?: Array<{ slug: string; title: string; quote?: string }>;
  /** Gaps reported by the engine. */
  gaps?: string[];
  /** Corpus grounding metadata from citation-gate. */
  grounding?: {
    citations_verified: number;
    citations_unverified: number;
    corpus_checked: boolean;
    grounded_citations: GroundedCitation[];
    analyzed_at: string;
    has_unverified?: boolean;
    warning?: string;
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

const SUPPORT_STYLE: Record<
  "supported" | "partial" | "unsupported",
  { label: string; cls: string }
> = {
  supported: { label: "Trägt die Aussage", cls: "text-[color:var(--ds-success-text)]" },
  partial: {
    label: "Trägt die Aussage nur teilweise",
    cls: "text-[color:var(--ds-warning-text)]",
  },
  unsupported: {
    label: "Trägt die Aussage nicht",
    cls: "text-[color:var(--ds-danger-text)]",
  },
};

export function CitationPanel({ data, compact = false, className }: CitationPanelProps) {
  const { lang } = useLang();
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
  const misgrounded = (data.grounding?.grounded_citations ?? [])
    .filter((gc) => gc.verified && gc.support === "unsupported")
    .map((gc) =>
      gc.category === "judikatur" ? `${gc.code} ${gc.paragraph}` : `${gc.paragraph} ${gc.code}`
    );
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
        {/* AI Act Art. 50 badge — merged into the review badge when review is
            required, so the same statement is not shown twice. */}
        {!data.isStreaming && !requiresReview && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-warning-text)]"
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
            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-warning-text)]"
            title={AI_NOTICE}
            aria-label={AI_NOTICE}
          >
            <ShieldAlert size={10} aria-hidden="true" />
            <span>KI-generiert ·</span>
            <span>Anwaltlich zu prüfen</span>
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
            className="ml-auto inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
            aria-expanded={expanded}
            aria-label={expanded ? "Details ausblenden" : "Details einblenden"}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? "Weniger" : "Mehr"}
          </button>
        )}
      </div>

      {/* Misgrounded: a real source cited for a statement it does not carry. */}
      {misgrounded.length > 0 && (
        <div
          role="alert"
          className="mx-4 mt-2 flex items-start gap-2 rounded-md border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]"
        >
          <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {misgrounded.length === 1
              ? "Eine zitierte Quelle trägt die Aussage nicht, für die sie angeführt wird: "
              : `${misgrounded.length} zitierte Quellen tragen die Aussage nicht, für die sie angeführt werden: `}
            <strong>{misgrounded.join(", ")}</strong>. Diese Stellen vor Verwendung prüfen.
          </span>
        </div>
      )}

      {/* Unverified citation warning */}
      {data.grounding?.has_unverified && data.grounding.warning && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{data.grounding.warning}</span>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (hasCitations || hasGaps || hasGroundedCitations) && (
        <div className="space-y-3 border-t border-[color:var(--ds-border)] px-4 py-3">
          {/* Grounded citations list (corpus-verified) */}
          {hasGroundedCitations && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Scale size={12} className="text-[color:var(--ds-text-muted)]" />
                <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  Geprüfte Rechtsquellen ({data.grounding!.grounded_citations.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {data.grounding!.grounded_citations.map((gc, i) => (
                  <div
                    key={`${gc.code}-${gc.paragraph}-${i}`}
                    className="flex items-start gap-2 text-xs"
                  >
                    {gc.verified ? (
                      <CheckCircle2
                        size={12}
                        className="mt-0.5 shrink-0 text-[color:var(--ds-success-text)]"
                      />
                    ) : (
                      <AlertCircle
                        size={12}
                        className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <CitationLink
                        citation={`${gc.paragraph} ${gc.code}`}
                        grounding={gc}
                        className="text-xs"
                      />
                      {gc.verified && gc.support && gc.support !== "unchecked" && (
                        <p
                          className={cn(
                            "mt-0.5 text-xs font-medium",
                            SUPPORT_STYLE[gc.support].cls
                          )}
                        >
                          {SUPPORT_STYLE[gc.support].label}
                          {gc.support_reason && (
                            <span className="font-normal"> — {gc.support_reason}</span>
                          )}
                        </p>
                      )}
                      {gc.verified && gc.source_text && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--ds-text-subtle)]">
                          {gc.source_text}
                        </p>
                      )}
                      {!gc.verified && gc.category === "judikatur" && (
                        <p className="mt-0.5 text-xs text-[color:var(--ds-warning-text)]">
                          Nicht in unserem Entscheidungskorpus — Geschäftszahl bitte im RIS prüfen
                          (Link oben).
                        </p>
                      )}
                      {!gc.verified && gc.category !== "judikatur" && (
                        <p className="mt-0.5 text-xs text-[color:var(--ds-warning-text)]">
                          Nicht in den Rechtsquellen gefunden — möglicherweise falsch zitiert oder
                          außerhalb des abgedeckten Rechtskreises.
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
                  Quellen aus Akte und Kanzleiwissen ({data.citations!.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.citations!.map((c) => {
                  // Norm citations ("legal/norms/…") are not brain pages — they
                  // open the norm reader with the corpus text instead of a 404.
                  const norm = c.slug.startsWith("legal/norms/")
                    ? extractStatuteCitations(c.title)[0]
                    : undefined;
                  if (norm?.code && norm.paragraph) {
                    return (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() =>
                          openNormReader({
                            code: norm.code!,
                            paragraph: norm.paragraph!,
                            jurisdiction: readerJurisdiction(data.jurisdiction),
                          })
                        }
                        className="hover:brand-text hover:brand-border inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                        title={`${c.title}: Normtext anzeigen`}
                      >
                        <BookOpen size={9} />
                        {c.title}
                      </button>
                    );
                  }
                  return (
                    <a
                      key={c.slug}
                      href={`/dashboard/brain/${encodeURIComponent(c.slug)}${
                        c.quote ? `?hl=${encodeURIComponent(c.quote.slice(0, 300))}` : ""
                      }`}
                      className="hover:brand-text hover:brand-border inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                      target="_blank"
                      rel="noopener noreferrer"
                      title={c.title}
                    >
                      <BookOpen size={9} />
                      {formatCitationTitle(c.title, c.slug)}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Gaps */}
          {hasGaps && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-[color:var(--ds-warning-text)]" />
                <span className="text-xs font-medium text-[color:var(--ds-warning-text)]">
                  Nicht belegt ({data.gaps!.length})
                </span>
              </div>
              <ul className="space-y-1">
                {data.gaps!.map((gap, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-[color:var(--ds-warning-text)]"
                  >
                    <span className="shrink-0 text-[color:var(--ds-warning-text)]">⚠</span>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Grounding timestamp */}
          {hasGrounding && data.grounding!.analyzed_at && (
            <div className="border-t border-[color:var(--ds-border)] pt-1 text-xs text-[color:var(--ds-text-subtle)]">
              {lang === "en"
                ? "Checked against legal sources on"
                : "Gegen die Rechtsquellen geprüft am"}{" "}
              {formatDateTime(data.grounding!.analyzed_at)}
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
          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-warning-text)]"
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
