/**
 * Client-safe subset of citation-gate.
 * Contains only pure functions and types — NO imports from node:fs/node:path.
 * Client code must import from here, not from citation-gate.ts (which pulls in
 * legal-grounding.ts → node:fs).
 */

import type { RawCitation, GroundedCitation } from "@/lib/types";

// ── Statute extraction ────────────────────────────────────────────────

/**
 * Statute references in legal text. One grammar for German, Austrian and
 * Swiss citation styles:
 *
 *   § 433 BGB · § 922 ABGB · § 12 Abs. 3 ZPO · § 5 Abs 1 StGB
 *   § 6 Abs 1 Z 5 KSchG · § 6 Abs. 1 Z. 5 KSchG · § 7 lit a MRG
 *   § 1 Abs 1 Satz 2 BGB · Art. 6 Abs. 1 UAbs. 1 lit. b DSGVO
 *   §§ 433, 434 BGB · §§ 1295, 1299 ABGB · §§ 1293 ff ABGB · §§ 1293 bis 1295 ABGB
 *   § 879 Abs 3 iVm § 864a ABGB (the trailing abbreviation covers the list)
 *   § 1 AußStrG, § 1 B-VG (ß, umlauts, hyphen) · § 16 EStG 1988 (year in the title)
 *   Art 7 B-VG, Art. 8 EMRK (articles)
 *
 * Each number in a list yields its own citation; "ff"/"f" keeps only the
 * first norm (the range is open), "bis" checks both ends. Subdivisions
 * (Abs, Z, lit, Satz, UAbs …) stay in the paragraph text but are never
 * taken for the statute abbreviation.
 *
 * Known limit: a subdivision list swallows a following short number
 * ("§ 6 Abs 1, 7 KSchG" reads as "Abs 1, 7"); the norm itself (§ 6) is still
 * checked.
 */
const L = "A-Za-zÄÖÜäöüß";
const NUM = String.raw`\d+(?:[a-z](?![${L}]))?`;
const SUB_NUM_KEY = String.raw`(?:UAbs\.?|Unterabs\.?|Abs\.?|Absatz|Ziff\.?|Ziffer|Z\.?|Satz|S\.|Nr\.?|Pkt\.?|Punkt|Halbsatz|Hs\.?)`;
const SUB_LIST_SEP = String.raw`\s*(?:,|und|bis|–|-)\s*`;
/** Values continuing a subdivision list ("Abs 1 und 2", "lit a, b") are short. */
const SUB_NUM = String.raw`${SUB_NUM_KEY}\s*\d+[a-z]?(?![${L}\d])(?:${SUB_LIST_SEP}\d{1,2}[a-z]?(?![${L}\d]))*`;
const SUB_LIT = String.raw`lit\.?\s*[a-z](?![${L}])(?:${SUB_LIST_SEP}[a-z](?![${L}]))*`;
const FF = String.raw`\s*f{1,2}\.?(?![${L}])`;
const ITEM = String.raw`${NUM}(?:\s*(?:${SUB_NUM}|${SUB_LIT}))*(?:${FF})?`;
const LIST_SEP_WORD = String.raw`(?:,|;|und|sowie|oder|bzw\.?|bis|–|-|[iI]\.?\s?[vV]\.?\s?[mM]\.?)`;
const PARA_PREFIX = String.raw`§+`;
const ART_PREFIX = String.raw`(?:Art\.?|Artikel)`;
const listSep = (prefix: string) => String.raw`\s*${LIST_SEP_WORD}\s*(?:${prefix}\s*)?`;
const numberList = (prefix: string) => String.raw`${ITEM}(?:${listSep(prefix)}${ITEM}){0,20}`;
/** Subdivision words are never a statute abbreviation. */
const NOT_A_CODE = String.raw`(?!(?:Abs|Absatz|UAbs|Unterabs|Satz|Nr|Ziff|Ziffer|Pkt|Punkt|Halbsatz|Hs|Lit|Fall)(?![${L}]))`;
const CODE_PART = String.raw`${NOT_A_CODE}([A-ZÄÖÜ](?:[A-Za-zÄÖÜäöüß]{1,12}(?:-[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{0,8})?|-[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{0,8})(?:\s(?:18|19|20)\d{2}(?!\d))?)`;
const STATUTE_RX = new RegExp(
  String.raw`${PARA_PREFIX}\s*(${numberList(PARA_PREFIX)})\s+${CODE_PART}`,
  "g"
);
const ARTICLE_RX = new RegExp(
  String.raw`(?<![${L}])${ART_PREFIX}\s*(${numberList(ART_PREFIX)})\s+${CODE_PART}`,
  "g"
);

const ITEM_STICKY = new RegExp(`(${ITEM})`, "y");
const FF_TAIL = new RegExp(`${FF}$`);
const SEP_STICKY = {
  "§": new RegExp(listSep(PARA_PREFIX), "y"),
  "Art.": new RegExp(listSep(ART_PREFIX), "y"),
} as const;

/**
 * Split the number list of one match ("1295, 1299", "1293 ff",
 * "6 Abs 1 Z 5") into paragraph strings ("§ 1295", "§ 6 Abs 1 Z 5").
 */
function paragraphsOfList(listText: string, prefix: "§" | "Art."): string[] {
  const sepRx = SEP_STICKY[prefix];
  const out: string[] = [];
  let pos = 0;
  while (pos < listText.length) {
    ITEM_STICKY.lastIndex = pos;
    const item = ITEM_STICKY.exec(listText);
    if (!item) break;
    const body = item[1].replace(FF_TAIL, "").replace(/\s+/g, " ").trim();
    out.push(`${prefix} ${body}`);
    pos = ITEM_STICKY.lastIndex;
    sepRx.lastIndex = pos;
    if (!sepRx.exec(listText)) break;
    pos = sepRx.lastIndex;
  }
  return out;
}

export interface StatuteCitationMatch {
  /** Offset of the whole citation in the scanned text. */
  index: number;
  /** The whole citation as written ("§§ 1295, 1299 ABGB"). */
  text: string;
  code: string;
  /** One entry per cited norm, e.g. ["§ 1295", "§ 1299"]. */
  paragraphs: string[];
}

/** Every statute citation in `text`, § citations first, then articles. */
export function scanStatuteCitations(text: string): StatuteCitationMatch[] {
  const out: StatuteCitationMatch[] = [];
  for (const [rx, prefix] of [
    [STATUTE_RX, "§"],
    [ARTICLE_RX, "Art."],
  ] as const) {
    rx.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rx.exec(text)) !== null) {
      out.push({
        index: match.index,
        text: match[0],
        code: match[2].trim(),
        paragraphs: paragraphsOfList(match[1], prefix),
      });
    }
  }
  return out;
}

/**
 * Extract statute citations from free-text answer.
 * Returns deduplicated RawCitation[] suitable for groundCitations().
 */
export function extractStatuteCitations(text: string): RawCitation[] {
  const citations: RawCitation[] = [];
  const seen = new Set<string>();
  for (const m of scanStatuteCitations(text)) {
    const start = Math.max(0, m.index - 60);
    const end = Math.min(text.length, m.index + m.text.length + 60);
    const context = text.slice(start, end).replace(/\s+/g, " ").trim();
    for (const paragraph of m.paragraphs) {
      const key = `${m.code}#${paragraph}`;
      if (seen.has(key)) continue;
      seen.add(key);
      citations.push({ code: m.code, paragraph, context });
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

/** Misgrounded citations keep their link but are marked in the text itself. */
function citationClass(gc: GroundedCitation): string {
  return gc.support === "unsupported"
    ? "citation-official citation-misgrounded"
    : "citation-official";
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
    out = replaceInText(out, statuteRx, (m, sList, sCode, aList, aCode) => {
      const code = (sList ? sCode : aCode)!.trim();
      const paragraphs = sList ? paragraphsOfList(sList, "§") : paragraphsOfList(aList!, "Art.");
      // A list ("§§ 1295, 1299 ABGB") links to its first verified norm.
      const gc = paragraphs.map((p) => statutes.get(`${code}#${p}`)).find(Boolean);
      if (!gc) return m;
      // data-* lets the norm reader open in place on a plain click; the
      // href stays the RIS page for cmd/middle click and no-JS.
      const data =
        ` data-code="${escapeAttr(gc.code)}" data-paragraph="${escapeAttr(gc.paragraph)}"` +
        (gc.jurisdiction ? ` data-jurisdiction="${escapeAttr(gc.jurisdiction)}"` : "");
      return `<a href="${escapeAttr(gc.source_url!)}" target="_blank" rel="noopener noreferrer" class="${citationClass(gc)}"${data} title="${gc.support === "unsupported" ? "Achtung: diese Norm trägt die Aussage nicht" : "Normtext anzeigen"}">${m}</a>`;
    });
  }
  for (const gc of cases) {
    const rx = new RegExp(`(?<![\\p{L}\\d])${flexibleCaseRx(gc.paragraph)}(?![\\p{L}\\d])`, "gu");
    out = replaceInText(
      out,
      rx,
      (m) =>
        `<a href="${escapeAttr(gc.source_url!)}" target="_blank" rel="noopener noreferrer" class="${citationClass(gc)}" title="${gc.support === "unsupported" ? "Achtung: diese Entscheidung trägt die Aussage nicht" : `${gc.code === "RIS-Justiz" ? "Rechtssatz" : `${escapeAttr(gc.code)}-Entscheidung`} im RIS öffnen`}">${m}</a>`
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
  jurisdiction: "de" | "ch" | "at";
  /** Official page to check the citation by hand (AT Materialien: Parlament). */
  checkUrl?: string;
}

const DRUCKSACHE_RX =
  /\b(BT|BR)-(?:Drs\.?|Drucksache)\s*(\d{1,3})\/(\d{1,6})(?:\s*,?\s*S\.\s*(\d{1,5}))?/g;
const OK_SHORT_RX =
  /\bOK-([A-ZÄÖÜ][A-Za-z]{1,8})\s+Art\.?\s*(\d+[a-z]?)(?:\s+(?:Rn\.?|N)\s*(\d{1,4}))?/g;
const OK_LONG_RX =
  /\bOnlinekommentar\s+zu\s+Art\.?\s*(\d+[a-z]?)\s+([A-ZÄÖÜ][A-Za-z]{1,8})(?:\s+(?:Rn\.?|N)\s*(\d{1,4}))?/g;
const LICENSED_RX =
  /\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]+(?:\/[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]+)?),?\s+([A-ZÄÖÜ][A-Za-z]{1,8})\s*§\s*(\d+[a-z]?)\s+Rn\.?\s*(\d{1,4})/g;

// Austrian commentary: "Reischauer in Rummel, ABGB³ § 1295 Rz 1",
// "Kodek in Kletečka/Schauer, ABGB-ON1.05 § 879 Rz 3", "Schwimann/Kodek, ABGB § 1 Rz 2"
// (Rz or Rn, optional emphasis stars and edition digits after the code).
const AT_LICENSED_RX =
  /\*?([A-ZÄÖÜ][\p{L}]+(?:\/[A-ZÄÖÜ][\p{L}]+)?)\*?,?\s+([A-ZÄÖÜ][A-Za-z]{1,8}(?:-ON)?)[\u00B2\u00B3\u00B9\u2070-\u2079\d.]*\s*§\s*(\d+[a-z]?)\s+(?:Rz|Rn)\.?\s*(\d{1,4})/gu;
// Austrian Gesetzesmaterialien: "ErläutRV 1234 BlgNR 24. GP", "AB 567 BlgNR XXVII. GP".
const AT_MATERIALIEN_RX =
  /\b(ErläutRV|ErlRV|RV|AB|IA)\s+(\d{1,5})\s+(?:der\s+)?Blg\.?\s*NR\.?\s*(\d{1,2}|[IVXLC]{1,7})\.?\s*GP\b/g;

/** Publisher works for Austrian law we recognise but hold no licence for. */
const AT_LICENSED_WORKS = new Set([
  "rummel",
  "rummel/lukas",
  "schwimann",
  "schwimann/kodek",
  "schwimann/neumayr",
  "klang",
  "kletečka/schauer",
  "kletecka/schauer",
  "koziol/welser",
  "koziol/bydlinski/bollenberger",
  "kbb",
  "fasching",
  "fasching/konecny",
  "rechberger",
  "rechberger/klicka",
  "straube",
  "straube/ratka/rauter",
  "höpfel/ratz",
  "wiener kommentar",
  "fenyves/kerschner/vonkilch",
]);

const ROMAN = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
] as const;

function toRoman(n: number): string {
  let out = "";
  for (const [v, r] of ROMAN) {
    while (n >= v) {
      out += r;
      n -= v;
    }
  }
  return out;
}

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

  for (const m of text.matchAll(AT_MATERIALIEN_RX)) {
    const [raw, kind, nr, gpRaw] = m;
    const gp = /^\d+$/.test(gpRaw) ? toRoman(Number(gpRaw)) : gpRaw.toUpperCase();
    const key = `at-mat:${nr}:${gp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: "materialien",
      raw,
      work: kind === "ErlRV" ? "ErläutRV" : kind,
      ref: `${nr} BlgNR ${gp}. GP`,
      corpusFile: null,
      corpusDir: null,
      jurisdiction: "at",
      checkUrl: `https://www.parlament.gv.at/gegenstand/${gp}/I/${nr}`,
    });
  }

  for (const m of text.matchAll(AT_LICENSED_RX)) {
    const [raw, work, code, para, rz] = m;
    if (!AT_LICENSED_WORKS.has(work.toLowerCase())) continue;
    const key = `licensed:${work.toLowerCase()}:${code}:${para}:${rz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: "licensed_work",
      raw,
      work,
      ref: `${code} § ${para}`,
      corpusFile: null,
      corpusDir: null,
      pinpoint: `Rz ${rz}`,
      jurisdiction: "at",
    });
  }

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
  /** Second stage ran: each verified citation carries a `support` verdict. */
  support_checked?: boolean;
  /** Verified sources that do NOT carry the statement they are cited for. */
  citations_misgrounded?: number;
  /** The check itself failed (network, timeout, rejected) — nothing was verified. */
  check_failed?: boolean;
}

export const CHECK_FAILED_WARNING =
  "Zitatprüfung fehlgeschlagen — die Zitate dieses Textes sind nicht geprüft. Anwaltlich prüfen.";

/**
 * What the citation panel shows when the check could not run: "not checked"
 * and a warning, never a silent absence that reads like "nothing to flag".
 */
export function failedGroundingMetadata(): GroundingMetadata {
  return {
    citations_verified: 0,
    citations_unverified: 0,
    corpus_checked: false,
    grounded_citations: [],
    analyzed_at: new Date().toISOString(),
    has_unverified: true,
    warning: CHECK_FAILED_WARNING,
    check_failed: true,
  };
}

export interface CitationSupportResult {
  code: string;
  paragraph: string;
  support: NonNullable<GroundedCitation["support"]>;
  support_reason?: string;
}

/** Fold the support-check verdicts into grounding metadata (pure, keyed by code + paragraph). */
export function mergeSupport(
  grounding: GroundingMetadata,
  results: CitationSupportResult[]
): GroundingMetadata {
  const byKey = new Map(results.map((r) => [`${r.code}#${r.paragraph}`, r]));
  const grounded_citations = grounding.grounded_citations.map((gc) => {
    const r = gc.verified ? byKey.get(`${gc.code}#${gc.paragraph}`) : undefined;
    return r ? { ...gc, support: r.support, support_reason: r.support_reason } : gc;
  });
  return {
    ...grounding,
    grounded_citations,
    support_checked: true,
    citations_misgrounded: grounded_citations.filter((gc) => gc.support === "unsupported").length,
  };
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
