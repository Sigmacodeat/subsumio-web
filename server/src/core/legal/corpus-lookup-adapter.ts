/**
 * Corpus Lookup Adapter — Backend-authoritative source loading for legal grounding.
 *
 * The GroundingMapValidator uses this adapter to:
 *   1. Resolve a claimed statute to a corpus file
 *   2. Load and normalize the source text (NFC, whitespace)
 *   3. Extract the exact paragraph (and optional Absatz/Satz) span
 *   4. Provide provenance metadata: source slug, source URL, snapshot hash, validity
 *
 * This keeps the LLM honest: it may only "claim" a paragraph/statute; the backend
 * loads the actual text and computes the evidence span.
 */

import path from "node:path";
import { promises as fs, statSync } from "node:fs";
import { createHash } from "node:crypto";
// CORPUS_META is defined in the frontend src/lib/corpus-meta.ts and re-exported
// from src/lib/legal-grounding.ts. The engine Docker container does not include
// the frontend src/ directory, so we use a dynamic import with a fallback to an
// empty map. In production, metaMap is typically passed explicitly to the
// constructor.
let CORPUS_META: Record<string, { jurisdiction: string; label: string; file: string }> = {};
try {
  // @ts-ignore — optional dependency, may not exist in engine-only container
  CORPUS_META = (await import("@/lib/legal-grounding")).CORPUS_META;
} catch {
  // Engine-only container: CORPUS_META not available, use empty map
}

// ── Types ─────────────────────────────────────────────────────────────

export interface ParagraphSpan {
  text: string;
  start: number;
  end: number;
}

export interface CorpusLookupResult {
  /** Canonical slug, e.g. law/de/bgb */
  slug: string;
  /** Official source URL from corpus frontmatter or snapshot. */
  source_url: string;
  /** Expected content hash from the current snapshot (if any). */
  snapshot_hash: string;
  /** Actual hash of the corpus file that was loaded. */
  loaded_hash: string;
  /** ISO date when this version became valid. */
  valid_from: string;
  /** ISO date when this version was superseded (null = current). */
  valid_to: string | null;
  /** Normalized full text of the corpus file. */
  text: string;
  /** Span of the requested paragraph within normalized text. */
  paragraphSpan: ParagraphSpan;
}

export interface SnapshotLookup {
  getCurrentSnapshot(slug: string): Promise<{
    content_hash: string;
    source_url: string;
    valid_from: string;
    valid_to: string | null;
  } | null>;
}

export interface CorpusLookupAdapter {
  lookup(opts: {
    jurisdiction: string;
    statute: string;
    paragraph: string;
    absatz?: string;
    satz?: string;
  }): Promise<CorpusLookupResult | null>;
}

export interface FileSystemCorpusLookupAdapterOptions {
  corpusDir?: string;
  snapshotLookup?: SnapshotLookup;
  metaMap?: Record<string, { jurisdiction: string; label: string; file: string }>;
}

// ── Adapter ─────────────────────────────────────────────────────────────

export class FileSystemCorpusLookupAdapter implements CorpusLookupAdapter {
  private corpusDir: string;
  private snapshotLookup?: SnapshotLookup;
  private metaMap: Record<string, { jurisdiction: string; label: string; file: string }>;

  constructor(opts: FileSystemCorpusLookupAdapterOptions = {}) {
    this.corpusDir = opts.corpusDir ?? defaultCorpusDir();
    this.snapshotLookup = opts.snapshotLookup;
    this.metaMap = opts.metaMap ?? CORPUS_META;
  }

  async lookup(opts: {
    jurisdiction: string;
    statute: string;
    paragraph: string;
    absatz?: string;
    satz?: string;
  }): Promise<CorpusLookupResult | null> {
    const { jurisdiction, statute, paragraph, absatz, satz } = opts;

    const meta = resolveCorpusMeta(this.metaMap, statute, jurisdiction);
    if (!meta) return null;

    const slug = `law/${jurisdiction.toLowerCase()}/${meta.file
      .replace(/^[^/]+\//, "")
      .replace(/\.md$/, "")}`;

    const filePath = path.join(this.corpusDir, meta.file);
    let rawText: string;
    try {
      rawText = await fs.readFile(filePath, "utf8");
    } catch {
      return null;
    }

    const frontmatter = parseFrontmatter(rawText);
    const normalizedText = normalizeCorpusText(rawText);

    const paragraphSpan = extractParagraphSpan(normalizedText, paragraph, absatz, satz);
    if (!paragraphSpan) return null;

    const loadedHash = createHash("sha256").update(rawText).digest("hex");

    let sourceUrl = frontmatter.source_url ?? `https://corpus/${slug}`;
    let validFrom =
      frontmatter.version_date ?? frontmatter.retrieved_at ?? new Date().toISOString().slice(0, 10);
    let validTo: string | null = null;
    let snapshotHash = loadedHash;

    if (this.snapshotLookup) {
      const snapshot = await this.snapshotLookup.getCurrentSnapshot(slug);
      if (snapshot) {
        snapshotHash = snapshot.content_hash;
        sourceUrl = snapshot.source_url;
        validFrom = snapshot.valid_from;
        validTo = snapshot.valid_to;
      }
    }

    return {
      slug,
      source_url: sourceUrl,
      snapshot_hash: snapshotHash,
      loaded_hash: loadedHash,
      valid_from: validFrom,
      valid_to: validTo,
      text: normalizedText,
      paragraphSpan,
    };
  }
}

// ── Corpus resolution ─────────────────────────────────────────────────

function resolveCorpusMeta(
  metaMap: Record<string, { jurisdiction: string; label: string; file: string }>,
  statute: string,
  jurisdiction: string
): { jurisdiction: string; label: string; file: string } | null {
  const normalized = statute.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const jur = jurisdiction.toLowerCase();

  // Exact key match — only if the statute actually belongs to the requested jurisdiction.
  const exact = metaMap[normalized];
  if (exact && exact.jurisdiction.toLowerCase() === jur) return exact;

  // Label match (case-insensitive) within the same jurisdiction
  for (const [key, meta] of Object.entries(metaMap)) {
    if (meta.jurisdiction.toLowerCase() !== jur) continue;
    const labelLower = meta.label.toLowerCase();
    const statuteLower = statute.toLowerCase();
    if (labelLower === statuteLower || labelLower.startsWith(statuteLower + " ")) {
      return meta;
    }
    // Allow "BGB (DE)" style labels by stripping parentheses
    const labelBase = labelLower.replace(/\s*\([^)]*\)\s*$/, "");
    if (labelBase === statuteLower) return meta;
  }

  return null;
}

// ── Text normalization ────────────────────────────────────────────────

export function normalizeCorpusText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Frontmatter parser ────────────────────────────────────────────────

function parseFrontmatter(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text.startsWith("---")) return result;
  const end = text.indexOf("---", 3);
  if (end === -1) return result;
  const fm = text.slice(3, end).trim();
  for (const line of fm.split("\n")) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(?:"([^"]*)"|'([^']*)'|(.*))?\s*$/);
    if (match) {
      result[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
    }
  }
  return result;
}

// ── Paragraph span extraction ─────────────────────────────────────────

function extractParagraphSpan(
  text: string,
  paragraph: string,
  absatz?: string,
  satz?: string
): ParagraphSpan | null {
  const paraNum = paragraph.replace(/^§\s*/, "").trim();
  if (!paraNum) return null;
  const escaped = paraNum.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // DE format: ## § N ... \n(...)
  const deRegex = new RegExp(
    `(\\n## § ${escaped}[^\\n]*\\n)([\\s\\S]{0,3000}?)(?=\\n## § |\\n## Inhaltsübersicht|$)`
  );
  const deMatch = text.match(deRegex);
  if (deMatch) {
    const fullStart = deMatch.index ?? 0;
    const headerLen = deMatch[1].length;
    const bodyStart = fullStart + headerLen;
    const bodyEnd = fullStart + deMatch[0].length;
    let spanText = text.slice(bodyStart, bodyEnd).trim();
    if (spanText.length < paraNum.length + 3) return null;

    if (absatz) {
      const absatzSpan = extractAbsatzSpan(spanText, absatz, bodyStart);
      if (absatzSpan) {
        if (satz) {
          const satzSpan = extractSatzSpan(absatzSpan.text, absatzSpan.start);
          if (satzSpan) return satzSpan;
          return null;
        }
        return absatzSpan;
      }
      return null;
    }

    return { text: spanText, start: bodyStart, end: bodyStart + spanText.length };
  }

  // AT format: § N. ...\n(1) ...\n(2) ...
  // Cut off the table of contents by looking for the lone "Text" delimiter.
  const textDelim = text.search(/\nText\n/);
  const normText = textDelim !== -1 ? text.slice(textDelim + "\nText\n".length) : text;
  const baseOffset = textDelim !== -1 ? textDelim + "\nText\n".length : 0;

  const atIdx = normText.search(new RegExp(`§\\.?\\s*${escaped}\\.`));
  if (atIdx !== -1) {
    const absoluteStart = baseOffset + atIdx;
    const after = normText.slice(atIdx + 1);
    const nextRel = after.search(/\n§\.?\s*\d+[a-z]*\s*\./);
    const end = nextRel !== -1 ? absoluteStart + 1 + nextRel : absoluteStart + 2500;
    let spanText = text.slice(absoluteStart, Math.min(end, text.length)).trim();
    if (spanText.length < paraNum.length + 3) return null;

    if (absatz) {
      const absatzSpan = extractAbsatzSpan(spanText, absatz, absoluteStart);
      if (absatzSpan) {
        if (satz) {
          const satzSpan = extractSatzSpan(absatzSpan.text, absatzSpan.start);
          if (satzSpan) return satzSpan;
          return null;
        }
        return absatzSpan;
      }
      return null;
    }

    return { text: spanText, start: absoluteStart, end: absoluteStart + spanText.length };
  }

  return null;
}

function extractAbsatzSpan(
  paragraphText: string,
  absatz: string,
  paragraphOffset: number
): ParagraphSpan | null {
  const absatzNum = absatz.replace(/[^0-9]/g, "");
  if (!absatzNum) return null;

  const regex = new RegExp(`\\(\\s*${absatzNum}\\s*\\)\\s*([\\s\\S]*?)(?=\\(\\s*\\d+\\s*\\)|$)`);
  const match = paragraphText.match(regex);
  if (!match) return null;

  const markerIndex = match[0].indexOf(`(${absatzNum})`);
  const bodyStart = (match.index ?? 0) + markerIndex + `(${absatzNum})`.length;
  const bodyEnd = bodyStart + match[1].length;
  const spanText = paragraphText.slice(bodyStart, bodyEnd).trim();

  return {
    text: spanText,
    start: paragraphOffset + bodyStart,
    end: paragraphOffset + bodyStart + spanText.length,
  };
}

function extractSatzSpan(absatzText: string, absatzOffset: number): ParagraphSpan | null {
  // Generic sentence splitter: split on .!? followed by whitespace and uppercase.
  const sentences = absatzText.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/);
  const firstSentence = sentences[0]?.trim() ?? "";
  if (!firstSentence) return null;
  const idx = absatzText.indexOf(firstSentence);
  if (idx === -1) return null;
  return {
    text: firstSentence,
    start: absatzOffset + idx,
    end: absatzOffset + idx + firstSentence.length,
  };
}

// ── Default corpus directory resolution ─────────────────────────────────

function defaultCorpusDir(): string {
  const env = process.env.SUBSUMIO_LAW_CORPUS_DIR;
  if (env) return path.resolve(env);

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "law-corpus"),
    path.join(cwd, "..", "law-corpus"),
    path.join(cwd, "..", "..", "law-corpus"),
  ];

  for (const dir of candidates) {
    try {
      if (statSync(dir).isDirectory()) return dir;
    } catch {
      // ignore
    }
  }

  return candidates[0];
}
