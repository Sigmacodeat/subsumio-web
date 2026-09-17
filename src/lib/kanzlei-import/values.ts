// Value parsing for firm-data imports (exports of RA-MICRO, Advoware, DATEV Anwalt,
// Excel lists). Austrian and German conventions first: 31.12.2026, 1.234,56 €, 1:30 h.

/** Case- and whitespace-insensitive key, for case numbers and e-mail addresses. */
export function normaliseKey(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** Names and titles: lower case, punctuation and repeated spaces removed. */
export function normaliseName(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.,;:()"'„“”/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Dates as yyyy-mm-dd. Accepts 31.12.2026, 31.12.26, 31/12/2026, 2026-12-31
 * (with or without time) and Excel serial numbers. Returns null when the value
 * is not a real calendar date — 31.02.2026 is refused, not rolled over.
 */
export function parseDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})(?:\s.*)?$/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (m[3].length === 2) year += year < 70 ? 2000 : 1900;
    return isoDate(year, Number(m[2]), Number(m[1]));
  }
  if (/^\d{5}(?:[.,]\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s.replace(",", ".")));
    if (serial < 20000 || serial > 80000) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  return null;
}

/** 1.234,56 · 1234.56 · € 250 · 250,- → number. Null when not a number. */
export function parseAmount(v: unknown): number | null {
  let s = String(v ?? "")
    .replace(/€|eur|euro/gi, "")
    .replace(/,-$/, "")
    .replace(/\s+/g, "")
    .trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/**
 * Duration in minutes. "1:30" and "01:30:00" are hours:minutes. A plain number is
 * read in the unit of the mapped column ("45" minutes or "0,75" hours); "min" or
 * "h"/"Std" in the value win over the column unit. Null outside 1 minute – 24 hours.
 */
export function parseMinutes(v: unknown, unit: "minutes" | "hours"): number | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  let minutes: number | null = null;
  const hm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (hm) {
    minutes = Number(hm[1]) * 60 + Number(hm[2]);
  } else {
    const explicitMin = /\bmin/.test(s);
    const explicitHours = /\b(h|std|stunden?)\b|\d(h|std)\b/.test(s);
    const n = parseAmount(s.replace(/min(uten)?|stunden?|std|h/g, ""));
    if (n === null) return null;
    const asHours = explicitHours || (!explicitMin && unit === "hours");
    minutes = Math.round(asHours ? n * 60 : n);
  }
  return minutes >= 1 && minutes <= 24 * 60 ? minutes : null;
}

/** ja/nein columns. Null when the value is neither. */
export function parseYesNo(v: unknown): boolean | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!s) return false;
  if (/^(ja|j|yes|y|x|1|true|wahr|✓|✔)$/.test(s)) return true;
  if (/^(nein|n|no|0|false|falsch|-)$/.test(s)) return false;
  return null;
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

export type ImportedCaseStatus = "open" | "pending" | "dormant" | "archived";

/** Status words of practice software mapped to Subsumio matter states. */
export function parseCaseStatus(v: unknown): { status: ImportedCaseStatus; known: boolean } {
  const s = normaliseName(v);
  if (!s) return { status: "open", known: true };
  if (/^(offen|aktiv|laufend|in bearbeitung|bearbeitung|open|active|neu)$/.test(s)) {
    return { status: "open", known: true };
  }
  if (/^(wartend|warten|pending|schwebend)$/.test(s)) return { status: "pending", known: true };
  if (/^(ruhend|ruht|dormant|pausiert)$/.test(s)) return { status: "dormant", known: true };
  if (
    /^(erledigt|abgeschlossen|abgelegt|archiviert|beendet|geschlossen|closed|archived)$/.test(s)
  ) {
    return { status: "archived", known: true };
  }
  return { status: "open", known: false };
}

export type ImportedContactRole = "client" | "opponent" | "court" | "lawyer" | "other";

export function parseContactRole(v: unknown): { role: ImportedContactRole; known: boolean } {
  const s = normaliseName(v);
  if (!s) return { role: "other", known: true };
  if (/^(mandant|mandantin|klient|klientin|auftraggeber|auftraggeberin|client)$/.test(s)) {
    return { role: "client", known: true };
  }
  if (/^(gegner|gegnerin|gegenseite|gegenpartei|opponent)$/.test(s)) {
    return { role: "opponent", known: true };
  }
  if (/^(gericht|behörde|behoerde|court)$/.test(s)) return { role: "court", known: true };
  if (/(anwalt|anwältin|anwaeltin|kollege|kollegin|notar|lawyer)/.test(s)) {
    return { role: "lawyer", known: true };
  }
  if (
    /^(sonstige|sonstiger|andere|other|zeuge|zeugin|sachverständiger|sachverstaendiger)$/.test(s)
  ) {
    return { role: "other", known: true };
  }
  return { role: "other", known: false };
}
