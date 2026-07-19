/**
 * Literature & Materialien Citation Extraction — secondary legal sources.
 *
 * Complements `multi-jurisdiction-citations.ts` (statutes) and
 * `judikatur-citations.ts` (case law) with the third citation class lawyers
 * actually use in Schriftsätze:
 *
 *   - Gesetzesmaterialien:  "BT-Drs. 19/27873, S. 34", "BR-Drs. 123/24"
 *   - Open-Access-Kommentar: "OK-ZGB Art. 53 Rn. 5" / "Onlinekommentar zu Art. 53 ZGB"
 *   - Verlags-Kommentare:    "Grüneberg, BGB § 433 Rn. 5" — RECOGNIZED but
 *     unresolvable (kind: "licensed_work"): we hold no license for the text,
 *     so grounding must mark these as not verifiable against our corpus
 *     instead of silently ignoring them.
 *
 * Fail-closed: only sources present in the literature corpus dirs produce
 * resolvable slugs; everything else is surfaced as unresolvable.
 */

export type LiteratureKind = "materialien" | "kommentar_oa" | "licensed_work";

export interface LiteratureReference {
  kind: LiteratureKind;
  /** Verbatim citation text as matched. */
  raw: string;
  /** Canonical corpus slug, when resolvable (kind != licensed_work). */
  slug: string | null;
  jurisdiction: "de" | "at" | "ch" | "eu" | null;
  /** Optional pinpoint: page ("S. 34") or margin number ("Rn. 5"). */
  pinpoint: string | null;
  /** For licensed works: the work name (e.g. "Grüneberg") for UI messaging. */
  work: string | null;
}

// ── Patterns ─────────────────────────────────────────────────────────────────

/** "BT-Drs. 19/27873" / "BT-Drucksache 19/27873" / "BR-Drs. 123/24", optional ", S. 34". */
const DRUCKSACHE_PATTERN =
  /\b(BT|BR)-(?:Drs\.?|Drucksache)\s*(\d{1,3})\/(\d{1,6})(?:\s*,?\s*S\.\s*(\d{1,5}))?/g;

/**
 * Onlinekommentar references:
 *   "OK-ZGB Art. 53" | "OK-BV Art. 3 Rn. 12"
 *   "Onlinekommentar zu Art. 53 ZGB"
 */
const OK_SHORT_PATTERN =
  /\bOK-([A-ZÄÖÜ][A-Za-z]{1,8})\s+Art\.?\s*(\d+[a-z]?)(?:\s+(?:Rn\.?|N)\s*(\d{1,4}))?/g;
const OK_LONG_PATTERN =
  /\bOnlinekommentar\s+zu\s+Art\.?\s*(\d+[a-z]?)\s+([A-ZÄÖÜ][A-Za-z]{1,8})(?:\s+(?:Rn\.?|N)\s*(\d{1,4}))?/g;

/**
 * Licensed commentary style: "Grüneberg, BGB § 433 Rn. 5",
 * "Palandt/Grüneberg, BGB § 433 Rn. 5", "MüKoBGB/Wagner § 823 Rn. 10".
 * Recognized so grounding can say "Verlags-Content, nicht im freien Korpus"
 * instead of dropping the citation silently.
 */
const LICENSED_WORK_PATTERN =
  /\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]+(?:\/[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]+)?),?\s+([A-ZÄÖÜ][A-Za-z]{1,8})\s*§\s*(\d+[a-z]?)\s+Rn\.?\s*(\d{1,4})/g;

/** Known licensed work names — only these trigger the licensed_work class. */
const KNOWN_LICENSED_WORKS = new Set([
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

// ── Extraction ───────────────────────────────────────────────────────────────

/** CH statute abbreviations covered by Onlinekommentar (site slug = abbr + art nr). */
const OK_CH_CODES = new Set(["ZGB", "OR", "BV", "BPR", "StGB", "DSG", "BGÖ", "BGOE"]);

export function extractLiteratureReferences(text: string): LiteratureReference[] {
  const refs: LiteratureReference[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(DRUCKSACHE_PATTERN)) {
    const [raw, organ, wahlperiode, nummer, seite] = m;
    const slug = `legal/materialien/de/${organ.toLowerCase()}d-${wahlperiode}-${nummer}`;
    if (seen.has(slug + (seite ?? ""))) continue;
    seen.add(slug + (seite ?? ""));
    refs.push({
      kind: "materialien",
      raw,
      slug,
      jurisdiction: "de",
      pinpoint: seite ? `S. ${seite}` : null,
      work: `${organ}-Drs.`,
    });
  }

  const pushOk = (raw: string, code: string, art: string, rn: string | undefined) => {
    const normalized = code.toUpperCase() === "BGOE" ? "BGÖ" : code;
    if (!OK_CH_CODES.has(normalized.toUpperCase()) && !OK_CH_CODES.has(normalized)) return;
    const siteSlug = `${normalized.toLowerCase().replace("ö", "oe")}${art.toLowerCase()}`;
    const slug = `legal/literatur/ch/ok-${siteSlug}`;
    if (seen.has(slug + (rn ?? ""))) return;
    seen.add(slug + (rn ?? ""));
    refs.push({
      kind: "kommentar_oa",
      raw,
      slug,
      jurisdiction: "ch",
      pinpoint: rn ? `Rn. ${rn}` : null,
      work: "Onlinekommentar",
    });
  };

  for (const m of text.matchAll(OK_SHORT_PATTERN)) pushOk(m[0], m[1], m[2], m[3]);
  for (const m of text.matchAll(OK_LONG_PATTERN)) pushOk(m[0], m[2], m[1], m[3]);

  for (const m of text.matchAll(LICENSED_WORK_PATTERN)) {
    const [raw, work] = m;
    if (!KNOWN_LICENSED_WORKS.has(work.toLowerCase())) continue;
    const key = `licensed:${raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      kind: "licensed_work",
      raw,
      slug: null,
      jurisdiction: "de",
      pinpoint: null,
      work,
    });
  }

  return refs;
}

/**
 * Human-readable grounding verdict for a literature reference.
 * licensed_work never verifies — the corpus holds no licensed publisher text.
 */
export function literatureGroundingHint(ref: LiteratureReference): string {
  switch (ref.kind) {
    case "materialien":
      return `Gesetzesmaterialie ${ref.raw} — verifizierbar gegen ${ref.slug}`;
    case "kommentar_oa":
      return `Open-Access-Kommentar ${ref.raw} — verifizierbar gegen ${ref.slug}`;
    case "licensed_work":
      return (
        `${ref.raw}: Verlags-Content (${ref.work}) — nicht im freien Korpus, ` +
        `keine Verifikation möglich. Zitat anwaltlich prüfen.`
      );
  }
}
