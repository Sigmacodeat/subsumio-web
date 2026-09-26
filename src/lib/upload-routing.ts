/**
 * Filename-based auto-routing for bulk uploads.
 *
 * Suggests a document type and (where possible) a target case from a filename,
 * so a drag-and-drop batch of scanned Kanzlei documents pre-fills sensible
 * defaults. Suggestions are advisory — the user can always override per file.
 *
 * Pure and framework-agnostic so it is unit-testable.
 */
import {
  findeGeschaeftszahlen,
  gleicheGeschaeftszahl,
  parseGeschaeftszahl,
} from "@/lib/legal/geschaeftszahl";

export interface RoutingSuggestion {
  /** Detected document type (German Kanzlei taxonomy), if any. */
  docType?: string;
  /** Detected Geschäftszahl/Aktenzeichen, canonical form (e.g. "12 Cg 34/25x"). */
  aktenzeichen?: string;
  /**
   * The ONE existing matter whose case number the filename names. Advisory
   * only — it never replaces the matter the user chose for the upload.
   */
  matchedCaseSlug?: string;
  /** Several matters carry the named number — the user must decide. */
  ambiguousCaseSlugs?: string[];
  /** A matter whose title appears in the filename — a weak hint, never an assignment. */
  titleMatchCaseSlug?: string;
  /** Short human-readable hint for the UI (de). */
  hint?: string;
}

export interface KnownCase {
  slug: string;
  title: string;
  /** Optional Aktenzeichen stored on the case. */
  aktenzeichen?: string;
}

/** Matters that take new documents: everything except archived/deleted ones. */
export function uploadTargetCases<T extends { frontmatter?: Record<string, unknown> }>(
  cases: T[]
): T[] {
  return cases.filter((c) => {
    const status = c.frontmatter?.status;
    return status !== "archived" && status !== "tombstoned";
  });
}

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

  // Geschäftszahl: shared normalisation (Prüfbuchstabe kept, spacing and
  // case tolerant; file names use "-" or "_" for the slash).
  const gz = findeGeschaeftszahlen(stem)[0];
  if (gz) {
    suggestion.aktenzeichen = gz.formatted;
    const byAz = cases.filter((c) => {
      const stored = parseGeschaeftszahl(c.aktenzeichen);
      return stored ? gleicheGeschaeftszahl(stored, gz) : false;
    });
    if (byAz.length === 1) suggestion.matchedCaseSlug = byAz[0]!.slug;
    else if (byAz.length > 1) suggestion.ambiguousCaseSlugs = byAz.map((c) => c.slug);
  }

  for (const { re, type } of DOC_TYPE_KEYWORDS) {
    if (re.test(haystack)) {
      suggestion.docType = type;
      break;
    }
  }

  // Weak hint: filename contains a matter title. Shown, never applied.
  if (!suggestion.matchedCaseSlug && !suggestion.ambiguousCaseSlugs) {
    const lowerHay = haystack.toLowerCase();
    const byTitle = cases.filter(
      (c) => c.title && c.title.length >= 4 && lowerHay.includes(c.title.toLowerCase())
    );
    if (byTitle.length === 1) suggestion.titleMatchCaseSlug = byTitle[0]!.slug;
  }

  const parts: string[] = [];
  if (suggestion.docType) parts.push(suggestion.docType);
  if (suggestion.aktenzeichen) parts.push(`Az. ${suggestion.aktenzeichen}`);
  if (suggestion.matchedCaseSlug) parts.push("passt zu einer Akte");
  else if (suggestion.ambiguousCaseSlugs) parts.push("mehrere Akten mit dieser Zahl");
  else if (suggestion.titleMatchCaseSlug) parts.push("Titel ähnelt einer Akte");
  if (parts.length > 0) suggestion.hint = parts.join(" · ");

  return suggestion;
}

/**
 * A filename suggestion that points at a matter OTHER than the one the user
 * chose for this file (or the batch). The upload still goes to the chosen
 * matter; the UI only offers to switch.
 */
export function divergentRoutingSlug(
  routing: Pick<RoutingSuggestion, "matchedCaseSlug" | "titleMatchCaseSlug">,
  chosenCaseSlug: string | undefined
): string | undefined {
  const suggested = routing.matchedCaseSlug ?? routing.titleMatchCaseSlug;
  if (!suggested || !chosenCaseSlug) return suggested;
  return suggested === chosenCaseSlug ? undefined : suggested;
}
