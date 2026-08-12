/**
 * Legal Decision Chunker v2 — Structure-Aware Chunking for Court Decisions
 *
 * WHY: Court decisions (Urteile, Beschlüsse) have a distinct structure that
 * the generic recursive chunker ignores:
 *   - Rechtssatz / Leitsatz: the core legal proposition — the MOST important
 *     part for retrieval. Should be its own chunk.
 *   - Norm: the cited statutes — already used for citation graph edges.
 *   - Entscheidungstexte: multiple TE entries, each a separate decision with
 *     Beisatz annotations. These should be chunked individually so a query
 *     for a specific aspect of the ruling retrieves the right TE.
 *   - Metadata sections (Gericht, Geschäftszahl, ECLI, etc.): short, can be
 *     attached to the Leitsatz chunk or emitted as a small preamble chunk.
 *
 * This chunker parses the markdown `##` sections and creates structure-aware
 * chunks with metadata (court, case_number, decision_date, ecli, legal_area,
 * jurisdiction, chunk_role).
 *
 * BUMP: LEGAL_DECISION_CHUNKER_VERSION = 6 (same as statute chunker —
 * both are "legal chunker v2" and force re-chunk of existing legal pages).
 */

import { countCJKAwareWords } from "../cjk.ts";

export const LEGAL_DECISION_CHUNKER_VERSION = 6;

/** Target words per chunk for long sections. */
const DECISION_CHUNK_SIZE = 600;
/** Overlap words between chunks. */
const DECISION_CHUNK_OVERLAP = 60;
/** Hard cap on chunk character length. */
const DECISION_MAX_CHARS = 6000;

/** Section headings we recognize in court decision markdown.
 *  These match the heading TEXT (without the ## prefix). */
const SECTION_PATTERNS = {
  rechtssatz: /^(Rechtssatz|Leitsatz)$/i,
  norm: /^Norm$/i,
  entscheidungstexte: /^(Entscheidungstexte|Entscheidungstext)$/i,
  gericht: /^Gericht$/i,
  rechtssatznummer: /^Rechtssatznummer$/i,
  entscheidungsdatum: /^Entscheidungsdatum$/i,
  geschaeftszahl: /^(Geschäftszahl|Geschaeftszahl)$/i,
  ecli: /^(European Case Law Identifier|European Case Law Identifier \(ECLI\))$/i,
  sachverhalt: /^(Sachverhalt|Tatbestand|Feststellungen)$/i,
  entscheidungsgruende: /^(Entscheidungsgründe|Entscheidungsgruende|Begründung|Begruendung)$/i,
  tenor: /^(Tenor|Spruch|Ausspruch)$/i,
  // Generic content section used by lower courts (LVwG, GBK, DSK, PVAK, AsylGH, etc.)
  // "## Text" is the main body content when no structured sections are present.
  text: /^Text$/i,
  // VwGH uses "Stammrechtssatz" for root legal principles (same role as Rechtssatz)
  stammrechtssatz: /^Stammrechtssatz$/i,
  // Metadata-only sections (skipped from chunking, used for context)
  entscheidende_behoerde: /^Entscheidende Behörde$/i,
  disziplinarbehoerde: /^Disziplinarbehörde$/i,
  entscheidende_kommission: /^Entscheidende Kommission$/i,
  entscheidungsart: /^Entscheidungsart$/i,
  diskriminierungsgrund: /^Diskriminierungsgrund$/i,
  diskriminierungstatbestand: /^Diskriminierungstatbestand$/i,
  anfechtung: /^Anfechtung beim BVwG\/VwGH\/VfGH$/i,
  senat: /^Senat$/i,
  // VfGH/VwGH metadata sections
  sammlungsnummer: /^Sammlungsnummer$/i,
  hinweis_stammrechtssatz: /^Hinweis auf Stammrechtssatz$/i,
  dokumenttyp: /^Dokumenttyp$/i,
  index: /^Index$/i,
  schlagworte: /^Schlagworte$/i,
  kurzbezeichnung: /^Kurzbezeichnung$/i,
  // `norm` ist bereits oben definiert — die Dublette hier war ein TS1117-Fehler.
  // "## Beachte" contains cross-references (Miterledigung, Besprechung in Fachzeitschriften)
  // — metadata only, not relevant for semantic search
  beachte: /^Beachte$/i,
};

/** TE entry marker within Entscheidungstexte: "TE OGH 2025-04-08 12 Ds 6/24p" */
const TE_MARKER = /^TE\s+/;

export interface LegalDecisionChunkMetadata {
  /** Court name, e.g. "OGH", "VfGH", "VwGH", "BFH". */
  court: string;
  /** Case number / Aktenzeichen, e.g. "12Bkd5/91". */
  case_number: string;
  /** Decision date (ISO), e.g. "2025-04-08". */
  decision_date: string;
  /** ECLI identifier. */
  ecli: string;
  /** Legal area, e.g. "Zivilrecht", "Strafrecht". */
  legal_area: string;
  /** Jurisdiction: "at", "de", "ch", "eu". */
  jurisdiction: string;
  /** The role of this chunk within the decision. */
  chunk_role:
    | "leitsatz"
    | "entscheidungstext"
    | "sachverhalt"
    | "entscheidungsgruende"
    | "tenor"
    | "metadata"
    | "full";
  /** For entscheidungstext chunks: the TE marker line (e.g. "TE OGH 2025-04-08 12 Ds 6/24p"). */
  te_marker?: string;
}

export interface LegalDecisionChunk {
  text: string;
  index: number;
  metadata: LegalDecisionChunkMetadata;
}

/** Context used only for the embedding input; canonical chunk_text stays clean. */
export function formatLegalDecisionEmbeddingContext(metadata: LegalDecisionChunkMetadata): string {
  const identity = [metadata.court, metadata.case_number, metadata.decision_date]
    .filter(Boolean)
    .join(" | ");
  return `[Entscheidung: ${identity || "unbekannt"}; Jurisdiktion: ${metadata.jurisdiction || "unbekannt"}; Abschnitt: ${metadata.chunk_role}${metadata.ecli ? `; ECLI: ${metadata.ecli}` : ""}]`;
}

/**
 * Chunk a court decision markdown body into structure-aware chunks.
 * The body is the compiled_truth (markdown without frontmatter).
 *
 * Strategy:
 *   1. Parse `##` sections.
 *   2. Emit a "leitsatz" chunk for the Rechtssatz section (most important).
 *   3. Emit "entscheidungstext" chunks for each TE entry in Entscheidungstexte.
 *   4. Emit "sachverhalt", "entscheidungsgruende", "tenor" chunks if present.
 *   5. Emit a "metadata" chunk for Gericht, Geschäftszahl, ECLI, etc.
 *   6. If no recognizable sections, fall back to a single "full" chunk.
 */
export function chunkLegalDecision(
  body: string,
  metadata: {
    court: string;
    case_number: string;
    decision_date: string;
    ecli: string;
    legal_area: string;
    jurisdiction: string;
  }
): LegalDecisionChunk[] {
  // Strip RIS-OGD boilerplate footer that fetchers append to every document.
  // Pattern: "\n---\n*Quelle: [RIS-OGD](https://www.ris.bka.gv.at/...)*"
  // This URL noise pollutes embeddings and chunk text — remove before chunking.
  const stripped = body.replace(
    /\n---\n\*Quelle:\s*\[RIS-OGD\]\([^)]*\)\*\s*$/i,
    ""
  ).replace(
    /\n---\n\*Quelle:\s*\[[^\]]*\]\([^)]*\)\*\s*$/i,
    ""
  );
  const trimmed = stripped.trim();
  if (!trimmed) return [];

  const sections = parseDecisionSections(trimmed);

  // If we found no recognizable sections, emit a single "full" chunk.
  if (sections.length === 0) {
    return splitLongText(trimmed, DECISION_CHUNK_SIZE, DECISION_CHUNK_OVERLAP).map(
      (text, index) => ({
        text,
        index,
        metadata: { ...metadata, chunk_role: "full" as const },
      })
    );
  }

  const chunks: LegalDecisionChunk[] = [];
  let chunkIndex = 0;

  // 1. Emit metadata chunk (combine short metadata sections + Norm section).
  // EXPERT: Skip metadata that is only punctuation (RIS anonymization artifacts).
  const metaParts: string[] = [];
  for (const sec of sections) {
    if (
      (sec.role === "metadata" || sec.role === "norm") &&
      sec.text.trim() &&
      countCJKAwareWords(sec.text) < 80 &&
      !/^[,;\s.]+$/.test(sec.text.trim())
    ) {
      metaParts.push(sec.text.trim());
    }
  }
  if (metaParts.length > 0) {
    chunks.push({
      text: metaParts.join("\n\n"),
      index: chunkIndex++,
      metadata: {
        ...metadata,
        chunk_role: "metadata",
      },
    });
  }

  // 2. Emit Leitsatz chunk (Rechtssatz) — the core legal proposition.
  for (const sec of sections) {
    if (sec.role === "leitsatz" && sec.text.trim()) {
      const leitsatzText = sec.text.trim();
      if (leitsatzText.length <= DECISION_MAX_CHARS) {
        chunks.push({
          text: leitsatzText,
          index: chunkIndex++,
          metadata: {
            ...metadata,
            chunk_role: "leitsatz",
          },
        });
      } else {
        // Sub-split if the Rechtssatz is unusually long.
        for (const part of splitAtSentences(leitsatzText, DECISION_MAX_CHARS)) {
          chunks.push({
            text: part,
            index: chunkIndex++,
            metadata: {
              ...metadata,
              chunk_role: "leitsatz",
            },
          });
        }
      }
    }
  }

  // 3. Emit Sachverhalt, Entscheidungsgründe, Tenor, Text chunks.
  // "text" (## Text) is the generic body section used by lower courts (LVwG, GBK,
  // DSK, PVAK, AsylGH, etc.) when no structured sections are present.
  // We map it to "entscheidungsgruende" so it gets chunked properly instead of
  // falling through to the "full" fallback.
  // EXPERT: Skip sections that are only punctuation/whitespace (RIS anonymization
  // artifacts where case numbers are replaced with commas, e.g. "## Spruch\n, ,").
  for (const sec of sections) {
    if (
      (sec.role === "sachverhalt" || sec.role === "entscheidungsgruende" || sec.role === "tenor" || sec.role === "text") &&
      sec.text.trim()
    ) {
      // Skip sections that are only punctuation/commas/whitespace (RIS anonymization)
      if (/^[,;\s.]+$/.test(sec.text.trim())) continue;
      // Map "text" role to "entscheidungsgruende" for the chunk_role
      const role = (sec.role === "text" ? "entscheidungsgruende" : sec.role) as LegalDecisionChunkMetadata["chunk_role"];
      const text = sec.text.trim();
      if (text.length <= DECISION_MAX_CHARS && countCJKAwareWords(text) <= DECISION_CHUNK_SIZE) {
        chunks.push({
          text,
          index: chunkIndex++,
          metadata: { ...metadata, chunk_role: role },
        });
      } else {
        for (const part of splitLongText(text, DECISION_CHUNK_SIZE, DECISION_CHUNK_OVERLAP)) {
          chunks.push({
            text: part,
            index: chunkIndex++,
            metadata: { ...metadata, chunk_role: role },
          });
        }
      }
    }
  }

  // 4. Emit Entscheidungstext chunks — merge small TE entries up to DECISION_CHUNK_SIZE.
  // This prevents 35 tiny TE chunks when each entry is only 50-100 words.
  for (const sec of sections) {
    if (sec.role === "entscheidungstexte" && sec.subEntries) {
      let teBuf: string[] = [];
      let teBufWords = 0;
      let teBufMarker = "";
      let teBufCount = 0;

      const flushTE = () => {
        if (teBuf.length === 0) return;
        const mergedText = teBuf.join("\n\n").trim();
        const marker = teBufCount > 1 ? `${teBufMarker} (+${teBufCount - 1} weitere)` : teBufMarker;
        if (mergedText.length <= DECISION_MAX_CHARS) {
          chunks.push({
            text: mergedText,
            index: chunkIndex++,
            metadata: {
              ...metadata,
              chunk_role: "entscheidungstext",
              te_marker: marker,
            },
          });
        } else {
          for (const part of splitLongText(
            mergedText,
            DECISION_CHUNK_SIZE,
            DECISION_CHUNK_OVERLAP
          )) {
            chunks.push({
              text: part,
              index: chunkIndex++,
              metadata: {
                ...metadata,
                chunk_role: "entscheidungstext",
                te_marker: marker,
              },
            });
          }
        }
        teBuf = [];
        teBufWords = 0;
        teBufMarker = "";
        teBufCount = 0;
      };

      for (const te of sec.subEntries) {
        const teText = te.text.trim();
        if (!teText) continue;
        const teWords = countCJKAwareWords(teText);

        // If this TE entry alone exceeds chunk size, flush buffer first, then emit individually.
        if (teWords >= DECISION_CHUNK_SIZE) {
          flushTE();
          if (teText.length <= DECISION_MAX_CHARS) {
            chunks.push({
              text: teText,
              index: chunkIndex++,
              metadata: {
                ...metadata,
                chunk_role: "entscheidungstext",
                te_marker: te.marker,
              },
            });
          } else {
            for (const part of splitLongText(teText, DECISION_CHUNK_SIZE, DECISION_CHUNK_OVERLAP)) {
              chunks.push({
                text: part,
                index: chunkIndex++,
                metadata: {
                  ...metadata,
                  chunk_role: "entscheidungstext",
                  te_marker: te.marker,
                },
              });
            }
          }
          continue;
        }

        // Accumulate small TE entries into buffer.
        if (teBuf.length > 0 && teBufWords + teWords > DECISION_CHUNK_SIZE) {
          flushTE();
        }
        if (teBuf.length === 0) {
          teBufMarker = te.marker;
        }
        teBuf.push(teText);
        teBufWords += teWords;
        teBufCount++;
      }
      flushTE();
    }
  }

  // 5. Emit any remaining unrecognized sections — merge small ones up to DECISION_CHUNK_SIZE.
  {
    let otherBuf: string[] = [];
    let otherBufWords = 0;
    const flushOther = () => {
      if (otherBuf.length === 0) return;
      const mergedText = otherBuf.join("\n\n").trim();
      if (mergedText.length <= DECISION_MAX_CHARS) {
        chunks.push({
          text: mergedText,
          index: chunkIndex++,
          metadata: { ...metadata, chunk_role: "full" },
        });
      } else {
        for (const part of splitLongText(mergedText, DECISION_CHUNK_SIZE, DECISION_CHUNK_OVERLAP)) {
          chunks.push({
            text: part,
            index: chunkIndex++,
            metadata: { ...metadata, chunk_role: "full" },
          });
        }
      }
      otherBuf = [];
      otherBufWords = 0;
    };

    for (const sec of sections) {
      if (sec.role === "other" && sec.text.trim()) {
        const text = sec.text.trim();
        const words = countCJKAwareWords(text);
        if (otherBuf.length > 0 && otherBufWords + words > DECISION_CHUNK_SIZE) {
          flushOther();
        }
        otherBuf.push(text);
        otherBufWords += words;
      }
    }
    flushOther();
  }

  // If we only produced a metadata chunk + nothing else, or no chunks at all,
  // fall back to emitting the full text.
  if (
    chunks.length === 0 ||
    (chunks.length === 1 && chunks[0].metadata.chunk_role === "metadata")
  ) {
    return [
      {
        text: trimmed,
        index: 0,
        metadata: {
          ...metadata,
          chunk_role: "full",
        },
      },
    ];
  }

  return chunks;
}

interface ParsedSection {
  role:
    | "leitsatz"
    | "norm"
    | "entscheidungstexte"
    | "metadata"
    | "sachverhalt"
    | "entscheidungsgruende"
    | "tenor"
    | "text"
    | "other";
  heading: string;
  text: string;
  subEntries?: Array<{ marker: string; text: string }>;
}

/**
 * Parse the decision markdown body into sections by `##` headings.
 * Returns sections in document order.
 */
function parseDecisionSections(body: string): ParsedSection[] {
  const lines = body.split("\n");
  const sections: ParsedSection[] = [];
  let currentHeading = "";
  let currentRole: ParsedSection["role"] = "other";
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (!text && currentRole === "other") return;

    const section: ParsedSection = {
      role: currentRole,
      heading: currentHeading,
      text,
    };

    // For Entscheidungstexte, parse sub-entries (TE markers).
    if (currentRole === "entscheidungstexte") {
      section.subEntries = parseTEEntries(text);
    }

    sections.push(section);
    currentLines = [];
  };

  for (const line of lines) {
    // Check if this line is a `##` heading.
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1];
      currentRole = classifyHeading(currentHeading);
      continue;
    }

    // Skip the top-level `#` title heading.
    if (line.match(/^#\s+/) && currentLines.length === 0 && currentRole === "other") {
      continue;
    }

    currentLines.push(line);
  }

  flush();

  return sections;
}

/**
 * Classify a `##` heading into a section role.
 */
function classifyHeading(heading: string): ParsedSection["role"] {
  if (SECTION_PATTERNS.rechtssatz.test(heading)) return "leitsatz";
  if (SECTION_PATTERNS.stammrechtssatz?.test(heading)) return "leitsatz";
  if (SECTION_PATTERNS.norm.test(heading)) return "norm";
  if (SECTION_PATTERNS.entscheidungstexte.test(heading)) return "entscheidungstexte";
  if (SECTION_PATTERNS.sachverhalt.test(heading)) return "sachverhalt";
  if (SECTION_PATTERNS.entscheidungsgruende.test(heading)) return "entscheidungsgruende";
  if (SECTION_PATTERNS.tenor.test(heading)) return "tenor";
  if (SECTION_PATTERNS.text.test(heading)) return "text";
  if (
    SECTION_PATTERNS.gericht.test(heading) ||
    SECTION_PATTERNS.rechtssatznummer.test(heading) ||
    SECTION_PATTERNS.entscheidungsdatum.test(heading) ||
    SECTION_PATTERNS.geschaeftszahl.test(heading) ||
    SECTION_PATTERNS.ecli.test(heading) ||
    SECTION_PATTERNS.entscheidende_behoerde?.test(heading) ||
    SECTION_PATTERNS.disziplinarbehoerde?.test(heading) ||
    SECTION_PATTERNS.entscheidende_kommission?.test(heading) ||
    SECTION_PATTERNS.entscheidungsart?.test(heading) ||
    SECTION_PATTERNS.diskriminierungsgrund?.test(heading) ||
    SECTION_PATTERNS.diskriminierungstatbestand?.test(heading) ||
    SECTION_PATTERNS.anfechtung?.test(heading) ||
    SECTION_PATTERNS.senat?.test(heading) ||
    SECTION_PATTERNS.beachte?.test(heading) ||
    SECTION_PATTERNS.sammlungsnummer?.test(heading) ||
    SECTION_PATTERNS.hinweis_stammrechtssatz?.test(heading) ||
    SECTION_PATTERNS.dokumenttyp?.test(heading) ||
    SECTION_PATTERNS.index?.test(heading) ||
    SECTION_PATTERNS.schlagworte?.test(heading) ||
    SECTION_PATTERNS.kurzbezeichnung?.test(heading)
  ) {
    return "metadata";
  }
  return "other";
}

/**
 * Parse the Entscheidungstexte section body into individual TE entries.
 * Each entry starts with a "TE " line and continues until the next "TE " line.
 */
function parseTEEntries(text: string): Array<{ marker: string; text: string }> {
  const lines = text.split("\n");
  const entries: Array<{ marker: string; text: string }> = [];
  let currentMarker = "";
  let currentLines: string[] = [];

  const flush = () => {
    const entryText = currentLines.join("\n").trim();
    if (entryText) {
      entries.push({ marker: currentMarker, text: entryText });
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (TE_MARKER.test(line.trim())) {
      flush();
      currentMarker = line.trim();
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  flush();

  return entries;
}

/**
 * Split a long text into overlapping chunks at sentence boundaries.
 */
function splitLongText(text: string, targetWords: number, overlapWords: number): string[] {
  if (text.length <= DECISION_MAX_CHARS && countCJKAwareWords(text) <= targetWords) {
    return [text];
  }

  // A single reasoning paragraph can be tens of thousands of characters.
  // Split those first; otherwise the old paragraph loop emitted an oversized
  // chunk and only noticed the cap after it had already crossed it.
  const paragraphs = text
    .split(/\n\s*\n/)
    .flatMap((paragraph) => splitAtSentences(paragraph.trim(), DECISION_MAX_CHARS))
    .filter(Boolean);
  const chunks: string[] = [];
  let currentBuf: string[] = [];
  let currentWords = 0;

  const seedOverlap = () => {
    if (overlapWords <= 0 || chunks.length === 0) return;
    const words = chunks[chunks.length - 1].split(/\s+/);
    if (words.length <= overlapWords) return;
    const overlap = words.slice(-overlapWords).join(" ");
    currentBuf = [overlap];
    currentWords = countCJKAwareWords(overlap);
  };

  const flush = () => {
    const value = currentBuf.join("\n\n").trim();
    if (value) chunks.push(value);
    currentBuf = [];
    currentWords = 0;
    seedOverlap();
  };

  for (const para of paragraphs) {
    const paraWords = countCJKAwareWords(para);

    const nextChars =
      currentBuf.length > 0 ? currentBuf.join("\n\n").length + 2 + para.length : para.length;
    if (
      currentBuf.length > 0 &&
      (currentWords + paraWords > targetWords || nextChars > DECISION_MAX_CHARS)
    ) {
      flush();
      // Never let the overlap itself force the following legal unit over the
      // hard provider limit. Precision overlap is optional; valid input is not.
      const overlapPlusPara =
        currentBuf.length > 0 ? currentBuf.join("\n\n").length + 2 + para.length : para.length;
      if (overlapPlusPara > DECISION_MAX_CHARS) {
        currentBuf = [];
        currentWords = 0;
      }
    }

    currentBuf.push(para);
    currentWords += paraWords;
  }

  if (currentBuf.length > 0) {
    const value = currentBuf.join("\n\n").trim();
    if (value) chunks.push(value);
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Sub-split a too-long text at sentence boundaries. Falls back to hard char cuts.
 */
function splitAtSentences(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
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
      cut += 1;
    }
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut);
  }
  if (remaining.trim()) {
    parts.push(remaining.trim());
  }
  return parts;
}
