/**
 * RFC 5545 content-line helpers shared by every iCalendar producer
 * (deadline feed, calendar export). Pure and client-safe.
 */

const encoder = new TextEncoder();

/**
 * RFC 5545 §3.1 line folding: content lines longer than 75 octets are split,
 * each continuation starting with a single space. Counted in UTF-8 octets and
 * never inside a multi-byte character (umlauts, „—").
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  // First line may hold 75 octets, continuations 74 (+ the leading space).
  let budget = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (currentBytes + bytes > budget) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      budget = 74;
    }
    current += ch;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** Joins content lines with CRLF, folding each one (RFC 5545 §3.1). */
export function icsLines(lines: readonly string[]): string {
  return lines.filter(Boolean).map(foldLine).join("\r\n");
}

/**
 * VTIMEZONE for Europe/Vienna — required by RFC 5545 §3.2.19 whenever a
 * DTSTART/DTEND carries `TZID=Europe/Vienna`.
 */
export const VTIMEZONE_EUROPE_VIENNA: readonly string[] = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Vienna",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** A UTC instant as an iCalendar DATE-TIME in UTC form (`YYYYMMDDTHHMMSSZ`). */
export function icsUtcDateTime(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}
