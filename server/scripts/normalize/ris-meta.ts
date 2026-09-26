/**
 * Statute metadata against the RIS in-force index — one rule for the
 * normalizer (which fills and corrects) and for corpus-sync-inventory.ts
 * (which proves). Both must agree, or the page would call a document wrong
 * that the normalizer considers right.
 *
 * WHY THE INDEX: `_state/ris-inforce*.jsonl` (ris-inforce-crawl*.ts) is the
 * RIS API's own metadata for every norm in force — Kurztitel, Abkürzung,
 * Kundmachungsorgan, In- and Außerkrafttreten, Bundesland. Measured on
 * 2026-09-26 against the database: of 147,787 federal and 97,234 state norms
 * in force, the Kurztitel was missing for 64,060 and 95,881, the Abkürzung
 * for 113 and 47,179, the end of validity for 23 and 1,136; 292
 * Kundmachungsorgane carried a stray "Undefined". The raw files had most of
 * it (`statute:` is the Kurztitel in 98 % of cases) — the normalizer did not
 * read it, and the state-law fetcher never stored Abkürzung and end date.
 *
 * THE RULE, per field:
 *   - index empty           → ours stays (the index says nothing)
 *   - ours empty            → index value
 *   - equal after spelling  → ours stays ("LGBl. Nr. 03/1983" = "… 3/1983",
 *                             "BGBl.Nr." = "BGBl. Nr." — 718 such cases)
 *   - Kurztitel = index + a document suffix ("ÜR", "ÜR 2012", "EG/EU", "EG",
 *     "EU", "A", "S", "BVG") → ours stays: the RIS document itself carries it
 *     (checked 2026-09-26: 58 archived XMLs with ÜR, and one live RIS XML each
 *     for EG/EU, EG, A, S, BVG — all equal to ours); the index names the law
 *     without it
 *   - different             → index value. For the fields that change over a
 *     norm's life (Kundmachungsorgan, In-/Außerkrafttreten) our value stays
 *     when our copy was fetched after the index was crawled — it is the newer
 *     RIS state (e.g. "aufgehoben durch LGBl.Nr. 84/2025"). A cut-off
 *     Kurztitel does not become right by being newer (375 of 375 archived
 *     XMLs agree with the index there).
 *
 * Only metadata. The norm text is never touched here.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const INDEX_FILES = {
  "at-normen": "ris-inforce.jsonl",
  "at-landesrecht": "ris-inforce-landesrecht.jsonl",
} as const;

/** The fields the index is authoritative for, in canonical names. */
export const META_FIELDS = [
  "short_title",
  "abbr",
  "promulgation_organ",
  "in_force_from",
  "in_force_to",
  "region",
  "paragraph_ref",
] as const;
export type MetaField = (typeof META_FIELDS)[number];
export type MetaValues = Record<MetaField, string | null>;

/** German names for reports and the ops page. */
export const META_FIELD_LABELS: Record<MetaField, string> = {
  short_title: "Kurztitel",
  abbr: "Abkürzung",
  promulgation_organ: "Kundmachungsorgan",
  in_force_from: "Inkrafttreten",
  in_force_to: "Außerkrafttreten",
  region: "Bundesland",
  paragraph_ref: "Paragraph",
};

export interface RisIndexMeta {
  values: MetaValues;
}

export interface RisMetaIndex {
  byDoc: Map<string, RisIndexMeta>;
  /** Crawl time of the index file (mtime), ISO date; null when unknown. */
  indexDate: string | null;
}

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  return s || null;
};

/** One index line → canonical metadata values. Pure. */
export function indexLineMeta(d: Record<string, unknown>): MetaValues {
  return {
    short_title: str(d.kurztitel),
    abbr: str(d.abk),
    promulgation_organ: str(d.kundmachungsorgan),
    in_force_from: str(d.inkraft),
    in_force_to: str(d.ausserkraft),
    region: str(d.region),
    paragraph_ref: str(d.apa),
  };
}

/** Parses index JSONL; § 0 cover sheets are skipped (no norm text). */
export function parseRisMetaIndex(jsonl: string): Map<string, RisIndexMeta> {
  const out = new Map<string, RisIndexMeta>();
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const nor = str(d.nor) ?? str(d.id);
    if (!nor || d.apa === "§ 0") continue;
    out.set(nor, { values: indexLineMeta(d) });
  }
  return out;
}

/** Loads the index of a corpus from `<stateDir>`; null when the corpus has none or it is missing. */
export function loadRisMetaIndex(stateDir: string, corpus: string): RisMetaIndex | null {
  const file = (INDEX_FILES as Record<string, string>)[corpus];
  if (!file) return null;
  const path = join(stateDir, file);
  if (!existsSync(path)) return null;
  return {
    byDoc: parseRisMetaIndex(readFileSync(path, "utf8")),
    indexDate: new Date(statSync(path).mtimeMs).toISOString().slice(0, 10),
  };
}

/** Spelling-only differences RIS itself is inconsistent about. */
export function spelling(field: MetaField, v: string): string {
  let s = v.replace(/\s+/g, " ").trim();
  if (field === "promulgation_organ") {
    s = s
      .replace(/\s+Undefined$/, "")
      .replace(/\b(BGBl|LGBl)\.\s*Nr\./g, "$1. Nr.")
      .replace(/(^|[^\d.])0+(\d)/g, "$1$2");
  }
  return s;
}

/** A stray "Undefined" is a fetcher bug (JS undefined), never RIS content. */
export function cleanOrgan(v: string | null): string | null {
  if (!v) return v;
  const s = v.replace(/\s+Undefined$/, "").trim();
  return s || null;
}

/** Suffixes the RIS document adds to the law's Kurztitel. */
const KURZTITEL_SUFFIX = /^(ÜR( .+)?|EG\/EU|EG|EU|A|S|BVG)$/;

/** Fields whose RIS value changes over a norm's life. */
const TIME_FIELDS: ReadonlySet<MetaField> = new Set([
  "promulgation_organ",
  "in_force_from",
  "in_force_to",
]);

/** true when our copy was fetched after the index was crawled. */
function oursIsNewer(retrievedAt: string | null, indexDate: string | null): boolean {
  return !!retrievedAt && !!indexDate && retrievedAt > indexDate;
}

/**
 * Fields where our value is missing or wrong by the rule above — what the
 * proof counts as "Metadaten weichen vom RIS ab".
 */
export function metaDiffs(
  ours: Partial<MetaValues>,
  index: MetaValues,
  retrievedAt: string | null,
  indexDate: string | null
): MetaField[] {
  const out: MetaField[] = [];
  for (const f of META_FIELDS) {
    const iv = index[f];
    if (!iv) continue;
    const ov = str(ours[f] ?? null);
    if (!ov) {
      out.push(f);
      continue;
    }
    if (spelling(f, ov) === spelling(f, iv)) {
      // "… Undefined" is equal in spelling but still garbage in our copy.
      if (f === "promulgation_organ" && /\sUndefined$/.test(ov)) out.push(f);
      continue;
    }
    if (
      f === "short_title" &&
      ov.startsWith(`${iv} `) &&
      KURZTITEL_SUFFIX.test(ov.slice(iv.length + 1))
    )
      continue;
    if (TIME_FIELDS.has(f) && oursIsNewer(retrievedAt, indexDate)) continue;
    out.push(f);
  }
  return out;
}

/** Our values corrected by the rule above — what the normalizer writes. */
export function reconcileMeta(
  ours: MetaValues,
  index: MetaValues,
  retrievedAt: string | null,
  indexDate: string | null
): MetaValues {
  const out = { ...ours };
  for (const f of metaDiffs(ours, index, retrievedAt, indexDate)) {
    out[f] = f === "promulgation_organ" && str(ours[f]) ? cleanOrgan(ours[f]) : index[f];
    // Only garbage removed and still equal in spelling: keep the cleaned value.
    if (f === "promulgation_organ" && out[f] && spelling(f, out[f]!) !== spelling(f, index[f]!))
      out[f] = index[f];
  }
  return out;
}
