"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface CitationLinkProps {
  citation: string; // e.g. "§ 823 BGB" or "ECLI:AT:OGH:2024:00123"
  className?: string;
}

/**
 * Detects legal citations in text and renders them as clickable links.
 * Supports:
 *   - German/Austrian/Swiss statutes: § 123 BGB, § 43 Abs. 1 BRAO, Art. 5 GG
 *   - ECLI: ECLI:AT:OGH:2024:00123
 *   - Case references: BGHZ 120, 274
 */
export function CitationLink({ citation, className }: CitationLinkProps) {
  const normalized = normalizeCitation(citation);

  return (
    <Link
      href={`/dashboard/norms?citation=${encodeURIComponent(normalized)}`}
      className={cn(
        "inline-flex items-center gap-1 brand-text hover:brand-text underline underline-offset-2 decoration-[color:var(--brand-primary)]/30 hover:decoration-[color:var(--brand-primary)] transition-all cursor-pointer",
        className
      )}
    >
      <BookOpen size={10} />
      {citation}
    </Link>
  );
}

function normalizeCitation(citation: string): string {
  // § 823 BGB → legal/norms/de/bgb/823
  // ECLI:AT:OGH:2024:00123 → legal/judgements/ecli-at-ogh-2024-00123
  const trimmed = citation.trim();

  // ECLI
  if (trimmed.toLowerCase().startsWith('ecli')) {
    return trimmed.replace(/:/g, '-').toLowerCase();
  }

  // German/Austrian statute pattern: § 123 BGB or § 43 Abs. 1 BRAO
  const statuteMatch = trimmed.match(/[§§]\s*(\d+(?:\s*[a-z])?)\s*(?:Abs\.?\s*(\d+)\s*)?(?:S\.?\s*(\d+)\s*)?(?:[A-Z]{2,})/);
  if (statuteMatch) {
    const code = statuteMatch[0].match(/[A-Z]{2,}/)?.[0]?.toLowerCase() || '';
    const section = statuteMatch[1];
    return `legal/norms/${code}/${section}`;
  }

  // Article pattern: Art. 5 GG
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

  // Combined regex for all citation patterns
  const citationRegex = /(\bECLI:[A-Z]{2}:[A-Z]+:\d{4}:[^\s]+)|(\b[§§]\s*\d+(?:\s*[a-z])?(?:\s*Abs\.?\s*\d+)?(?:\s*S\.?\s*\d+)?\s*[A-Z]{2,}\b)|(\bArt\.?\s*\d+(?:\s*[a-z])?\s*[A-Z]{2,}\b)|(\bBGHZ?\s*\d+[,\s]+\d+)|(\bBVerwG\s+\d+[,\s]+\d+)/gi;

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
