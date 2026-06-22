/**
 * Filename-based auto-routing for bulk uploads.
 *
 * Suggests a document type and (where possible) a target case from a filename,
 * so a drag-and-drop batch of scanned Kanzlei documents pre-fills sensible
 * defaults. Suggestions are advisory — the user can always override per file.
 *
 * Pure and framework-agnostic so it is unit-testable.
 */

export interface RoutingSuggestion {
  /** Detected document type (German Kanzlei taxonomy), if any. */
  docType?: string;
  /** Detected German Aktenzeichen (e.g. "12 C 345/24"), if any. */
  aktenzeichen?: string;
  /** Slug of an existing case the filename appears to reference, if matched. */
  matchedCaseSlug?: string;
  /** Short human-readable hint for the UI (de). */
  hint?: string;
}

export interface KnownCase {
  slug: string;
  title: string;
  /** Optional Aktenzeichen stored on the case. */
  aktenzeichen?: string;
}

// German court Aktenzeichen: "<n> <Registerzeichen> <lfd>/<Jahr>",
// e.g. "12 C 345/24", "4 O 1234/2023", "5 Ca 67/22". Filenames can't contain "/",
// so the year separator may appear as "/", "-" or "_". Matched on the raw stem
// (separators intact), then rebuilt to the canonical "<n> <Reg> <lfd>/<Jahr>".
const AKTENZEICHEN_RE = /(\d{1,4})\s*([A-Za-z]{1,3})\s*(\d{1,5})[/_-](\d{2,4})(?!\d)/;

// Document-type keywords → canonical Kanzlei doc type. No word boundaries: German
// compounds ("Mietvertrag", "Honorarrechnung", "Mahnbescheid") must still match.
// Order matters — more specific terms first.
const DOC_TYPE_KEYWORDS: { re: RegExp; type: string }[] = [
  { re: /klage/i, type: "klage" },
  { re: /urteil|beschluss/i, type: "urteil" },
  { re: /schriftsatz/i, type: "schriftsatz" },
  { re: /vertrag|vereinbarung/i, type: "vertrag" },
  { re: /rechnung|kostennote|honorar/i, type: "rechnung" },
  { re: /bescheid/i, type: "bescheid" },
  { re: /vollmacht/i, type: "vollmacht" },
  { re: /gutachten/i, type: "gutachten" },
  { re: /mahnung|mahnbescheid/i, type: "mahnung" },
  { re: /protokoll/i, type: "protokoll" },
];

function normalizeAz(az: string): string {
  return az.replace(/\s+/g, "").toLowerCase();
}

/**
 * Derive a routing suggestion from a filename (basename or relative path).
 * `cases` is the list of existing cases to match an Aktenzeichen/title against.
 */
export function inferUploadRouting(
  filename: string,
  cases: readonly KnownCase[] = []
): RoutingSuggestion {
  // Strip directory and extension. Keep `stem` with original separators for the
  // Aktenzeichen match; derive a space-normalized `haystack` for word matching.
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const stem = base.replace(/\.[^.]+$/, "");
  const haystack = stem.replace(/[._-]+/g, " ");

  const suggestion: RoutingSuggestion = {};

  const azMatch = stem.match(AKTENZEICHEN_RE);
  if (azMatch) {
    const [, num, reg, lfd, year] = azMatch;
    suggestion.aktenzeichen = `${num} ${reg.toUpperCase()} ${lfd}/${year}`;
    const target = normalizeAz(suggestion.aktenzeichen);
    const byAz = cases.find((c) => c.aktenzeichen && normalizeAz(c.aktenzeichen) === target);
    if (byAz) suggestion.matchedCaseSlug = byAz.slug;
  }

  for (const { re, type } of DOC_TYPE_KEYWORDS) {
    if (re.test(haystack)) {
      suggestion.docType = type;
      break;
    }
  }

  // Fallback case match: filename contains a case title (loose, case-insensitive).
  if (!suggestion.matchedCaseSlug) {
    const lowerHay = haystack.toLowerCase();
    const byTitle = cases.find(
      (c) => c.title && c.title.length >= 4 && lowerHay.includes(c.title.toLowerCase())
    );
    if (byTitle) suggestion.matchedCaseSlug = byTitle.slug;
  }

  const parts: string[] = [];
  if (suggestion.docType) parts.push(suggestion.docType);
  if (suggestion.aktenzeichen) parts.push(`Az. ${suggestion.aktenzeichen}`);
  if (suggestion.matchedCaseSlug) parts.push("→ Akte erkannt");
  if (parts.length > 0) suggestion.hint = parts.join(" · ");

  return suggestion;
}
