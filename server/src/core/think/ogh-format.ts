/**
 * Format Austrian Supreme Court (OGH) decision titles from machine-readable
 * slugs/titles into human-readable docket numbers.
 *
 * DB format:  "2026 03 25 1ob61 51"  (date + space-separated docket parts)
 * Slug format: "2026-03-25-1ob61-51"
 * Human format: "1 Ob 61/51"
 *
 * The OGH docket number structure is:
 *   {number}{senat}{regNum} {year}
 *   e.g. "1ob61 51" → "1 Ob 61/51"
 *        "15os120 02" → "15 OS 120/02"
 *        "12os8 17v" → "12 OS 8/17v"
 */

/**
 * Format an OGH decision title or slug into a human-readable docket number.
 * Returns the original input if it doesn't match the OGH pattern.
 */
export function formatOghTitle(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;

  // Try to extract the docket number from either a title or slug.
  // Both contain the pattern: {digits}{letters}{digits}[-\s]{digits}[a-z]?
  // The date prefix (YYYY-MM-DD or YYYY MM DD) is stripped first.

  // Remove date prefix: "2026 03 25 " or "2026-03-25-"
  const withoutDate = raw
    .replace(/^\d{4}[-\s]\d{2}[-\s]\d{2}[-\s]?/, "")
    .trim();

  if (!withoutDate) return raw;

  // Parse the docket number: "1ob61-51" or "1ob61 51" or "1ob6151"
  // Pattern: {number}{senat_code}{reg_num}[-\s]{year}[letter]?
  const match = withoutDate.match(
    /^(\d+)([a-z]+)(\d+)[-\s]?(\d+[a-z]?)$/i
  );

  if (!match) return raw;

  const [, num, senat, regNum, year] = match;
  const senatUpper = senat.toUpperCase();

  return `${num} ${senatUpper} ${regNum}/${year}`;
}

/**
 * Check if a slug or title looks like an OGH decision.
 * Used to decide whether to apply OGH formatting.
 */
export function isOghSlug(slug: string): boolean {
  if (!slug) return false;
  // OGH slugs start with a date and contain a docket number
  return /^\d{4}-\d{2}-\d{2}-\d+[a-z]+\d+-\d+/i.test(slug);
}

/**
 * Format a citation title for display. Applies OGH formatting when the slug
 * indicates an Austrian Supreme Court decision, otherwise returns the title
 * as-is.
 */
export function formatCitationTitle(title: string, slug?: string): string {
  if (slug && isOghSlug(slug)) {
    const formatted = formatOghTitle(title);
    if (formatted !== title) return formatted;
    // If title formatting didn't help, try formatting from the slug
    const fromSlug = formatOghTitle(slug);
    if (fromSlug !== slug) return fromSlug;
  }
  return title;
}
