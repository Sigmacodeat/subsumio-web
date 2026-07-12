/**
 * Provenance Chain — Click-Through from Claim to Source Passage
 *
 * For each claim in an AI-generated answer, builds a provenance link
 * to the exact source passage that supports it. This enables:
 *   - UI: click on a claim → see the source passage highlighted
 *   - Audit: full provenance chain stored in certification record
 *   - Compliance: EU AI Act Art. 13 transparency requirement
 *
 * Architecture:
 *   1. Parse the context (pages block) into individual chunks with slug + text
 *   2. For each claim, find which chunk(s) contain the cited §-passage
 *   3. Extract the exact passage (sentence(s) containing the §) from the chunk
 *   4. Build a provenance map: claim → source_slug + passage + offsets
 *
 * Pure + deterministic: no I/O, no LLM calls.
 */

import { decomposeClaims } from "./confidence-scoring.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface SourceChunk {
  slug: string;
  text: string;
  rank: number;
  /** Gap 2: character offset of chunk start in full page content (from gather.ts) */
  chunk_start?: number;
  /** Gap 2: character offset of chunk end in full page content (from gather.ts) */
  chunk_end?: number;
}

export interface ProvenanceLink {
  /** Index of the claim in the answer */
  claim_index: number;
  /** The claim text */
  claim_text: string;
  /** Slug of the source page */
  source_slug: string;
  /** The exact passage from the source that supports this claim */
  source_passage: string;
  /** Character offset of passage start in source chunk */
  passage_start: number;
  /** Character offset of passage end in source chunk */
  passage_end: number;
  /** How directly the passage supports the claim */
  relevance: "direct" | "paraphrase" | "background";
}

export interface ProvenanceResult {
  /** All provenance links for the answer */
  links: ProvenanceLink[];
  /** Claims that have no provenance (unsupported) */
  unsupported_claims: string[];
  /** Chunks parsed from context */
  source_chunks: SourceChunk[];
}

// ── Context Parsing ───────────────────────────────────────────────────

/**
 * Parse the pages block (XML-tagged chunks) into SourceChunk objects.
 * Expected format: `<page slug="..." rank="...">text</page>`
 */
export function parseContextChunks(pagesBlock: string): SourceChunk[] {
  const chunks: SourceChunk[] = [];
  const pageRegex = /<page\s+slug="([^"]+)"\s+rank="(\d+)"(?:\s+passage_start="(\d+)")?(?:\s+passage_end="(\d+)")?>([\s\S]*?)<\/page>/g;
  let match: RegExpExecArray | null;
  while ((match = pageRegex.exec(pagesBlock)) !== null) {
    const slug = match[1];
    const rank = parseInt(match[2], 10);
    const passageStart = match[3] ? parseInt(match[3], 10) : undefined;
    const passageEnd = match[4] ? parseInt(match[4], 10) : undefined;
    const text = match[5].trim();
    chunks.push({ slug, text, rank, chunk_start: passageStart, chunk_end: passageEnd });
  }
  return chunks;
}

// ── Passage Extraction ────────────────────────────────────────────────

/**
 * Extract the relevant passage from a source chunk for a given citation.
 *
 * Strategy:
 * 1. Find the §-number in the chunk text
 * 2. Extract the sentence(s) containing that §-number
 * 3. If no sentence boundary, extract a window around the match
 */
function extractPassageForCitation(
  chunkText: string,
  citation: string
): { passage: string; start: number; end: number } | null {
  // Parse the citation to get the § number
  const citeMatch = citation.match(/§\s*(\d+[a-z]?)/);
  if (!citeMatch) return null;
  const paraNum = citeMatch[1];

  // Find the § number in the chunk text
  const paraRegex = new RegExp(`§§?\\s*${paraNum}\\b`, "i");
  const match = paraRegex.exec(chunkText);
  if (!match) return null;

  const matchStart = match.index;
  // Find sentence boundaries around the match
  // Look backwards for sentence start
  let sentenceStart = matchStart;
  for (let i = matchStart - 1; i >= 0; i--) {
    if (chunkText[i] === "." || chunkText[i] === "!" || chunkText[i] === "?") {
      sentenceStart = i + 1;
      break;
    }
    if (i === 0) sentenceStart = 0;
  }

  // Look forwards for sentence end
  let sentenceEnd = chunkText.length;
  for (let i = matchStart + match[0].length; i < chunkText.length; i++) {
    if (chunkText[i] === "." || chunkText[i] === "!" || chunkText[i] === "?") {
      sentenceEnd = i + 1;
      break;
    }
  }

  // If the sentence is too long (> 500 chars), use a window around the match
  if (sentenceEnd - sentenceStart > 500) {
    sentenceStart = Math.max(0, matchStart - 100);
    sentenceEnd = Math.min(chunkText.length, matchStart + 400);
  }

  // If the sentence is too short (< 20 chars), expand
  if (sentenceEnd - sentenceStart < 20) {
    sentenceStart = Math.max(0, matchStart - 50);
    sentenceEnd = Math.min(chunkText.length, matchStart + 200);
  }

  const passage = chunkText.slice(sentenceStart, sentenceEnd).trim();
  return {
    passage,
    start: sentenceStart,
    end: sentenceEnd,
  };
}

/**
 * Extract §-citations from a claim sentence.
 */
function extractClaimCitations(claim: string): string[] {
  const pattern = /§§?\s*(\d+[a-z]?)\s*(?:Abs\.\s*(\d+))?\s*(?:Satz\s*(\d+))?\s*([A-Z][A-Za-z]{1,10})?/g;
  const citations: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(claim)) !== null) {
    const [, num, abs, satz, law] = match;
    let cite = `§ ${num}`;
    if (abs) cite += ` Abs. ${abs}`;
    if (satz) cite += ` Satz ${satz}`;
    if (law) cite += ` ${law}`;
    citations.push(cite);
  }
  return [...new Set(citations)];
}

// ── Provenance Builder ────────────────────────────────────────────────

/**
 * Determine the relevance of a passage to a claim.
 * - "direct": The claim cites a § and the passage contains that exact §
 * - "paraphrase": The claim references content that appears (paraphrased) in the passage
 * - "background": The passage is from the same law but doesn't directly contain the cited §
 */
function assessRelevance(
  claim: string,
  passage: string,
  citation: string
): "direct" | "paraphrase" | "background" {
  const citeMatch = citation.match(/§\s*(\d+[a-z]?)/);
  if (!citeMatch) return "background";
  const paraNum = citeMatch[1];

  // Check if the passage contains the exact § number
  const paraRegex = new RegExp(`§§?\\s*${paraNum}\\b`, "i");
  if (paraRegex.test(passage)) return "direct";

  // Check if key words from the claim appear in the passage (paraphrase)
  const claimWords = claim
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4 && !["muss", "ist", "gilt", "kann", "hat", "sind", "wird", "darf", "soll"].includes(w));
  const passageLower = passage.toLowerCase();
  const overlap = claimWords.filter((w) => passageLower.includes(w));
  if (overlap.length >= 3) return "paraphrase";

  return "background";
}

/**
 * Build a provenance chain for an AI-generated answer.
 *
 * For each claim in the answer, finds the source passage(s) that support it
 * by matching §-citations to chunks in the context.
 *
 * @param answer - The AI-generated answer text
 * @param pagesBlock - The context block (XML-tagged pages)
 * @returns ProvenanceResult with links and unsupported claims
 */
export function buildProvenance(
  answer: string,
  pagesBlock: string
): ProvenanceResult {
  const chunks = parseContextChunks(pagesBlock);
  const claims = decomposeClaims(answer);
  const links: ProvenanceLink[] = [];
  const unsupported: string[] = [];

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];
    const citations = extractClaimCitations(claim);

    if (citations.length === 0) {
      // No citation → no provenance link (but not necessarily unsupported)
      continue;
    }

    let foundLink = false;
    for (const citation of citations) {
      // Find the chunk that contains this citation
      for (const chunk of chunks) {
        const passageResult = extractPassageForCitation(chunk.text, citation);
        if (passageResult) {
          const relevance = assessRelevance(claim, passageResult.passage, citation);
          links.push({
            claim_index: i,
            claim_text: claim,
            source_slug: chunk.slug,
            source_passage: passageResult.passage,
            passage_start: passageResult.start,
            passage_end: passageResult.end,
            relevance,
          });
          foundLink = true;
          break; // Take the first matching chunk for this citation
        }
      }
    }

    if (!foundLink) {
      unsupported.push(claim);
    }
  }

  return {
    links,
    unsupported_claims: unsupported,
    source_chunks: chunks,
  };
}

// ── Provenance Summary ────────────────────────────────────────────────

/**
 * Generate a human-readable provenance summary for audit/export.
 */
export function provenanceSummary(result: ProvenanceResult): string {
  const lines: string[] = [];
  lines.push(`Provenance Chain — ${result.links.length} links, ${result.unsupported_claims.length} unsupported claims`);
  lines.push("");

  for (const link of result.links) {
    lines.push(`Claim ${link.claim_index}: "${link.claim_text.slice(0, 80)}..."`);
    lines.push(`  → Source: ${link.source_slug} [${link.relevance}]`);
    lines.push(`  → Passage: "${link.source_passage.slice(0, 120)}..."`);
    lines.push("");
  }

  if (result.unsupported_claims.length > 0) {
    lines.push("Unsupported claims:");
    for (const c of result.unsupported_claims) {
      lines.push(`  ⚠ "${c.slice(0, 80)}..."`);
    }
  }

  return lines.join("\n");
}

/**
 * Convert ProvenanceResult to a compact JSON for storage in certification.
 */
export function provenanceToJSON(result: ProvenanceResult): Array<{
  claim_index: number;
  claim_text: string;
  source_slug: string;
  source_passage: string;
  relevance: string;
}> {
  return result.links.map((l) => ({
    claim_index: l.claim_index,
    claim_text: l.claim_text,
    source_slug: l.source_slug,
    source_passage: l.source_passage,
    relevance: l.relevance,
  }));
}
