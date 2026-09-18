/**
 * Client-safe subset of citation-gate.
 * Contains only pure functions and types — NO imports from node:fs/node:path.
 * Client code must import from here, not from citation-gate.ts (which pulls in
 * legal-grounding.ts → node:fs).
 */

import type { RawCitation, GroundedCitation } from "@/lib/types";

// ── Statute extraction ────────────────────────────────────────────────

/**
 * Regex to extract statute references from legal text.
 * Matches patterns like:
 *   § 433 BGB
 *   § 922 ABGB
 *   § 12 Abs. 3 ZPO
 *   §§ 433, 434 BGB
 *   § 1 StGB
 *   § 5 Abs 1 StGB          (Austrian style, no dot after "Abs")
 *   § 1 AußStrG, § 1 B-VG   (ß, umlauts, hyphen in the abbreviation)
 *   § 16 EStG 1988          (year in the title)
 *   Art. 7 B-VG, Art 8 EMRK (articles)
 */
const PARA_PART = String.raw`(\d+[a-z]?(?:\s*(?:Abs\.?|Absatz)\s*\d+)?)`;
const CODE_PART = String.raw`([A-ZÄÖÜ](?:[A-Za-zÄÖÜäöüß]{1,12}(?:-[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{0,8})?|-[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{0,8})(?:\s(?:18|19|20)\d{2}(?!\d))?)`;
const STATUTE_RX = new RegExp(String.raw`§+\s*${PARA_PART}\s+${CODE_PART}`, "g");
const ARTICLE_RX = new RegExp(
  String.raw`(?<![A-Za-zÄÖÜäöüß])(?:Art\.?|Artikel)\s*${PARA_PART}\s+${CODE_PART}`,
  "g"
);

/**
 * Extract statute citations from free-text answer.
 * Returns deduplicated RawCitation[] suitable for groundCitations().
 */
export function extractStatuteCitations(text: string): RawCitation[] {
  const citations: RawCitation[] = [];
  const seen = new Set<string>();
  for (const [rx, prefix] of [
    [STATUTE_RX, "§"],
    [ARTICLE_RX, "Art."],
  ] as const) {
    rx.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rx.exec(text)) !== null) {
      const paragraph = `${prefix} ${match[1].trim()}`;
      const code = match[2].trim();
      const key = `${code}#${paragraph}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const start = Math.max(0, match.index - 60);
      const end = Math.min(text.length, match.index + match[0].length + 60);
      const context = text.slice(start, end).replace(/\s+/g, " ").trim();

      citations.push({ code, paragraph, context });
    }
  }

  return citations;
}

/** The user's profile jurisdiction ("AT" | "DE" | "CH") as a grounding preference. */
export function userJurisdiction(j: string | null | undefined): "at" | "de" | "ch" | null {
  const v = (j ?? "").toLowerCase();
  return v === "at" || v === "de" || v === "ch" ? v : null;
}

// ── Inline links to the official text ────────────────────────────────

const OFFICIAL_URL_RX = /^https:\/\/(www\.ris\.bka\.gv\.at|eur-lex\.europa\.eu)\/[^"'<>\s]*$/;

/** Official publication hosts only (RIS, EUR-Lex) — anything else is never linked. */
export function isOfficialUrl(url: string | undefined | null): url is string {
  return !!url && OFFICIAL_URL_RX.test(url);
}

/** "im RIS" / "in EUR-Lex" — the source with its German preposition, for sentences. */
export function officialSourceIn(url: string | undefined | null): string {
  return officialSourceLabel(url) === "EUR-Lex" ? "in EUR-Lex" : "im RIS";
}

/** Short name of the official source behind a URL, for button labels. */
export function officialSourceLabel(url: string | undefined | null): "RIS" | "EUR-Lex" {
  return url && url.startsWith("https://eur-lex.europa.eu/") ? "EUR-Lex" : "RIS";
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Apply `replace` to the text between tags only — never attributes, and never
 * text already inside <a>, <code> or <pre>. Each pass re-splits the HTML, so a
 * link inserted by an earlier pass is skipped by the next one.
 */
function replaceInText(
  html: string,
  rx: RegExp,
  replace: (match: string, ...groups: (string | undefined)[]) => string
): string {
  let skipDepth = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        const tag = part.match(/^<\/?\s*(a|code|pre)\b/i);
        if (tag) skipDepth += part.startsWith("</") ? -1 : 1;
        if (skipDepth < 0) skipDepth = 0;
        return part;
      }
      if (skipDepth > 0 || !part) return part;
      return part.replace(new RegExp(rx.source, rx.flags), replace);
    })
    .join("");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** "1 Ob 49/01i" → matches "1 Ob 49/01i", "1Ob49/01i"; "RS0115754" → also "RS 0115754". */
function flexibleCaseRx(cited: string): string {
  return cited
    .replace(/\s+/g, " ")
    .split(/(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])| /)
    .map(escapeRegex)
    .join("\\s?");
}

/**
 * Wrap every grounded, verified citation in already-rendered answer HTML with
 * a link to its official text (RIS, EUR-Lex). Statutes carry data-* so a plain click
 * opens the norm reader; decisions link straight to the RIS document.
 * Citations without a verified official URL stay plain text.
 */
export function linkCitationsInHtml(html: string, grounded: GroundedCitation[]): string {
  const statutes = new Map<string, GroundedCitation>();
  const cases: GroundedCitation[] = [];
  for (const gc of grounded) {
    if (!gc.verified || !isOfficialUrl(gc.source_url)) continue;
    if (gc.category === "judikatur") cases.push(gc);
    else statutes.set(`${gc.code}#${gc.paragraph}`, gc);
  }
  if ((statutes.size === 0 && cases.length === 0) || !html) return html;

  let out = html;
  if (statutes.size > 0) {
    const statuteRx = new RegExp(`${STATUTE_RX.source}|${ARTICLE_RX.source}`, "g");
    out = replaceInText(out, statuteRx, (m, sPara, sCode, aPara, aCode) => {
      const key = sPara
        ? `${sCode!.trim()}#§ ${sPara.trim()}`
        : `${aCode!.trim()}#Art. ${aPara!.trim()}`;
      const gc = statutes.get(key);
      if (!gc) return m;
      // data-* lets the norm reader open in place on a plain click; the
      // href stays the RIS page for cmd/middle click and no-JS.
      const data =
        ` data-code="${escapeAttr(gc.code)}" data-paragraph="${escapeAttr(gc.paragraph)}"` +
        (gc.jurisdiction ? ` data-jurisdiction="${escapeAttr(gc.jurisdiction)}"` : "");
      return `<a href="${escapeAttr(gc.source_url!)}" target="_blank" rel="noopener noreferrer" class="citation-official"${data} title="Normtext anzeigen">${m}</a>`;
    });
  }
  for (const gc of cases) {
    const rx = new RegExp(`(?<![\\p{L}\\d])${flexibleCaseRx(gc.paragraph)}(?![\\p{L}\\d])`, "gu");
    out = replaceInText(
      out,
      rx,
      (m) =>
        `<a href="${escapeAttr(gc.source_url!)}" target="_blank" rel="noopener noreferrer" class="citation-official" title="${gc.code === "RIS-Justiz" ? "Rechtssatz" : `${escapeAttr(gc.code)}-Entscheidung`} im RIS öffnen">${m}</a>`
    );
  }
  return out;
}

// ── Literature / Materialien extraction ───────────────────────────────
// Mirrors server/src/core/legal/literature-citations.ts (engine-side).
// Pure regex — client-safe.

export type LiteratureCitationKind = "materialien" | "kommentar_oa" | "licensed_work";

export interface RawLiteratureCitation {
  kind: LiteratureCitationKind;
  /** Verbatim citation text as matched. */
  raw: string;
  /** Work label for display (e.g. "BT-Drs.", "Onlinekommentar", "Grüneberg"). */
  work: string;
  /** Reference within the work (e.g. "19/27873", "Art. 53"). */
  ref: string;
  /** Corpus file basename (without .md), when resolvable. */
  corpusFile: string | null;
  /** Corpus directory under law-corpus/, when resolvable. */
  corpusDir: "de-materialien" | "ch-literatur" | null;
  pinpoint?: string;
  jurisdiction: "de" | "ch";
}

const DRUCKSACHE_RX =
  /\b(BT|BR)-(?:Drs\.?|Drucksache)\s*(\d{1,3})\/(\d{1,6})(?:\s*,?\s*S\.\s*(\d{1,5}))?/g;
const OK_SHORT_RX =
  /\bOK-([A-ZÄÖÜ][A-Za-z]{1,8})\s+Art\.?\s*(\d+[a-z]?)(?:\s+(?:Rn\.?|N)\s*(\d{1,4}))?/g;
const OK_LONG_RX =
  /\bOnlinekommentar\s+zu\s+Art\.?\s*(\d+[a-z]?)\s+([A-ZÄÖÜ][A-Za-z]{1,8})(?:\s+(?:Rn\.?|N)\s*(\d{1,4}))?/g;
const LICENSED_RX =
  /\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]+(?:\/[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]+)?),?\s+([A-ZÄÖÜ][A-Za-z]{1,8})\s*§\s*(\d+[a-z]?)\s+Rn\.?\s*(\d{1,4})/g;

/** CH codes covered by Onlinekommentar.ch (site slug = abbr + article number). */
const OK_CH_CODES = new Set(["ZGB", "OR", "BV", "BPR", "STGB", "DSG", "BGÖ", "BGOE"]);

/** Publisher works we recognize but hold no license for (fail-closed). */
const LICENSED_WORKS = new Set([
  "grüneberg",
  "palandt",
  "palandt/grüneberg",
  "mükobgb",
  "münchener",
  "staudinger",
  "erman",
  "bamberger/roth",
  "beckok",
  "henssler",
  "baumbach/hopt",
  "zöller",
  "thomas/putzo",
  "schönke/schröder",
  "fischer",
]);

/**
 * Extract literature + Gesetzesmaterialien citations from answer text.
 * Deduplicated; publisher-commentary citations are surfaced as
 * `licensed_work` so grounding can flag them instead of dropping them.
 */
export function extractLiteratureCitations(text: string): RawLiteratureCitation[] {
  const out: RawLiteratureCitation[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(DRUCKSACHE_RX)) {
    const [raw, organ, wp, nr, seite] = m;
    const file = `${organ.toLowerCase()}d-${wp}-${nr}`;
    if (seen.has(file)) continue;
    seen.add(file);
    out.push({
      kind: "materialien",
      raw,
      work: `${organ}-Drs.`,
      ref: `${wp}/${nr}`,
      corpusFile: file,
      corpusDir: "de-materialien",
      ...(seite ? { pinpoint: `S. ${seite}` } : {}),
      jurisdiction: "de",
    });
  }

  const pushOk = (raw: string, code: string, art: string, rn?: string) => {
    const upper = code.toUpperCase();
    if (!OK_CH_CODES.has(upper)) return;
    const file = `ok-${upper.toLowerCase().replace("ö", "oe")}${art.toLowerCase()}`;
    if (seen.has(file)) return;
    seen.add(file);
    out.push({
      kind: "kommentar_oa",
      raw,
      work: "Onlinekommentar",
      ref: `Art. ${art} ${code}`,
      corpusFile: file,
      corpusDir: "ch-literatur",
      ...(rn ? { pinpoint: `Rn. ${rn}` } : {}),
      jurisdiction: "ch",
    });
  };
  for (const m of text.matchAll(OK_SHORT_RX)) pushOk(m[0], m[1], m[2], m[3]);
  for (const m of text.matchAll(OK_LONG_RX)) pushOk(m[0], m[2], m[1], m[3]);

  for (const m of text.matchAll(LICENSED_RX)) {
    const [raw, work, code, para] = m;
    if (!LICENSED_WORKS.has(work.toLowerCase())) continue;
    const key = `licensed:${raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: "licensed_work",
      raw,
      work,
      ref: `${code} § ${para}`,
      corpusFile: null,
      corpusDir: null,
      jurisdiction: "de",
    });
  }

  return out;
}

// ── Grounding metadata ────────────────────────────────────────────────

export interface GroundingMetadata {
  citations_verified: number;
  citations_unverified: number;
  corpus_checked: boolean;
  grounded_citations: GroundedCitation[];
  analyzed_at: string;
  has_unverified: boolean;
  warning?: string;
}

// ── JSON response text extraction ─────────────────────────────────────

/**
 * Known top-level string fields in engine JSON responses that may contain
 * statute references requiring corpus grounding.
 */
const JSON_TEXT_FIELDS = [
  "answer",
  "summary",
  "memo",
  "analysis",
  "review",
  "text",
  "translated_text",
  "anonymized_text",
  "content",
  "conclusion",
  "recommendation",
  "report",
] as const;

/**
 * Known array fields whose items may contain text with statute references.
 */
const JSON_ARRAY_FIELDS = [
  "results",
  "risks",
  "issues",
  "findings",
  "items",
  "redlines",
  "obligations",
  "deadlines",
] as const;

/**
 * Text fields to look for inside array items.
 */
const ARRAY_ITEM_TEXT_FIELDS = [
  "text",
  "description",
  "reason",
  "legal_basis",
  "summary",
  "analysis",
  "content",
  "recommendation",
  "mitigation",
] as const;

/**
 * Extract all text from a JSON engine response that might contain statute
 * citations. Scans known top-level string fields and known array-of-object
 * fields, collecting text for grounding.
 */
export function extractTextFromJsonResponse(obj: Record<string, unknown>): string[] {
  const parts: string[] = [];

  for (const field of JSON_TEXT_FIELDS) {
    if (typeof obj[field] === "string") {
      const text = (obj[field] as string).trim();
      if (text) parts.push(text);
    }
  }

  for (const field of JSON_ARRAY_FIELDS) {
    if (!Array.isArray(obj[field])) continue;
    for (const item of obj[field] as Array<Record<string, unknown>>) {
      if (typeof item !== "object" || item === null) continue;
      for (const tf of ARRAY_ITEM_TEXT_FIELDS) {
        if (typeof item[tf] === "string") {
          const text = (item[tf] as string).trim();
          if (text) parts.push(text);
        }
      }
    }
  }

  return parts;
}

/**
 * Empty grounding metadata for error/fallback cases.
 */
export function emptyGroundingMetadata(): GroundingMetadata {
  return {
    citations_verified: 0,
    citations_unverified: 0,
    corpus_checked: false,
    grounded_citations: [],
    analyzed_at: new Date().toISOString(),
    has_unverified: false,
  };
}
