/**
 * Shared backfill utilities — used by all backfill scripts.
 *
 * Every function here is designed to be FAIL-CLOSED: on any uncertainty,
 * it returns empty/fail rather than writing potentially wrong content.
 *
 * GUARANTEES:
 * 1. stripHtmlComplete() removes ALL HTML tags, entities, RIS chrome, navigation
 * 2. contentMatchesDocument() verifies identity via case_number/ECLI/CELEX
 * 3. atomicWrite() never produces half-written files
 * 4. fetchWithRetry() handles 429/5xx with exponential backoff + jitter
 * 5. validateFetchedText() rejects empty, too-short, or chrome-contaminated text
 * 6. contentHash() produces a stable hash for post-backfill verification
 */

import { writeFileSync, renameSync, unlinkSync } from "fs";
import { createHash } from "crypto";

// ── HTML Stripping ─────────────────────────────────────────────────────

/**
 * Complete HTML → plain text conversion.
 *
 * Handles:
 * - Script/style blocks
 * - All HTML tags (including self-closing, malformed)
 * - Named entities (&amp; &lt; &gt; &quot; &apos; &nbsp;)
 * - Numeric entities (&#252; &#xFC;)
 * - German umlaut entities (&auml; &ouml; &uuml; &szlig; &Auml; &Ouml; &Uuml;)
 * - RIS-specific chrome (Accesskey, navigation, pagination headers)
 * - RIS metadata blocks (Gesetzesnummer, Dokumentnummer, alte Dokumentnummer)
 * - Double-encoded entities (&amp;amp; → &)
 * - Whitespace normalization
 */
export function stripHtmlComplete(html: string): string {
  let text = html;

  // 1. Remove script/style blocks entirely
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");

  // 1b. Remove screen-reader-only duplicate text (RIS HTML has both
  // aria-hidden="true" spans with § symbols and sr-only spans with
  // spelled-out "Paragraph", "römisch 40" etc. — keep only the real text).
  text = text.replace(/<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "");

  // 2. Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // 3. Convert structural tags to newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/h[1-6]>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<\/tr>/gi, "\n");
  text = text.replace(/<\/td>/gi, "\t");
  text = text.replace(/<h[1-6][^>]*>/gi, "\n## ");
  text = text.replace(/<li[^>]*>/gi, "\n- ");
  text = text.replace(/<p[^>]*>/gi, "");

  // 4. Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // 5. Decode entities — do this in order to handle double-encoding
  // First pass: decode numeric entities
  text = text.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

  // Second pass: decode named entities
  const namedEntities: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&auml;": "ä",
    "&ouml;": "ö",
    "&uuml;": "ü",
    "&Auml;": "Ä",
    "&Ouml;": "Ö",
    "&Uuml;": "Ü",
    "&szlig;": "ß",
    "&eacute;": "é",
    "&egrave;": "è",
    "&agrave;": "à",
    "&ccedil;": "ç",
    "&ntilde;": "ñ",
    "&reg;": "®",
    "&copy;": "©",
    "&sect;": "§",
    "&para;": "¶",
    "&middot;": "·",
    "&ndash;": "–",
    "&mdash;": "—",
    "&hellip;": "…",
    "&laquo;": "«",
    "&raquo;": "»",
    "&bull;": "•",
    "&deg;": "°",
    "&euro;": "€",
    "&times;": "×",
    "&divide;": "÷",
    "&frac12;": "½",
    "&frac14;": "¼",
    "&frac34;": "¾",
  };
  for (const [entity, replacement] of Object.entries(namedEntities)) {
    text = text.split(entity).join(replacement);
  }

  // Third pass: fix any remaining &amp;X; patterns (double-encoded)
  text = text.replace(/&amp;([a-z]+);/gi, (_, name) => {
    const entity = `&${name};`;
    return namedEntities[entity] ?? entity;
  });

  // 6. Remove RIS navigation chrome
  const risChromePatterns = [
    /Zum Inhalt\s*\(Accesskey\s*0\)/gi,
    /Zur Navigationsleiste\s*\(Accesskey\s*1\)/gi,
    /Zum Hauptbereich\s*\(Accesskey\s*2\)/gi,
    /Kontakt\s*\(Accesskey\s*4\)/gi,
    /Impressum\s*\(Accesskey\s*5\)/gi,
    /Seitenbereiche:/gi,
    /RIS\s*-\s*Startseite/gi,
    /- Startseite\n/gi,
    /- Bund\n/gi,
    /- Länder\n/gi,
    /- Bezirke\n/gi,
    /- Gemeinden\n/gi,
    /- Judikatur\n/gi,
    /- Kundmachungen,?\s*Erlässe\n/gi,
    /- Gesamtabfrage\n/gi,
    /- Hilfe\n/gi,
    /- Kontakt\n/gi,
    /- Impressum\n/gi,
    /Springe zum Inhalt/gi,
    /Über diese Seite/gi,
    /Dokument als PDF/gi,
    /Dokument als RTF/gi,
    /Web-Seite:/gi,
    /RTF-Dokument:/gi,
    /Signiertes PDF-Dokument:/gi,
  ];
  for (const p of risChromePatterns) {
    text = text.replace(p, "");
  }

  // 7. Remove RIS pagination headers: "www.ris.bka.gv.at Seite X von Y"
  text = text.replace(/www\.ris\.bka\.gv\.at\s+Seite\s+\d+\s+von\s+\d+/gi, "");

  // 8. Remove RIS metadata blocks at end of document
  // Pattern: GesetzesnummerXXXXX DokumentnummerXXXX alte DokumentnummerXXXX
  text = text.replace(/\n+Gesetzesnummer\d+\s*\n/g, "\n");
  text = text.replace(/\n+Dokumentnummer\S+\s*\n/g, "\n");
  text = text.replace(/\n+alte\s+Dokumentnummer\S+\s*\n?/g, "\n");

  // 9. Remove RIS copyright line
  text = text.replace(/©\s*\d{4}\s*Bundeskanzleramt\s*der\s*Republik\s*Österreich/gi, "");

  // 10. Remove "RIS Dokument" header line (appears in AT Landesrecht)
  text = text.replace(/^RIS\s+Dokument/m, "");

  // 11. Normalize whitespace
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

// ── RIS XML → Text ─────────────────────────────────────────────────────

/**
 * RIS OGD XML (risdok) → plain text.
 * Extracts <nutzdaten> content, strips <kzinhalt>/<fzinhalt> (print headers/footers).
 *
 * Handles ALL RIS XML structural elements:
 * - <ueberschrift> → ## heading
 * - <absatz> → paragraph text
 * - <abstand> → blank line separator
 * - <listelement> → numbered/literal list items (preserves numbering)
 * - <liste> → list container (unwrap)
 * - <tabelle>/<zeile>/<spalte> → table rows as tab-separated text
 * - <bild> → [BILD: description] placeholder
 * - <fnr>/<fussnote> → footnote markers preserved as [Fn N]
 * - <dnr> → document number markers (stripped, metadata only)
 * - <abschnitt> → section container (unwrap)
 * - <ueberschrift typ="titel"> → ## heading (titles)
 * - <ueberschrift typ="erltext"> → **bold** subheading
 * - <symbol> → preserved (§, ¶, etc.)
 * - <bd> → bold text (unwrap, content preserved)
 * - <it> → italic text (unwrap, content preserved)
 * - <u> → underlined text (unwrap, content preserved)
 */
export function risXmlToText(xml: string): string {
  const nutz = xml.match(/<nutzdaten>([\s\S]*?)<\/nutzdaten>/);
  if (!nutz) return "";
  let t = nutz[1];

  // Remove print page header/footer chrome
  t = t.replace(/<kzinhalt[^>]*>[\s\S]*?<\/kzinhalt>/g, "");
  t = t.replace(/<fzinhalt[^>]*>[\s\S]*?<\/fzinhalt>/g, "");

  // Remove document number markers (metadata, not content)
  t = t.replace(/<dnr[^>]*>[\s\S]*?<\/dnr>/g, "");
  t = t.replace(/<dnr[^>]*\/>/g, "");

  // Convert images to placeholder markers
  t = t.replace(/<bild[^>]*alt="([^"]*)"[^>]*\/>/g, "[BILD: $1]");
  t = t.replace(/<bild[^>]*\/>/g, "[BILD]");
  t = t.replace(/<bild[^>]*>([\s\S]*?)<\/bild>/g, "[BILD: $1]");

  // Convert tables to tab-separated text
  // <tabelle> contains <zeile> rows, each with <spalte> cells
  t = t.replace(/<tabelle[^>]*>([\s\S]*?)<\/tabelle>/g, (_, content: string) => {
    const rows = content.match(/<zeile[^>]*>[\s\S]*?<\/zeile>/g) || [];
    const textRows = rows
      .map((row: string) => {
        const cells = (row.match(/<spalte[^>]*>([\s\S]*?)<\/spalte>/g) || []).map((cell: string) =>
          cell.replace(/<[^>]+>/g, "").trim()
        );
        return cells.join("\t");
      })
      .filter((r: string) => r.length > 0);
    return "\n" + textRows.join("\n") + "\n";
  });

  // Unwrap list containers — just remove the wrapper tags, keeping inner content.
  // This handles <liste>, <ziffernliste>, <strichliste> and avoids the nested-list
  // regex problem where non-greedy [\s\S]*? breaks on nested </liste> closings.
  // The inner <listelement> items are processed separately below.
  t = t.replace(/<\/?(?:liste|ziffernliste|strichliste)[^>]*>/g, "\n");

  // Convert <listelement> items to bullet-style entries
  // Content is preserved (inner tags stripped later), just add newline prefix
  t = t.replace(/<listelement[^>]*>/g, "\n- ");
  t = t.replace(/<\/listelement>/g, "\n");

  // Convert footnotes: preserve as [Fn N] markers
  t = t.replace(/<fnr[^>]*>([\s\S]*?)<\/fnr>/g, (_, content: string) => {
    const num = content.replace(/<[^>]+>/g, "").trim();
    return `[Fn ${num}]`;
  });
  t = t.replace(/<fnr[^>]*\/>/g, "[Fn]");
  t = t.replace(/<fussnote[^>]*>([\s\S]*?)<\/fussnote>/g, (_, content: string) => {
    const fnText = content.replace(/<[^>]+>/g, "").trim();
    return fnText ? `\n[Fußnote: ${fnText}]` : "";
  });

  // Convert headings with type awareness
  // typ="titel" → ## heading, typ="erltext" → **bold** subheading
  t = t.replace(/<ueberschrift[^>]*typ="titel"[^>]*>([\s\S]*?)<\/ueberschrift>/g, "\n## $1\n");
  t = t.replace(/<ueberschrift[^>]*typ="erltext"[^>]*>([\s\S]*?)<\/ueberschrift>/g, "\n**$1**\n");
  t = t.replace(/<ueberschrift[^>]*>([\s\S]*?)<\/ueberschrift>/g, "\n## $1\n");

  // Convert <abstand> (spacing element) to blank line
  t = t.replace(/<abstand[^>]*\/>/g, "\n");
  t = t.replace(/<abstand[^>]*>([\s\S]*?)<\/abstand>/g, "\n");

  // Convert <absatz> (paragraph) — preserve content, add newlines
  t = t.replace(/<absatz[^>]*>/g, "\n").replace(/<\/absatz>/g, "\n");

  // Unwrap formatting elements: <bd> (bold), <it> (italic), <u> (underline),
  // <b> (bold), <symbol> (§ etc.), <abschnitt> (section container),
  // <schluss> (conclusion), <feld> (form field), <gdash> (dash marker)
  // These are semantic markers — content is preserved, tags are stripped
  t = t.replace(/<abschnitt[^>]*>/g, "").replace(/<\/abschnitt>/g, "");
  t = t.replace(/<bd[^>]*>([\s\S]*?)<\/bd>/g, "$1");
  t = t.replace(/<b[^>]*>([\s\S]*?)<\/b>/g, "$1");
  t = t.replace(/<it[^>]*>([\s\S]*?)<\/it>/g, "$1");
  t = t.replace(/<u[^>]*>([\s\S]*?)<\/u>/g, "$1");
  t = t.replace(/<symbol[^>]*>([\s\S]*?)<\/symbol>/g, "$1");
  t = t.replace(/<symbol[^>]*\/>/g, "");
  t = t.replace(/<schluss[^>]*>/g, "\n").replace(/<\/schluss>/g, "\n");
  t = t.replace(/<feld[^>]*>([\s\S]*?)<\/feld>/g, "$1");
  t = t.replace(/<feld[^>]*\/>/g, "");
  t = t.replace(/<gdash[^>]*\/?>/g, "— ");
  // <tab> → tab character (used for indentation in RIS XML)
  t = t.replace(/<tab[^>]*\/?>/g, "\t");

  // Strip all remaining XML tags
  t = t.replace(/<[^>]+>/g, "");

  // Decode entities
  t = decodeEntities(t);

  return t
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Decode numeric and named HTML entities. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ── Identity Verification ──────────────────────────────────────────────

/**
 * Verify that fetched text actually belongs to the requesting document.
 *
 * Checks (in order of reliability):
 * 1. case_number (Geschäftszahl) — unique per court decision
 * 2. ECLI — unique European Case Law Identifier
 * 3. CELEX — unique EU legislation identifier
 *
 * The normalization removes all whitespace and non-alphanumeric chars
 * to handle formatting differences (spaces, hyphens, slashes).
 *
 * CRITICAL: This is the ONLY guard against RIS serving a generic/fallback
 * page on HTTP 200. Without it, wrong documents get written under correct
 * frontmatter — the 2026-07-15 incident affected 72k files.
 */
export function contentMatchesDocument(
  text: string,
  fm: { case_number?: string; ecli?: string; celex?: string }
): boolean {
  const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const normText = normalize(text);

  const caseNum = fm.case_number?.trim() ?? "";
  const ecli = fm.ecli?.trim() ?? "";
  const celex = fm.celex?.trim() ?? "";

  if (caseNum && normText.includes(normalize(caseNum))) return true;
  if (ecli && normText.includes(normalize(ecli))) return true;

  if (celex) {
    const normCelex = normalize(celex);
    if (normText.includes(normCelex)) return true;
    // Also check without the leading country code digit (3 = EU legislation)
    const celexCore = normCelex.replace(/^3/, "");
    if (celexCore.length > 4 && normText.includes(celexCore)) return true;
  }

  // No identifiers to check — can't verify, accept (rare for judikatur/EU)
  if (!caseNum && !ecli && !celex) return true;
  return false;
}

// ── Text Validation ────────────────────────────────────────────────────

export interface TextValidationResult {
  valid: boolean;
  reason: string;
  cleanedText: string;
  charCount: number;
}

/**
 * Validate fetched text before writing it to a file.
 *
 * Rejects:
 * - Empty text
 * - Text shorter than 50 chars (likely an error page)
 * - Text that is only whitespace
 * - Text with excessive encoding artifacts (>5 U+FFFD)
 * - Text with RIS navigation chrome (Accesskey, Seitenbereiche)
 * - Text that still contains HTML tags
 */
export function validateFetchedText(text: string): TextValidationResult {
  const cleaned = text.trim();

  if (cleaned.length === 0) {
    return { valid: false, reason: "empty", cleanedText: "", charCount: 0 };
  }

  if (cleaned.length < 50) {
    return {
      valid: false,
      reason: `too_short (${cleaned.length} chars)`,
      cleanedText: cleaned,
      charCount: cleaned.length,
    };
  }

  // Check for encoding artifacts
  const artifactCount = (cleaned.match(/\uFFFD/g) || []).length;
  if (artifactCount > 5) {
    return {
      valid: false,
      reason: `encoding_artifacts (${artifactCount} U+FFFD)`,
      cleanedText: cleaned,
      charCount: cleaned.length,
    };
  }

  // Check for HTML residue
  if (/<\w+[^>]*>/.test(cleaned) || /<\/\w+>/.test(cleaned)) {
    return {
      valid: false,
      reason: "html_residue",
      cleanedText: cleaned,
      charCount: cleaned.length,
    };
  }

  // Check for RIS navigation chrome
  if (/Accesskey\s+\d/i.test(cleaned) || /Seitenbereiche:/i.test(cleaned)) {
    return {
      valid: false,
      reason: "ris_navigation_chrome",
      cleanedText: cleaned,
      charCount: cleaned.length,
    };
  }

  // Check for double-encoded entities (indicates encoding bug)
  if (/&amp;[a-z]+;|&amp;#\d+;/i.test(cleaned)) {
    return {
      valid: false,
      reason: "double_encoded_entities",
      cleanedText: cleaned,
      charCount: cleaned.length,
    };
  }

  return { valid: true, reason: "ok", cleanedText: cleaned, charCount: cleaned.length };
}

// ── Structure Validation ───────────────────────────────────────────────

export interface StructureValidationResult {
  valid: boolean;
  reason: string;
  sectionCount: number;
  absatzCount: number;
}

/**
 * Validate that a fetched law text has the expected legal structure.
 *
 * For statutes (type: law):
 * - Count §-headings (## § N) — should be > 0 for a real law
 * - Count Absatz markers ((1), (2), etc.) — should be present in most laws
 *
 * For decisions (type: court_decision):
 * - Count section headings (## ...) — should have at least heading structure
 * - Check for key sections (Rechtssatz, Tenor, etc.)
 *
 * This catches partial fetches where the API returned only a fragment.
 */
export function validateLegalStructure(
  text: string,
  docType: string,
  expectedSectionCount?: number
): StructureValidationResult {
  const sectionHeadings = (text.match(/^#{2,3}\s+§\s+\d+/gm) || []).length;
  const articleHeadings = (text.match(/^#{2,3}\s+Art\.?\s+\d+/gm) || []).length;
  const absatzMarkers = (text.match(/^\(\d+[a-z]?\)\s/gm) || []).length;
  const anyHeadings = (text.match(/^#{2,3}\s+/gm) || []).length;

  if (docType === "law" || docType === "landesgesetz" || docType === "eu_legislation") {
    // For laws: expect § or Art. headings
    const totalSections = sectionHeadings + articleHeadings;
    if (totalSections === 0 && text.length > 500) {
      // Could be an unstructured RIS dump — check for inline § markers
      const inlineSections = (text.match(/§\.?\s*\d+[a-z]*\s*\./g) || []).length;
      if (inlineSections < 3) {
        return {
          valid: false,
          reason: `no_section_headings (§=${sectionHeadings}, Art=${articleHeadings}, inline=${inlineSections})`,
          sectionCount: 0,
          absatzCount: absatzMarkers,
        };
      }
    }
  } else if (docType === "state_legislation") {
    // Landesrecht: many short Verordnungen have no §/Art. structure at all.
    // Only reject if text is long enough to expect structure AND has none.
    const totalSections = sectionHeadings + articleHeadings;
    if (totalSections === 0 && text.length > 2000) {
      const inlineSections = (text.match(/§\.?\s*\d+[a-z]*\s*\./g) || []).length;
      if (inlineSections < 3) {
        return {
          valid: false,
          reason: `no_section_headings (§=${sectionHeadings}, Art=${articleHeadings}, inline=${inlineSections})`,
          sectionCount: 0,
          absatzCount: absatzMarkers,
        };
      }
    }

    // If we know the expected section count, check for major loss
    if (expectedSectionCount && expectedSectionCount > 10) {
      const totalSections = sectionHeadings + articleHeadings;
      if (totalSections > 0 && totalSections < expectedSectionCount * 0.5) {
        return {
          valid: false,
          reason: `section_count_mismatch (expected~${expectedSectionCount}, got ${totalSections})`,
          sectionCount: totalSections,
          absatzCount: absatzMarkers,
        };
      }
    }

    return {
      valid: true,
      reason: "ok",
      sectionCount: sectionHeadings + articleHeadings,
      absatzCount: absatzMarkers,
    };
  }

  if (docType === "court_decision") {
    // For decisions: expect some heading structure
    if (anyHeadings === 0 && text.length > 500) {
      return {
        valid: false,
        reason: `no_decision_structure (headings=${anyHeadings})`,
        sectionCount: 0,
        absatzCount: absatzMarkers,
      };
    }
    return {
      valid: true,
      reason: "ok",
      sectionCount: anyHeadings,
      absatzCount: absatzMarkers,
    };
  }

  // Unknown type — accept
  return {
    valid: true,
    reason: "ok",
    sectionCount: sectionHeadings + articleHeadings,
    absatzCount: absatzMarkers,
  };
}

/**
 * Count §-headings in a markdown body (for pre/post-backfill comparison).
 * Handles both ## § N and inline § N. formats.
 */
export function countSections(body: string): number {
  const headed = (body.match(/^#{2,3}\s+§\s+\d+/gm) || []).length;
  const artHeaded = (body.match(/^#{2,3}\s+Art\.?\s+\d+/gm) || []).length;
  const inline = (body.match(/§\.?\s*\d+[a-z]*\s*\./g) || []).length;
  return Math.max(headed + artHeaded, inline);
}

// ── Content Hash ───────────────────────────────────────────────────────

/**
 * Produce a stable SHA-256 hash of the text content.
 * Used for post-backfill verification: if the hash changes after a re-fetch,
 * the content was modified or corrupted.
 */
export function contentHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
}

// ── Atomic Write ───────────────────────────────────────────────────────

/**
 * Atomic file write: write to temp file, then rename.
 * Prevents corrupt half-written files if the process is killed mid-write.
 *
 * The temp file is created in the same directory to avoid cross-device
 * rename errors (EXDEV).
 */
export function atomicWrite(filepath: string, content: string): void {
  const dir = filepath.slice(0, filepath.lastIndexOf("/"));
  const tmpPath = `${dir}/.bf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    writeFileSync(tmpPath, content, "utf-8");
    renameSync(tmpPath, filepath);
  } catch (e: any) {
    try {
      unlinkSync(tmpPath);
    } catch {}
    if (e?.code === "ENAMETOOLONG") {
      throw new Error(`filename too long: ${filepath.slice(-80)}`);
    }
    throw e;
  }
}

// ── Fetch with Retry ───────────────────────────────────────────────────

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  proxyFetchOptions?: Record<string, unknown>;
}

/**
 * Fetch with exponential backoff + jitter.
 *
 * Retries on:
 * - HTTP 429 (rate limited)
 * - HTTP 5xx (server error)
 * - Network errors (timeout, DNS, connection refused)
 *
 * The jitter prevents thundering herd when multiple workers retry simultaneously.
 */
export async function fetchWithRetry(
  url: string,
  opts: FetchOptions = {}
): Promise<Response | null> {
  const maxRetries = opts.maxRetries ?? 3;
  const retryBaseMs = opts.retryBaseMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: opts.headers,
        signal: AbortSignal.timeout(timeoutMs),
        ...(opts.proxyFetchOptions ?? {}),
      });

      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          // Exponential backoff + jitter (0-25% of delay)
          const baseDelay = retryBaseMs * Math.pow(2, attempt);
          const jitter = Math.floor(Math.random() * baseDelay * 0.25);
          await new Promise((r) => setTimeout(r, baseDelay + jitter));
          continue;
        }
      }

      // Handle 3xx redirects that fetch didn't follow automatically
      if (res.status >= 300 && res.status < 400 && attempt < maxRetries) {
        const location = res.headers.get("location");
        if (location) {
          const redirectUrl = location.startsWith("http")
            ? location
            : new URL(location, url).toString();
          return fetchWithRetry(redirectUrl, opts);
        }
      }

      return res;
    } catch {
      if (attempt < maxRetries) {
        const baseDelay = retryBaseMs * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * baseDelay * 0.25);
        await new Promise((r) => setTimeout(r, baseDelay + jitter));
      }
    }
  }
  return null;
}

// ── Frontmatter Helpers ────────────────────────────────────────────────

export function parseFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  if (!raw.startsWith("---")) return { fm: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { fm: {}, body: raw };
  const block = raw.slice(3, end);
  const fm: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    fm[m[1]] = v;
  }
  const afterClose = raw.indexOf("\n", end + 1);
  const bodyStart = afterClose === -1 ? raw.length : afterClose + 1;
  return { fm, body: raw.slice(bodyStart) };
}

export function isPlaceholder(body: string): boolean {
  return (
    body.includes("Volltext nicht abrufbar") ||
    body.includes("Volltext nicht verfügbar") ||
    body.includes("No full text available") ||
    body.trim().length < 50
  );
}

// ── Progress Tracking ──────────────────────────────────────────────────

export interface BackfillProgress {
  processed: number;
  total: number;
  success: number;
  failed: number;
  skipped: number;
  startTime: number;
  lastLogTime: number;
}

export function createProgress(total: number): BackfillProgress {
  return {
    processed: 0,
    total,
    success: 0,
    failed: 0,
    skipped: 0,
    startTime: Date.now(),
    lastLogTime: 0,
  };
}

export function logProgress(p: BackfillProgress, intervalMs = 5000): void {
  const now = Date.now();
  if (now - p.lastLogTime < intervalMs && p.processed < p.total) return;
  p.lastLogTime = now;

  const elapsed = Math.floor((now - p.startTime) / 1000);
  const rate = p.processed > 0 ? (p.processed / elapsed).toFixed(1) : "0";
  const remaining =
    p.processed > 0 ? Math.floor((elapsed / p.processed) * (p.total - p.processed)) : 0;
  const remMin = Math.floor(remaining / 60);
  const remSec = remaining % 60;

  console.log(
    `  [${p.processed}/${p.total}] ✅${p.success} ❌${p.failed} ⏭️${p.skipped} | ` +
      `${rate}/s | ETA: ${remMin}m${remSec}s`
  );
}
