/**
 * Relative date resolution for WhatsApp messages.
 *
 * Converts natural-language date expressions like "morgen", "nächste Woche",
 * "Freitag", "in 3 Tagen" into ISO date strings (YYYY-MM-DD).
 *
 * Pure, deterministic, zero dependencies — fully unit-testable.
 */

const WEEKDAYS = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];

const WEEKDAYS_SHORT = ["so", "mo", "di", "mi", "do", "fr", "sa"];

const _MONTHS = [
  "januar",
  "februar",
  "märz",
  "maerz",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "dezember",
];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Resolve a single relative date expression to an ISO date string.
 * Returns null if the expression is not recognized.
 */
export function resolveRelativeDate(expr: string, now: Date = new Date()): string | null {
  const trimmed = expr.trim().toLowerCase();
  if (!trimmed) return null;

  const today = getToday(now);

  // "heute"
  if (/^(heute|today)$/i.test(trimmed)) return ymd(today);

  // "morgen" / "tomorrow"
  if (/^(morgen|tomorrow)$/i.test(trimmed)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return ymd(d);
  }

  // "übermorgen"
  if (/^(übermorgen|uebermorgen)$/i.test(trimmed)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return ymd(d);
  }

  // "gestern" (rare but possible)
  if (/^(gestern|yesterday)$/i.test(trimmed)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return ymd(d);
  }

  // "in N tagen" / "in N wochen" / "in N monaten"
  const inNMatch = trimmed.match(
    /^in\s+(\d+)\s+(tag(?:en|e)?|woche(?:n)?|monat(?:en|e)?|jahr(?:en|e)?)$/i
  );
  if (inNMatch) {
    const n = parseInt(inNMatch[1], 10);
    const unit = inNMatch[2].toLowerCase();
    const d = new Date(today);
    if (unit.startsWith("tag")) d.setDate(d.getDate() + n);
    else if (unit.startsWith("woche")) d.setDate(d.getDate() + n * 7);
    else if (unit.startsWith("monat")) d.setMonth(d.getMonth() + n);
    else if (unit.startsWith("jahr")) d.setFullYear(d.getFullYear() + n);
    return ymd(d);
  }

  // "nächste woche" / "nächster monat"
  if (/^(?:nächste|naechste)\s+woche$/i.test(trimmed)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return ymd(d);
  }
  if (/^(?:nächster|naechster)\s+monat$/i.test(trimmed)) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 1);
    return ymd(d);
  }

  // "ende des monats" / "monatsende"
  if (/^(?:ende\s+(?:des\s+)?monats|monatsende)$/i.test(trimmed)) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return ymd(d);
  }

  // "anfang des monats" / "monatsanfang"
  if (/^(?:anfang\s+(?:des\s+)?monats|monatsanfang)$/i.test(trimmed)) {
    return ymd(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  // Weekday names: "montag", "dienstag", ...
  // If today is the same weekday, return next week's occurrence
  // "nächster montag" / "nächste woche montag"
  const nextWeekdayMatch = trimmed.match(/^(?:nächster|naechster|nächste|naechste)\s+(.+)$/);
  const weekdayName = nextWeekdayMatch ? nextWeekdayMatch[1] : trimmed;
  const weekdayIdx = WEEKDAYS.indexOf(weekdayName);
  const weekdayShortIdx = WEEKDAYS_SHORT.indexOf(weekdayName);

  if (weekdayIdx !== -1 || weekdayShortIdx !== -1) {
    const targetIdx = weekdayIdx !== -1 ? weekdayIdx : weekdayShortIdx;
    const currentDay = today.getDay();
    let diff = targetIdx - currentDay;
    if (diff <= 0) diff += 7;
    const d = new Date(today);
    d.setDate(d.getDate() + diff);
    return ymd(d);
  }

  // Already a valid date format — pass through
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(trimmed)) {
    const m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (m) {
      const year = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }

  // "am + weekday"
  const amMatch = trimmed.match(/^am\s+(.+)$/);
  if (amMatch) {
    const inner = amMatch[1].trim();
    const idx = WEEKDAYS.indexOf(inner);
    const shortIdx = WEEKDAYS_SHORT.indexOf(inner);
    if (idx !== -1 || shortIdx !== -1) {
      const targetIdx = idx !== -1 ? idx : shortIdx;
      const currentDay = today.getDay();
      let diff = targetIdx - currentDay;
      if (diff <= 0) diff += 7;
      const d = new Date(today);
      d.setDate(d.getDate() + diff);
      return ymd(d);
    }
  }

  return null;
}

/**
 * Scan a text for relative date expressions and replace them with ISO dates.
 * Returns the text with all recognized relative dates replaced.
 *
 * Example: "Termin morgen um 10 Uhr" → "Termin 2026-07-14 um 10 Uhr"
 */
export function expandRelativeDates(text: string, now: Date = new Date()): string {
  let result = text;

  // Ordered replacements — longest expressions first to avoid partial matches

  // "ende des monats" / "monatsende"
  result = result.replace(
    /\b(?:ende\s+(?:des\s+)?monats|monatsende)\b/gi,
    () => resolveRelativeDate("monatsende", now) ?? "monatsende"
  );

  // "anfang des monats" / "monatsanfang"
  result = result.replace(
    /\b(?:anfang\s+(?:des\s+)?monats|monatsanfang)\b/gi,
    () => resolveRelativeDate("monatsanfang", now) ?? "monatsanfang"
  );

  // "nächste woche" / "nächster monat"
  result = result.replace(
    /\b(?:nächste|naechste)\s+woche\b/gi,
    () => resolveRelativeDate("nächste woche", now) ?? "nächste woche"
  );
  result = result.replace(
    /\b(?:nächster|naechster)\s+monat\b/gi,
    () => resolveRelativeDate("nächster monat", now) ?? "nächster monat"
  );

  // "in N tagen/wochen/monaten/jahren"
  result = result.replace(
    /\bin\s+(\d+)\s+(tag(?:en|e)?|woche(?:n)?|monat(?:en|e)?|jahr(?:en|e)?)\b/gi,
    (match) => resolveRelativeDate(match, now) ?? match
  );

  // "übermorgen" — use (?<!\w) instead of \b because \b doesn't work with non-ASCII ü
  result = result.replace(
    /(?<![\wäöüß])(?:übermorgen|uebermorgen)(?![\wäöüß])/gi,
    () => resolveRelativeDate("übermorgen", now) ?? "übermorgen"
  );

  // "morgen" — but NOT when it's part of "morgens" (adverb) or "morgen früh"
  result = result.replace(
    /(?<![\wäöüß])morgen(?![\wäöüß])(?!\s*(?:früh|frueh|morgens))/gi,
    () => resolveRelativeDate("morgen", now) ?? "morgen"
  );

  // "heute"
  result = result.replace(/\bheute\b/gi, () => resolveRelativeDate("heute", now) ?? "heute");

  // "nächster/naechster + weekday"
  result = result.replace(
    /\b(?:nächster|naechster|nächste|naechste)\s+(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)\b/gi,
    (match) => resolveRelativeDate(match, now) ?? match
  );

  // "am + weekday"
  result = result.replace(
    /\bam\s+(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)\b/gi,
    (match) => resolveRelativeDate(match, now) ?? match
  );

  // Bare weekday names (only when preceded by a word boundary and not part of a larger word)
  // Be conservative: only replace if the weekday appears as a standalone word
  for (const wd of WEEKDAYS) {
    const regex = new RegExp(`\\b${wd}\\b`, "gi");
    result = result.replace(regex, (match) => {
      // Don't replace if it's already been converted (check if it looks like a date)
      if (/^\d{4}-\d{2}-\d{2}$/.test(match)) return match;
      return resolveRelativeDate(wd, now) ?? match;
    });
  }

  return result;
}

/**
 * Check if a text contains any relative date expressions.
 * Useful for deciding whether to run the expansion.
 */
export function hasRelativeDates(text: string): boolean {
  const lower = text.toLowerCase();
  const weekdayPattern = /\b(?:sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)\b/;
  return (
    /\b(?:heute|morgen|übermorgen|uebermorgen|gestern)\b/.test(lower) ||
    /\b(?:nächste|naechste)\s+(?:woche|monat)\b/.test(lower) ||
    /\b(?:nächster|naechster)\s+(?:sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)\b/.test(
      lower
    ) ||
    /\bin\s+\d+\s+(?:tag|woche|monat|jahr)/.test(lower) ||
    /\b(?:ende|anfang)\s+(?:des\s+)?monats\b/.test(lower) ||
    /\b(?:monatsende|monatsanfang)\b/.test(lower) ||
    /\bam\s+(?:sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)\b/.test(lower) ||
    weekdayPattern.test(lower)
  );
}
