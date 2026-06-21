"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, AlertCircle, FileText, ShieldAlert, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AI_BADGE_LABEL, AI_NOTICE } from "@/lib/ai-act";
import { assessGroundedness, type Groundedness } from "@/lib/groundedness";
import type { GroundedCitation } from "@/lib/types";

interface CitationLinkProps {
  citation: string;
  className?: string;
  grounding?: GroundedCitation | null;
}

export function CitationLink({ citation, className, grounding }: CitationLinkProps) {
  const normalized = normalizeCitation(citation);
  const isVerified = grounding?.verified ?? null;

  const linkContent = (
    <Link
      href={`/dashboard/norms?citation=${encodeURIComponent(normalized)}`}
      className={cn(
        "brand-text hover:brand-text inline-flex cursor-pointer items-center gap-1 underline decoration-[color:var(--brand-primary)]/30 underline-offset-2 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:decoration-[color:var(--brand-primary)]",
        className
      )}
    >
      <BookOpen size={10} />
      {citation}
      {isVerified === true && <CheckCircle2 size={10} className="text-emerald-500" />}
      {isVerified === false && <AlertCircle size={10} className="text-amber-500" />}
    </Link>
  );

  if (!grounding || !grounding.source_text) {
    return linkContent;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-md text-xs leading-relaxed whitespace-pre-wrap">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <FileText size={12} />
            Corpus-Quelltext
          </div>
          <div className="line-clamp-6 text-[color:var(--ds-text-muted)]">
            {grounding.source_text}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Grounding Badge ───────────────────────────────────────────────────

interface GroundingBadgeProps {
  verified: number;
  unverified: number;
  corpusChecked: boolean;
  className?: string;
}

export function GroundingBadge({
  verified,
  unverified,
  corpusChecked,
  className,
}: GroundingBadgeProps) {
  if (!corpusChecked) {
    return (
      <Badge variant="default" className={className}>
        <AlertCircle size={10} />
        Corpus nicht geprüft
      </Badge>
    );
  }

  if (verified === 0 && unverified === 0) {
    return null;
  }

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      {verified > 0 && (
        <Badge variant="success">
          <CheckCircle2 size={10} />
          {verified} verifiziert
        </Badge>
      )}
      {unverified > 0 && (
        <Badge variant="warning">
          <AlertCircle size={10} />
          {unverified} nicht verifiziert
        </Badge>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function normalizeCitation(citation: string): string {
  const trimmed = citation.trim();

  if (trimmed.toLowerCase().startsWith("ecli")) {
    return trimmed.replace(/:/g, "-").toLowerCase();
  }

  const statuteMatch = trimmed.match(
    /[§§]\s*(\d+(?:\s*[a-z])?)\s*(?:Abs\.?\s*(\d+)\s*)?(?:S\.?\s*(\d+)\s*)?(?:[A-Z]{2,})/
  );
  if (statuteMatch) {
    const code = statuteMatch[0].match(/[A-Z]{2,}/)?.[0]?.toLowerCase() || "";
    const section = statuteMatch[1];
    return `legal/norms/${code}/${section}`;
  }

  const artMatch = trimmed.match(/Art\.?\s*(\d+)(?:\s*[a-z])?\s*([A-Z]{2,})/);
  if (artMatch) {
    const code = artMatch[2].toLowerCase();
    const article = artMatch[1];
    return `legal/norms/${code}/art-${article}`;
  }

  return trimmed;
}

/**
 * Parse text and extract citation patterns, returning an array of
 * { text: string, isCitation: boolean } segments.
 */
export function parseCitations(text: string): Array<{ text: string; isCitation: boolean }> {
  const segments: Array<{ text: string; isCitation: boolean }> = [];

  const citationRegex =
    /(\bECLI:[A-Z]{2}:[A-Z]+:\d{4}:[^\s]+)|([§§]\s*\d+(?:\s*[a-z])?(?:\s*Abs\.?\s*\d+)?(?:\s*S\.?\s*\d+)?\s*[A-Z]{2,}\b)|(\bArt\.?\s*\d+(?:\s*[a-z])?\s*[A-Z]{2,}\b)|(\bBGHZ?\s*\d+[,\s]+\d+)|(\bBVerwG\s+\d+[,\s]+\d+)/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isCitation: false });
    }
    segments.push({ text: match[0], isCitation: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isCitation: false });
  }

  return segments;
}

// ── AI Badge (EU AI Act Art. 50) ──────────────────────────────────────

interface AIBadgeProps {
  size?: "sm" | "md";
  className?: string;
  showTooltip?: boolean;
}

export function AIBadge({ size = "sm", className, showTooltip = true }: AIBadgeProps) {
  const sizeClasses = size === "sm" ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1";

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 font-medium text-amber-700",
        sizeClasses,
        className
      )}
      aria-label={AI_NOTICE}
    >
      <ShieldAlert size={size === "sm" ? 10 : 12} aria-hidden="true" />
      {AI_BADGE_LABEL}
    </span>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm text-xs leading-relaxed">
          {AI_NOTICE}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Grounding Status Badge ────────────────────────────────────────────

interface GroundingStatusProps {
  citations?: { slug: string }[] | undefined;
  gaps?: string[] | undefined;
  className?: string;
}

export function GroundingStatus({ citations, gaps, className }: GroundingStatusProps) {
  const ground: Groundedness = assessGroundedness(citations, gaps);

  return (
    <span
      title={ground.hint}
      aria-label={`Quellendeckung: ${ground.label}. ${ground.hint}`}
      className={cn(
        "inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        ground.cls,
        className
      )}
    >
      <Gauge size={10} aria-hidden="true" />
      {ground.label}
      {ground.citationCount > 0 && <span className="opacity-70">· {ground.citationCount}</span>}
    </span>
  );
}

// ── Attorney Review Warning ───────────────────────────────────────────

interface AttorneyReviewWarningProps {
  verified: number;
  unverified: number;
  className?: string;
}

export function AttorneyReviewWarning({
  verified,
  unverified,
  className,
}: AttorneyReviewWarningProps) {
  if (unverified === 0 && verified > 0) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700",
        className
      )}
      role="alert"
    >
      <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="leading-relaxed">
        {unverified > 0 && (
          <p className="font-medium">
            {unverified} {unverified === 1 ? "Zitat" : "Zitate"} nicht im Corpus verifiziert —
            anwaltliche Prüfung zwingend erforderlich.
          </p>
        )}
        {unverified === 0 && verified === 0 && (
          <p className="font-medium">
            Keine Corpus-Prüfung durchgeführt — anwaltliche Prüfung erforderlich.
          </p>
        )}
        <p className="mt-0.5 text-amber-600/80">
          KI-generierte Antworten können halluzinieren, auch mit Quellenangaben. Misst Belegung,
          nicht inhaltliche Richtigkeit.
        </p>
      </div>
    </div>
  );
}
