/**
 * Format Austrian Supreme Court (OGH) decision titles for display.
 * Frontend mirror of server/src/core/think/ogh-format.ts.
 *
 * DB format:  "2026 03 25 1ob61 51"
 * Human format: "1 Ob 61/51"
 */

export function formatOghTitle(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;

  const withoutDate = raw.replace(/^\d{4}[-\s]\d{2}[-\s]\d{2}[-\s]?/, "").trim();

  if (!withoutDate) return raw;

  const match = withoutDate.match(/^(\d+)([a-z]+)(\d+)[-\s]?(\d+[a-z]?)$/i);

  if (!match) return raw;

  const [, num, senat, regNum, year] = match;
  return `${num} ${senat.toUpperCase()} ${regNum}/${year}`;
}

export function isOghSlug(slug: string): boolean {
  if (!slug) return false;
  return /^\d{4}-\d{2}-\d{2}-\d+[a-z]+\d+-\d+/i.test(slug);
}

export function formatCitationTitle(title: string, slug?: string): string {
  if (slug && isOghSlug(slug)) {
    const formatted = formatOghTitle(title);
    if (formatted !== title) return formatted;
    const fromSlug = formatOghTitle(slug);
    if (fromSlug !== slug) return fromSlug;
  }
  return title;
}
