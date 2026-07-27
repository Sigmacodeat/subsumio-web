/**
 * Legal Statute Chunker v2 — §-Aware Metadata-Preserving Chunking
 *
 * WHY: The generic recursive chunker (300 words, 50 overlap) splits long §§
 * mid-sentence, losing the § context that makes legal retrieval precise. A
 * query for "§ 933 ABGB Gewährleistung" should retrieve the exact paragraph,
 * not a fragment of it that happens to contain the keyword.
 *
 * This chunker is §-aware: it preserves the paragraph number, statute
 * abbreviation, and jurisdiction as chunk-level metadata, and it splits
 * at legal structural boundaries (Absatz, Ziffer, lit) instead of arbitrary
 * word counts.
 *
 * STRUCTURE:
 *   1. If the § body is short enough (≤ ~300 words / 2000 chars), emit ONE chunk.
 *   2. If the § body is long, split at legal structural boundaries:
 *      a. Absatz markers: (1), (2), (3) — most common in DE/AT law
 *      b. Ziffer markers: 1., 2., 3. — sub-paragraph lists
 *      c. Literal markers: a), b), c) — sub-sub-paragraph lists
 *      d. Sentence boundaries (fallback)
 *   3. Each chunk carries metadata: paragraph ref, statute abbr, jurisdiction,
 *      absatz number, chunk_role (full | absatz | remainder).
 *
 * BUMP: LEGAL_CHUNKER_VERSION = 4 — forces re-chunk of existing legal pages.
 */

import { countCJKAwareWords } from "../cjk.ts";

export const LEGAL_CHUNKER_VERSION = 4;

/** Target words per chunk for long §§ (lower than generic: legal text is
 *  dense, precision > coverage). */
const LEGAL_CHUNK_SIZE = 250;
/** Overlap words between chunks of the same §. */
const LEGAL_CHUNK_OVERLAP = 30;
/** Hard cap on chunk character length (embed limit safety). */
const LEGAL_MAX_CHARS = 6000;
/** A § body under this many words is emitted as a single chunk. */
const SINGLE_CHUNK_WORD_THRESHOLD = 300;
/** A § body under this many chars is emitted as a single chunk. */
const SINGLE_CHUNK_CHAR_THRESHOLD = 2000;

/** Legal structural markers for splitting. */
const ABSATZ_MARKER = /^\((\d+[a-z]?)\)\s*/;
const ZIFFER_MARKER = /^(\d+[a-z]?)\.\s+/;
const LITERAL_MARKER = /^([a-z])\)\s+/;

export interface LegalChunkMetadata {
  /** The § or Art. reference, e.g. "933", "1a", "29 und 30". */
  paragraph_ref: string;
  /** The statute abbreviation, e.g. "ABGB", "BGB", "StGB". */
  statute_abbr: string;
  /** Jurisdiction: "at", "de", "ch", "eu". */
  jurisdiction: string;
  /** The Absatz (paragraph) number if this chunk is from a specific Absatz,
   *  e.g. "1", "2a". Null for the full § or unstructured parts. */
  absatz?: string | null;
  /** The role of this chunk within the §. */
  chunk_role: "full" | "absatz" | "remainder" | "preamble";
}

export interface LegalChunk {
  text: string;
  index: number;
  metadata: LegalChunkMetadata;
}

/** Context used only for the embedding input; canonical chunk_text stays clean. */
export function formatLegalSectionEmbeddingContext(metadata: LegalChunkMetadata): string {
  const reference = metadata.paragraph_ref
    ? `${metadata.jurisdiction === "ch" || metadata.jurisdiction === "eu" ? "Art." : "§"} ${metadata.paragraph_ref}`
    : "Norm";
  const absatz = metadata.absatz ? `, Abs. ${metadata.absatz}` : "";
  return `[Rechtsquelle: ${metadata.statute_abbr || "unbekannt"} ${reference}${absatz}; Jurisdiktion: ${metadata.jurisdiction || "unbekannt"}; Abschnitt: ${metadata.chunk_role}]`;
}

/**
 * Chunk a § body into §-aware chunks. The body is the raw text of the
 * section (without the heading line). The metadata (paragraph_ref,
 * statute_abbr, jurisdiction) is threaded from the page frontmatter.
 *
 * Returns one or more LegalChunk objects. Each chunk's text is
 * self-contained (the Absatz marker is included in the chunk text so
 * keyword search finds it).
 */
export function chunkLegalSection(
  body: string,
  metadata: {
    paragraph_ref: string;
    statute_abbr: string;
    jurisdiction: string;
  }
): LegalChunk[] {
  const trimmed = body.trim();
  if (!trimmed) return [];

  const wordCount = countCJKAwareWords(trimmed);
  const charCount = trimmed.length;

  // Short § → single chunk, no splitting needed.
  if (wordCount <= SINGLE_CHUNK_WORD_THRESHOLD && charCount <= SINGLE_CHUNK_CHAR_THRESHOLD) {
    return [
      {
        text: trimmed,
        index: 0,
        metadata: {
          ...metadata,
          absatz: null,
          chunk_role: "full",
        },
      },
    ];
  }

  // Long § → split at legal structural boundaries.
  const segments = splitAtLegalBoundaries(trimmed);
  const chunks: LegalChunk[] = [];
  let currentBuf: string[] = [];
  let currentWords = 0;
  let currentAbsatz: string | null = null;
  let chunkIndex = 0;

  const flush = (absatz: string | null, role: LegalChunkMetadata["chunk_role"]) => {
    const text = currentBuf.join("\n").trim();
    if (!text) return;
    chunks.push({
      text,
      index: chunkIndex++,
      metadata: {
        ...metadata,
        absatz,
        chunk_role: role,
      },
    });
    currentBuf = [];
    currentWords = 0;
  };

  for (const seg of segments) {
    const segWords = countCJKAwareWords(seg.text);
    const segChars = seg.text.length;

    // If a single segment exceeds the char cap, sub-split it at sentence
    // boundaries before adding to the buffer.
    if (segChars > LEGAL_MAX_CHARS) {
      if (currentBuf.length > 0) {
        flush(currentAbsatz, currentAbsatz ? "absatz" : "remainder");
      }
      const subParts = splitAtSentences(seg.text, LEGAL_MAX_CHARS);
      for (const part of subParts) {
        if (currentBuf.join("\n").length + part.length > LEGAL_MAX_CHARS && currentBuf.length > 0) {
          flush(currentAbsatz, currentAbsatz ? "absatz" : "remainder");
        }
        currentBuf.push(part);
      }
      if (currentBuf.join("\n").length > LEGAL_MAX_CHARS) {
        flush(currentAbsatz, currentAbsatz ? "absatz" : "remainder");
      }
      continue;
    }

    // If adding this segment would overflow, flush first.
    if (currentWords + segWords > LEGAL_CHUNK_SIZE && currentBuf.length > 0) {
      flush(currentAbsatz, currentAbsatz ? "absatz" : "remainder");
      // Overlap: keep the last few words of the previous chunk.
      if (LEGAL_CHUNK_OVERLAP > 0 && chunks.length > 0) {
        const prevText = chunks[chunks.length - 1].text;
        const overlapText = takeTrailingWords(prevText, LEGAL_CHUNK_OVERLAP);
        if (overlapText) {
          currentBuf.push(overlapText);
          currentWords = countCJKAwareWords(overlapText);
        }
      }
    }

    // Update absatz tracking when we enter a new Absatz segment.
    if (seg.absatz) {
      currentAbsatz = seg.absatz;
    }

    currentBuf.push(seg.text);
    currentWords += segWords;

    // Hard char cap: flush immediately if we've exceeded it.
    if (currentBuf.join("\n").length > LEGAL_MAX_CHARS) {
      flush(currentAbsatz, currentAbsatz ? "absatz" : "remainder");
    }
  }

  // Flush remaining buffer.
  if (currentBuf.length > 0) {
    flush(currentAbsatz, currentAbsatz ? "absatz" : "remainder");
  }

  // If we only produced one chunk from a long §, that's fine — it means
  // the structural boundaries didn't produce enough segments to split.
  if (chunks.length === 0) {
    return [
      {
        text: trimmed,
        index: 0,
        metadata: {
          ...metadata,
          absatz: null,
          chunk_role: "full",
        },
      },
    ];
  }

  return chunks;
}

interface LegalSegment {
  text: string;
  absatz: string | null;
}

/**
 * Split a § body at legal structural boundaries: Absatz markers (1), (2),
 * then Ziffer markers 1., 2., then literal markers a), b). Falls back to
 * paragraph breaks and sentence boundaries.
 */
function splitAtLegalBoundaries(body: string): LegalSegment[] {
  const lines = body.split("\n");
  const segments: LegalSegment[] = [];
  let currentLines: string[] = [];
  let currentAbsatz: string | null = null;

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (text) {
      segments.push({ text, absatz: currentAbsatz });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for Absatz marker: (1), (2a), etc.
    const absatzMatch = trimmedLine.match(ABSATZ_MARKER);
    if (absatzMatch) {
      flush();
      currentAbsatz = absatzMatch[1];
      currentLines.push(line);
      continue;
    }

    // Check for Ziffer marker at start of line: 1., 2., 3a.
    // Only treat as boundary if we're already inside an Absatz or the
    // line starts at column 0 (top-level numbering).
    const zifferMatch = trimmedLine.match(ZIFFER_MARKER);
    if (zifferMatch && currentAbsatz) {
      // Ziffer within Absatz — don't split, just continue the Absatz.
      currentLines.push(line);
      continue;
    }

    // Check for literal marker: a), b), c)
    const literalMatch = trimmedLine.match(LITERAL_MARKER);
    if (literalMatch && currentAbsatz) {
      currentLines.push(line);
      continue;
    }

    // Paragraph break (empty line) — potential boundary.
    if (trimmedLine === "" && currentLines.length > 0) {
      // Only flush at paragraph breaks if we have an Absatz context.
      // Otherwise, keep accumulating to avoid over-fragmenting.
      if (currentAbsatz) {
        flush();
      } else {
        currentLines.push(line);
      }
      continue;
    }

    currentLines.push(line);
  }

  flush();

  // If we got no segments (no Absatz markers), fall back to paragraph splitting.
  if (segments.length <= 1) {
    return splitAtParagraphs(body);
  }

  return segments;
}

/**
 * Fallback: split at paragraph boundaries (double newlines). Used when no
 * Absatz markers are found. Each segment has absatz=null.
 */
function splitAtParagraphs(body: string): LegalSegment[] {
  const paragraphs = body.split(/\n\s*\n/);
  const segments: LegalSegment[] = [];
  for (const para of paragraphs) {
    const text = para.trim();
    if (text) {
      segments.push({ text, absatz: null });
    }
  }
  return segments;
}

/**
 * Take the trailing N words from a text for overlap purposes.
 */
function takeTrailingWords(text: string, n: number): string {
  const words = text.split(/\s+/);
  if (words.length <= n) return text;
  return words.slice(-n).join(" ");
}

/**
 * Sub-split a too-long segment at sentence boundaries. Falls back to
 * hard char cuts when no sentence boundary is found within the window.
 */
function splitAtSentences(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    // Prefer sentence end, then comma, then space.
    let cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf(".\n"));
    if (cut < maxChars * 0.5) {
      cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf(",\n"));
    }
    if (cut < maxChars * 0.5) {
      cut = window.lastIndexOf(" ");
    }
    if (cut < maxChars * 0.5) {
      cut = maxChars;
    } else {
      cut += 1; // include the delimiter
    }
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut);
  }
  if (remaining.trim()) {
    parts.push(remaining.trim());
  }
  return parts;
}
