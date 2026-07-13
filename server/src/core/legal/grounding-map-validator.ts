/**
 * Grounding Map Validator — Backend-authoritative verification of legal citations.
 *
 * The LLM (law-matcher) may only CLAIM which statute/paragraph applies.
 * This validator loads the actual corpus source, normalizes it, and sets
 * `verified` only after checking:
 *   - Jurisdiction
 *   - Statute code
 *   - Paragraph number
 *   - Absatz (if specified)
 *   - Satz (if specified)
 *   - Version (snapshot hash vs. loaded file hash)
 *   - Evidence span (contiguous substring of the source)
 *
 * All provenance fields are written by the backend, never trusted from the LLM.
 */

import type { CorpusLookupAdapter, ParagraphSpan } from "./corpus-lookup-adapter";

// ── Types ─────────────────────────────────────────────────────────────

export interface ClaimedMatchedParagraph {
  paragraph: string;
  statute: string;
  confidence: string;
  /** Optional: a claimed verbatim snippet. The backend verifies it, never trusts it. */
  source_text?: string;
}

export interface VerifiedMatchedParagraph extends ClaimedMatchedParagraph {
  source_slug: string;
  source_url: string;
  snapshot_hash: string;
  valid_from: string;
  valid_to: string | null;
  evidence_start: number;
  evidence_end: number;
  source_text: string;
  verified: true;
}

export interface UnverifiedMatchedParagraph extends ClaimedMatchedParagraph {
  verified: false;
  reason: string;
  source_slug?: string;
  source_url?: string;
  snapshot_hash?: string;
  valid_from?: string;
  valid_to?: string | null;
  evidence_start?: number;
  evidence_end?: number;
  source_text?: string;
}

export type MatchedParagraphResult = VerifiedMatchedParagraph | UnverifiedMatchedParagraph;

export interface ClaimedGroundingEntry {
  finding: string;
  finding_type: string;
  on_reference: string;
  quote: string;
  matched_paragraphs: ClaimedMatchedParagraph[];
}

export interface VerifiedGroundingEntry extends ClaimedGroundingEntry {
  matched_paragraphs: MatchedParagraphResult[];
}

// ── Validator ─────────────────────────────────────────────────────────

export class GroundingMapValidator {
  constructor(private adapter: CorpusLookupAdapter) {}

  async verify(opts: {
    jurisdiction: string;
    entries: ClaimedGroundingEntry[];
  }): Promise<VerifiedGroundingEntry[]> {
    return Promise.all(
      opts.entries.map(async (entry) => ({
        ...entry,
        matched_paragraphs: await Promise.all(
          entry.matched_paragraphs.map((mp) => this.verifyParagraph(opts.jurisdiction, mp))
        ),
      }))
    );
  }

  private async verifyParagraph(
    jurisdiction: string,
    mp: ClaimedMatchedParagraph
  ): Promise<MatchedParagraphResult> {
    const parsed = parseParagraphClaim(mp.paragraph);
    if (!parsed) {
      return { ...mp, verified: false, reason: "Ungültiger Paragraphen-Claim" };
    }

    const lookupResult = await this.adapter.lookup({
      jurisdiction: jurisdiction.toLowerCase(),
      statute: mp.statute,
      paragraph: parsed.paragraph,
      absatz: parsed.absatz,
      satz: parsed.satz,
    });

    if (!lookupResult) {
      return { ...mp, verified: false, reason: "Quelle nicht im Corpus gefunden" };
    }

    const baseProvenance = {
      source_slug: lookupResult.slug,
      source_url: lookupResult.source_url,
      snapshot_hash: lookupResult.snapshot_hash,
      valid_from: lookupResult.valid_from,
      valid_to: lookupResult.valid_to,
    };

    // 1. Jurisdiction check: the resolved slug must match the requested jurisdiction.
    const slugJurisdiction = lookupResult.slug.split("/")[1];
    if (slugJurisdiction !== jurisdiction.toLowerCase()) {
      return {
        ...mp,
        verified: false,
        reason: "Fremdnorm (Jurisdiktion mismatch)",
        ...baseProvenance,
      };
    }

    // 2. Version check: loaded file must match the current snapshot.
    if (lookupResult.snapshot_hash !== lookupResult.loaded_hash) {
      return {
        ...mp,
        verified: false,
        reason: "Falsche Fassung",
        ...baseProvenance,
      };
    }

    // 3. Evidence-span check: claimed source_text must be a contiguous substring
    //    of the normalized paragraph span. If no claim is provided, the whole span is used.
    const evidence = verifyEvidenceSpan(mp.source_text, lookupResult.paragraphSpan);
    if (!evidence.ok) {
      return {
        ...mp,
        verified: false,
        reason: "Nicht zusammenhängender Evidence-Span",
        ...baseProvenance,
      };
    }

    return {
      ...mp,
      verified: true,
      ...baseProvenance,
      evidence_start: evidence.start,
      evidence_end: evidence.end,
      source_text: evidence.sourceText,
    };
  }
}

// ── Claim parsing ─────────────────────────────────────────────────────

function parseParagraphClaim(raw: string): {
  paragraph: string;
  absatz?: string;
  satz?: string;
} | null {
  const normalized = raw
    .replace(/^§+\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    // Strip trailing statute-like token (e.g. "§ 433 BGB" -> "433")
    .replace(/\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9]{1,10}$/, "");

  const match = normalized.match(
    /^(\d+[a-z]?)(?:\s*(?:Abs\.?|Absatz)\s*(\d+))?(?:\s*(?:Satz\.?|S\.)\s*(\d+))?(?:\s*(?:Z\.?|Ziffer)\s*(\d+))?$/i
  );
  if (!match) return null;

  return {
    paragraph: match[1],
    absatz: match[2],
    satz: match[3],
  };
}

// ── Evidence span verification ────────────────────────────────────────

function verifyEvidenceSpan(
  claimedText: string | undefined,
  span: ParagraphSpan
): { ok: true; start: number; end: number; sourceText: string } | { ok: false } {
  const spanText = span.text;

  if (!claimedText || claimedText.trim().length < 10) {
    return { ok: true, start: span.start, end: span.end, sourceText: spanText };
  }

  const normalizedClaim = normalizeForEvidence(claimedText);
  const normalizedSpan = normalizeForEvidence(spanText);
  const idx = normalizedSpan.indexOf(normalizedClaim);
  if (idx === -1) {
    return { ok: false };
  }

  return {
    ok: true,
    start: span.start + idx,
    end: span.start + idx + normalizedClaim.length,
    sourceText: spanText.slice(idx, idx + normalizedClaim.length),
  };
}

function normalizeForEvidence(text: string): string {
  return text.normalize("NFC").replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}
