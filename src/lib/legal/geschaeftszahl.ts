/**
 * Geschäftszahl (AT) / Aktenzeichen — one normalisation for every place that
 * assigns incoming material to a matter (upload, e-mail, WhatsApp, imports).
 *
 *   "12 Cg 34/25x", "12Cg34/25x", "12 CG 34 / 25 X", "12 Cg 34-25x" (Dateiname)
 *   → alle derselbe Schlüssel "12cg34/25x"
 *
 * Rules:
 *  - Abteilung, Gattungszeichen, Aktenzahl, Jahr and the Prüfbuchstabe are
 *    kept; whitespace and upper/lower case are irrelevant.
 *  - A Prüfbuchstabe that is present on BOTH sides must be equal. A number
 *    written without it (older records, typed by hand) still matches the same
 *    number with it — the letter is derived from the number.
 *  - Text search only takes whole tokens: "11 Cg 3/25a" never contains
 *    "1 Cg 3/25a".
 *  - Internal Aktenzahlen that are no Geschäftszahl ("2026-001") compare with
 *    whitespace and case removed, never as a substring.
 *
 * The engine carries the same rules in server/src/core/legal/gz-validate.ts
 * (`normalisiereGZ`, `findeGZImText`); a parity test keeps both in step.
 */

export interface GeschaeftszahlTeile {
  abteilung: string;
  gattung: string;
  aktenzahl: string;
  jahr: string;
  /** Prüfbuchstabe, lower case, or null when not written. */
  pruefzeichen: string | null;
}

export interface GeschaeftszahlFund extends GeschaeftszahlTeile {
  /** Exact text span as it appears in the input. */
  raw: string;
  index: number;
  /** Canonical display form, e.g. "12 Cg 34/25x". */
  formatted: string;
}

// Abteilung · Gattungszeichen (1–4 letters) · Aktenzahl · "/" (in file names
// also "-" or "_") · Jahr (2 digits AT, 4 digits DE) · optional Prüfbuchstabe
// directly attached. Anchored by the caller (full string) or by token
// boundaries (text search).
const CORE =
  "(\\d{1,4})\\s*([A-Za-zÄÖÜäöü]{1,4})\\s*(\\d{1,6})\\s*[/_-]\\s*(\\d{4}|\\d{2})([A-Za-z])?";

const FULL_RE = new RegExp(`^\\s*${CORE}\\s*(?:-\\s*\\d+(?:\\.\\d+)*)?\\s*$`);
const SEARCH_RE = new RegExp(`(?<![\\p{L}\\p{N}])${CORE}(?![\\p{L}\\p{N}])`, "gu");

function teile(m: RegExpExecArray | RegExpMatchArray): GeschaeftszahlTeile {
  return {
    abteilung: String(Number(m[1])),
    gattung: m[2]!,
    aktenzahl: String(Number(m[3])),
    jahr: m[4]!,
    pruefzeichen: m[5] ? m[5].toLowerCase() : null,
  };
}

/** Parse a whole value (a case field, one cell). Null when it is no Geschäftszahl. */
export function parseGeschaeftszahl(raw: unknown): GeschaeftszahlTeile | null {
  if (typeof raw !== "string") return null;
  const m = FULL_RE.exec(raw);
  return m ? teile(m) : null;
}

export function formatGeschaeftszahl(t: GeschaeftszahlTeile): string {
  return `${t.abteilung} ${t.gattung} ${t.aktenzahl}/${t.jahr}${t.pruefzeichen ?? ""}`;
}

/** Comparison key without the Prüfbuchstabe. */
function stamm(t: GeschaeftszahlTeile): string {
  return `${t.abteilung}${t.gattung.toLowerCase()}${t.aktenzahl}/${t.jahr}`;
}

/** Full key incl. Prüfbuchstabe: "12cg34/25x". */
export function geschaeftszahlKey(t: GeschaeftszahlTeile): string {
  return `${stamm(t)}${t.pruefzeichen ?? ""}`;
}

/** True when both denote the same Geschäftszahl (see the Prüfbuchstabe rule above). */
export function gleicheGeschaeftszahl(a: GeschaeftszahlTeile, b: GeschaeftszahlTeile): boolean {
  if (stamm(a) !== stamm(b)) return false;
  if (a.pruefzeichen && b.pruefzeichen) return a.pruefzeichen === b.pruefzeichen;
  return true;
}

/** Every Geschäftszahl in a text, as whole tokens, in order of appearance. */
export function findeGeschaeftszahlen(text: string): GeschaeftszahlFund[] {
  if (!text) return [];
  const out: GeschaeftszahlFund[] = [];
  for (const m of text.matchAll(SEARCH_RE)) {
    const t = teile(m);
    out.push({ ...t, raw: m[0], index: m.index ?? 0, formatted: formatGeschaeftszahl(t) });
  }
  return out;
}

/**
 * Key for any stored Aktenzahl: the Geschäftszahl key when it is one,
 * otherwise the value without whitespace, lower case. Use it for duplicate
 * checks on case numbers (imports, Massenanlage).
 */
export function caseNumberKey(value: unknown): string {
  if (typeof value !== "string") return "";
  const gz = parseGeschaeftszahl(value);
  if (gz) return geschaeftszahlKey(gz);
  return value.replace(/\s+/g, "").toLowerCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does `text` mention the stored case number `caseNumber`? Geschäftszahlen
 * are compared parsed (tolerant of spacing, case, Prüfbuchstabe rule); any
 * other Aktenzahl must appear as a whole token (whitespace-tolerant), never
 * inside a longer number.
 */
export function textNenntAktenzahl(text: string, caseNumber: unknown): boolean {
  if (typeof caseNumber !== "string" || !caseNumber.trim() || !text) return false;
  const gz = parseGeschaeftszahl(caseNumber);
  if (gz) return findeGeschaeftszahlen(text).some((f) => gleicheGeschaeftszahl(f, gz));
  const compact = caseNumber.replace(/\s+/g, "");
  if (compact.length < 3) return false;
  const pattern = compact
    .split("")
    .map((ch) => escapeRe(ch))
    .join("\\s*");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

export interface AktenzahlZuordnung<T> {
  status: "eindeutig" | "mehrdeutig" | "keine";
  treffer: T[];
}

/**
 * Matters whose case number is named in `text`. "eindeutig" only when exactly
 * one matter matches — several matters with the same number are "mehrdeutig"
 * and must go to a human, never to the first hit.
 */
export function ordneAktenzahlZu<T extends { case_number?: unknown }>(
  text: string,
  cases: readonly T[]
): AktenzahlZuordnung<T> {
  const treffer = cases.filter((c) => textNenntAktenzahl(text, c.case_number));
  if (treffer.length === 1) return { status: "eindeutig", treffer };
  if (treffer.length > 1) return { status: "mehrdeutig", treffer };
  return { status: "keine", treffer };
}
