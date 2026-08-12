/**
 * v0.29.1 — Compute a page's effective_date from frontmatter precedence.
 *
 * The "effective date" is the answer to "when was this page about?" It's
 * NOT updated_at (which churns from auto-link) and NOT created_at (which
 * is the row insert time). It's the user's stated content date.
 *
 * Precedence chain (default order):
 *   1. frontmatter.event_date    — meeting / event pages
 *   2. frontmatter.date          — dated essays
 *   3. frontmatter.published     — writing/
 *   4. filename-date             — leading YYYY-MM-DD in basename
 *   5. updated_at                — fallback
 *   6. created_at                — last resort (only if updated_at NULL)
 *
 * Per-prefix override: for `daily/` and `meetings/` slug prefixes, the
 * filename-date jumps to position 1 — the filename is the user's primary
 * signal there ("daily/2024-03-15.md" the FILE date matters more than any
 * frontmatter the user pasted).
 *
 * Returns BOTH the parsed Date and the source label so the doctor's
 * `effective_date_health` check can detect "fell back to updated_at" rows
 * that look populated but are functionally equivalent to a NULL.
 *
 * Range validation: parsed value must be in [1800-01-01, NOW + 1 year].
 * Out-of-range values are dropped (the chain falls through to the next
 * element). NaN / unparseable strings drop the same way. The lower bound
 * is 1800 (not 1990) because Austrian statutes like the ABGB date from
 * 1812-01-01 — a pre-1990 date that is a legitimate enactment date, not
 * a corrupt value.
 *
 * Pure function. No DB. Tested in test/effective-date.test.ts.
 */

import type { EffectiveDateSource } from "./types.ts";

export interface EffectiveDateResult {
  date: Date | null;
  source: EffectiveDateSource | null;
}

export interface ComputeEffectiveDateOpts {
  slug: string;
  frontmatter: Record<string, unknown>;
  /** Basename without extension, e.g. "2024-03-15-acme-call". May be null/empty. */
  filename?: string | null;
  updatedAt: Date;
  createdAt: Date;
}

/**
 * Slug prefixes where the filename date wins over frontmatter dates. The
 * user's primary signal in these directories is the filename, not arbitrary
 * frontmatter the importer might have copied.
 *
 * Hardcoded in v0.29.1 (commit 2). v0.29.1 commit 5 introduces the
 * recency-decay map; we could move this list there if we wanted user-tunable
 * filename-first prefixes, but the daily/ + meetings/ defaults are stable
 * enough that hardcoding is correct.
 */
const FILENAME_FIRST_PREFIXES = ["daily/", "meetings/"];

const MIN_DATE_MS = Date.UTC(1800, 0, 1);
const FILENAME_DATE_RE = /^(\d{4}-\d{2}-\d{2})/;
// ECLI formats (AT Judikatur):
//   ecli-at-<court>[-<NUM>]-<YEAR>-r<suffix><NUM>  (OGH, AsylGH, OLG, LG, VwGH)
//   ecli-at-lvwg<state>-<YEAR>-lvwg-...             (LVwG — year after state code)
//   ecli-at-vfgh-<YEAR>-<letter><NUM>-<YEAR2>[-<N>]  (VfGH — year at end)
// The broad pattern catches the year after the court code for any ECLI variant.
const ECLI_DATE_RE = /(?:^ecli-at-[a-z]+[0-9]*-(\d{4})-)/i;
const ECLI_VFGH_DATE_RE = /(?:^ecli-at-vfgh-\d{4}-[a-z][a-z0-9]*-(\d{4})(?:-\d+)?$)/i;
const ECLI_TRAILING_YEAR_RE = /(?:^ecli-at-[a-z]+[a-z0-9-]*-(\d{4})$)/i;

function maxDateMs(): number {
  // NOW + 1 year, computed at call time so tests with a mocked Date.now()
  // see a moving boundary. Pages dated > 1 year in the future are almost
  // always corrupt (epoch math gone wrong, typoed century, bad parse).
  return Date.now() + 365 * 24 * 60 * 60 * 1000;
}

/** Parse a frontmatter value as a Date. Accepts Date instances, ISO strings, YYYY-MM-DD. Returns null on any failure. */
export function parseDateLoose(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const ms = Date.parse(trimmed);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms);
  }
  if (typeof value === "number") {
    // Plausibility: numbers are usually ms since epoch but YAML can yield
    // bare integers (year? month? day?) — accept only if the resulting Date
    // falls inside the valid window. validateInRange catches the rest.
    return Number.isFinite(value) ? new Date(value) : null;
  }
  return null;
}

function validateInRange(d: Date | null): Date | null {
  if (d === null) return null;
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms < MIN_DATE_MS) return null;
  if (ms > maxDateMs()) return null;
  return d;
}

function extractFilenameDate(filename: string | null | undefined): Date | null {
  if (!filename) return null;
  // Standard format: YYYY-MM-DD at start of filename
  const m = filename.match(FILENAME_DATE_RE);
  if (m) {
    const d = validateInRange(parseDateLoose(m[1]));
    if (d) return d;
  }
  // ECLI format (most courts): ecli-at-<court>[-<NUM>]-<YEAR>-r<suffix>
  // e.g. ecli-at-ogh0002-2014-rs0129459 → 2014-01-01 (year precision only)
  const ecliMatch = filename.match(ECLI_DATE_RE);
  if (ecliMatch) {
    const year = parseInt(ecliMatch[1], 10);
    if (year >= 1900 && year <= new Date().getFullYear() + 1) {
      return validateInRange(new Date(Date.UTC(year, 0, 1)));
    }
  }
  // ECLI VfGH format: ecli-at-vfgh-<YEAR>-<letter><NUM>-<YEAR2>[-<N>]
  // e.g. ecli-at-vfgh-1988-b695-1988 → 1988-01-01
  const vfgMatch = filename.match(ECLI_VFGH_DATE_RE);
  if (vfgMatch) {
    const year = parseInt(vfgMatch[1], 10);
    if (year >= 1900 && year <= new Date().getFullYear() + 1) {
      return validateInRange(new Date(Date.UTC(year, 0, 1)));
    }
  }
  // ECLI trailing year: ecli-at-<court>-...-<YEAR>
  // e.g. ecli-at-asylgh-a2-430475-1-2012 → 2012-01-01
  const ecliTrailingMatch = filename.match(ECLI_TRAILING_YEAR_RE);
  if (ecliTrailingMatch) {
    const year = parseInt(ecliTrailingMatch[1], 10);
    if (year >= 1900 && year <= new Date().getFullYear() + 1) {
      return validateInRange(new Date(Date.UTC(year, 0, 1)));
    }
  }
  // Trailing date: ...-YYYY-MM-DD or ...-YYYY-MM-DD-N
  const trailingMatch = filename.match(/(\d{4}-\d{2}-\d{2})(?:-\d+)?$/);
  if (trailingMatch) {
    const d = validateInRange(parseDateLoose(trailingMatch[1]));
    if (d) return d;
  }
  return null;
}

function hasFilenameFirstPrefix(slug: string): boolean {
  for (const p of FILENAME_FIRST_PREFIXES) {
    if (slug.startsWith(p)) return true;
  }
  return false;
}

/**
 * Run the precedence chain. Returns the first valid (in-range) date and its
 * source label. Falls all the way through to updated_at / created_at as
 * 'fallback' when nothing in frontmatter or filename parses.
 */
export function computeEffectiveDate(opts: ComputeEffectiveDateOpts): EffectiveDateResult {
  const { slug, frontmatter, filename, updatedAt, createdAt } = opts;
  const filenameFirst = hasFilenameFirstPrefix(slug);

  const fmEvent = validateInRange(parseDateLoose(frontmatter.event_date));
  const fmDate = validateInRange(parseDateLoose(frontmatter.date));
  const fmPublished = validateInRange(parseDateLoose(frontmatter.published));
  // RIS XML norm files carry `inkrafttretensdatum` (e.g. "2017-01-01") as
  // the official date the norm came into force. Without this, effective_date
  // falls back to updated_at (the import timestamp), which distorts recency
  // boost and date filters for all 48k+ AT norms.
  const fmInkraft = validateInRange(parseDateLoose(frontmatter.inkrafttretensdatum));
  const filenameDate = extractFilenameDate(filename);

  // Build the ordered candidate list. For filename-first prefixes
  // (daily/, meetings/) the filename moves to the head of the chain.
  const candidates: Array<{ date: Date | null; source: EffectiveDateSource }> = filenameFirst
    ? [
        { date: filenameDate, source: "filename" },
        { date: fmEvent, source: "event_date" },
        { date: fmDate, source: "date" },
        { date: fmPublished, source: "published" },
        { date: fmInkraft, source: "event_date" },
      ]
    : [
        { date: fmEvent, source: "event_date" },
        { date: fmDate, source: "date" },
        { date: fmPublished, source: "published" },
        { date: fmInkraft, source: "event_date" },
        { date: filenameDate, source: "filename" },
      ];

  for (const c of candidates) {
    if (c.date !== null) return { date: c.date, source: c.source };
  }

  // Fallback chain: updated_at, then created_at. Both are guaranteed
  // non-null by the schema; the validation here is defensive against bad
  // test fixtures.
  const upd = validateInRange(updatedAt);
  if (upd !== null) return { date: upd, source: "fallback" };
  const cre = validateInRange(createdAt);
  if (cre !== null) return { date: cre, source: "fallback" };

  return { date: null, source: null };
}
