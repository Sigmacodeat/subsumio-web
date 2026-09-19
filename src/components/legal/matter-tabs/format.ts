/**
 * Display helpers shared by the matter tabs — turn engine values (urgency keys,
 * source slugs) into lawyer-facing text. Dates go through `@/lib/utils`.
 */

const URGENCY_LABELS_DE: Record<string, string> = {
  critical: "kritisch",
  high: "hoch",
  urgent: "dringend",
  medium: "mittel",
  normal: "normal",
  low: "niedrig",
};

const URGENCY_LABELS_EN: Record<string, string> = {
  critical: "critical",
  high: "high",
  urgent: "urgent",
  medium: "medium",
  normal: "normal",
  low: "low",
};

export function urgencyLabel(urgency: string | undefined, lang: string = "de"): string {
  if (!urgency) return "";
  const labels = lang === "en" ? URGENCY_LABELS_EN : URGENCY_LABELS_DE;
  return labels[urgency.toLowerCase()] ?? urgency;
}

/**
 * "KI-Analyse: documents/beschluss-klagebeantwortung" → "Beschluss Klagebeantwortung".
 * Keeps plain-text sources as they are; strips page-path prefixes and dashes.
 */
export function sourceLabel(source: string | undefined): string {
  if (!source) return "";
  const withoutPrefix = source.replace(/^[^:]*:\s*/, (m) => (m.includes("/") ? m : ""));
  const lastSegment = withoutPrefix.includes("/")
    ? (withoutPrefix.split("/").filter(Boolean).pop() ?? withoutPrefix)
    : withoutPrefix;
  // Free text ("Mandant per Telefon") stays as written; only slug-like
  // identifiers are turned into words.
  if (!/^[a-z0-9][a-z0-9-_.]*$/i.test(lastSegment)) return lastSegment;
  // Document names are German nouns in practice: capitalise every word
  // ("beschluss-klagebeantwortung" → "Beschluss Klagebeantwortung").
  return lastSegment
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
