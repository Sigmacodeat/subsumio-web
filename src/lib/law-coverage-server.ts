/**
 * Server-Teil des Gesetzes-Abgleichs: Quellen-Konfiguration, RIS-Index laden,
 * Nachlade-Stand der Pipeline lesen, DB-Seite → gespeicherte Textdatei.
 *
 * Geteilt von GET /api/admin/corpus-law-coverage (alle Gesetze einer Quelle)
 * und GET /api/admin/corpus-law-coverage/law (ein Gesetz) — beide Routen
 * müssen Soll und Ist exakt gleich bestimmen, sonst zeigt die Detailseite
 * einen anderen Status als die Liste.
 */

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { lawCorpusDir } from "@/lib/corpus-paths";
import type { FetchOutcome } from "@/lib/corpus-sync-inventory";
import { parseRisInforceIndex, type LawFetchState, type RisIndexEntry } from "@/lib/law-coverage";

export interface LawSourceCfg {
  /** Index-Datei unter <corpus>/_state/ — null = kein Upstream-Soll. */
  indexFile: string | null;
  /** Korpus-Name im Abruf-Ledger (ris-fetch-outcomes.jsonl) — null = kein Abruf-Stand. */
  corpus: string | null;
  /** SQL-Ausdruck für den Gesetzes-Key (gnr bzw. Slug-Segment). */
  keyExpr: string;
  /** SQL-Ausdruck für die Dokument-ID je Page (nor bzw. §-Segment). */
  docExpr: string;
  /** Optionaler Titel-Lookup für Quellen ohne abbr/title im Frontmatter. */
  titleLookup?: "gii";
  /**
   * Slug-Präfix → Verzeichnis unter law-corpus/_normalized. Der Import
   * (batch-import-from-disk --slug-from-path) bildet den Pfad unterhalb des
   * Verzeichnisses 1:1 in den Slug ab; hier wird er zurückgerechnet.
   */
  files?: { slugPrefix: string; dir: string };
}

export const LAW_SOURCE_CFG: Record<string, LawSourceCfg> = {
  "law-at-normen": {
    indexFile: "ris-inforce.jsonl",
    corpus: "at-normen",
    keyExpr: "p.frontmatter->>'statute_id'",
    docExpr: "p.frontmatter->>'doc_id'",
    files: { slugPrefix: "legal/statutes/at/", dir: "at-normen" },
  },
  "law-at-landesrecht": {
    indexFile: "ris-inforce-landesrecht.jsonl",
    corpus: "at-landesrecht",
    keyExpr: "p.frontmatter->>'statute_id'",
    docExpr: "p.frontmatter->>'doc_id'",
    files: { slugPrefix: "legal/statutes/at/landesrecht/", dir: "at-landesrecht" },
  },
  "law-de": {
    indexFile: null,
    corpus: null,
    keyExpr: "split_part(p.slug, '/', 4)",
    docExpr: "split_part(p.slug, '/', 5)",
    titleLookup: "gii",
  },
};

const indexCache = new Map<string, { mtimeMs: number; entries: Map<string, RisIndexEntry> }>();
const outcomeCache = new Map<string, { mtimeMs: number; outcomes: Map<string, FetchOutcome> }>();

/** Lädt den RIS-In-force-Index (gecacht bis sich die Datei ändert). */
export async function loadRisIndex(
  file: string
): Promise<{ entries: Map<string, RisIndexEntry>; mtime: string } | null> {
  const path = join(lawCorpusDir(), "_state", file);
  if (!existsSync(path)) return null;
  const mtimeMs = (await stat(path)).mtimeMs;
  const cached = indexCache.get(path);
  if (cached && cached.mtimeMs === mtimeMs) {
    return { entries: cached.entries, mtime: new Date(mtimeMs).toISOString() };
  }
  const entries = parseRisInforceIndex(await readFile(path, "utf-8"));
  indexCache.set(path, { mtimeMs, entries });
  return { entries, mtime: new Date(mtimeMs).toISOString() };
}

/**
 * Abruf-Ergebnisse der Fetcher (ris-fetch-outcomes.jsonl, append-only — die
 * letzte Zeile pro Dokument zählt): welche Index-Dokumente bei RIS keinen
 * Text haben, nicht gefunden wurden oder deren Position eine neuere Fassung
 * abdeckt. Ohne diesen Stand würde die Gesetzesliste Bild-Anlagen dauerhaft
 * als „fehlt" ausweisen. Leere Map = noch keine Messung.
 */
export async function loadFetchOutcomes(corpus: string): Promise<Map<string, FetchOutcome>> {
  const path = join(lawCorpusDir(), "_state", "ris-fetch-outcomes.jsonl");
  const out = new Map<string, FetchOutcome>();
  if (!existsSync(path)) return out;
  const mtimeMs = (await stat(path)).mtimeMs;
  let cached = outcomeCache.get(path);
  if (!cached || cached.mtimeMs !== mtimeMs) {
    const all = new Map<string, FetchOutcome>();
    for (const raw of (await readFile(path, "utf-8")).split("\n")) {
      if (!raw.trim()) continue;
      try {
        const l = JSON.parse(raw) as { corpus?: string; id?: string; outcome?: FetchOutcome };
        if (l.corpus && l.id && l.outcome) all.set(`${l.corpus}|${l.id}`, l.outcome);
      } catch {
        // Kaputte Zeile überspringen — Append-Log darf nie vollständig vertrauenswürdig sein.
      }
    }
    cached = { mtimeMs, outcomes: all };
    outcomeCache.set(path, cached);
  }
  const prefix = `${corpus}|`;
  for (const [k, v] of cached.outcomes) {
    if (k.startsWith(prefix)) out.set(k.slice(prefix.length), v);
  }
  return out;
}

/**
 * Nachlade-Stand: vorgemerkte Gesetze (pipeline_config.law_fetch_queue, siehe
 * refetch-Route) und das Gesetz, das der Pipeline-Schritt „law-fetch" gerade
 * lädt (pipeline_state.pid_cmd trägt `--gnr <nummer>`). Fail-open: ist der
 * Stand nicht lesbar, sagt die Oberfläche nichts statt etwas Falsches.
 */
export async function loadLawFetchState(pool: Pick<Pool, "query">): Promise<LawFetchState> {
  try {
    const [queueRes, stateRes] = await Promise.all([
      pool.query("SELECT value FROM pipeline_config WHERE key = 'law_fetch_queue'"),
      pool.query(
        "SELECT pid, pid_cmd, pid_started_at FROM pipeline_state WHERE source_key = 'law-fetch'"
      ),
    ]);
    const raw = (queueRes.rows[0] as { value?: unknown } | undefined)?.value;
    const list = Array.isArray(raw) ? raw : [];
    const queued = list
      .map((e) => (e && typeof e === "object" ? (e as { gnr?: unknown }).gnr : null))
      .filter((g): g is string => typeof g === "string" && /^\d{4,12}$/.test(g));
    const st = stateRes.rows[0] as
      | {
          pid: number | string | null;
          pid_cmd: string | null;
          pid_started_at: Date | string | null;
        }
      | undefined;
    const running =
      st?.pid && st.pid_cmd ? (/--gnr\s+(\d{4,12})/.exec(st.pid_cmd)?.[1] ?? null) : null;
    return {
      queued,
      running,
      running_since:
        running && st?.pid_started_at ? new Date(st.pid_started_at).toISOString() : null,
      unavailable: false,
    };
  } catch {
    return { queued: [], running: null, running_since: null, unavailable: true };
  }
}

/**
 * DB-Slug → relativer Pfad der normalisierten Textdatei (für den
 * Datei-Betrachter), oder null, wenn die Quelle keine Dateiablage hat bzw.
 * der Slug nicht zum Schema passt. Ob die Datei existiert, prüft der Aufrufer.
 */
export function corpusFileForSlug(source: string, slug: string): string | null {
  const files = LAW_SOURCE_CFG[source]?.files;
  if (!files || !slug.startsWith(files.slugPrefix)) return null;
  const rel = slug.slice(files.slugPrefix.length);
  // Bundesrecht darf nicht in den Landesrecht-Namensraum greifen.
  if (source === "law-at-normen" && rel.startsWith("landesrecht/")) return null;
  if (!rel || rel.includes("..") || rel.startsWith("/")) return null;
  return `${files.dir}/${rel}.md`;
}

/** Landesrecht liegt gemischt: direkt unter at-landesrecht/ und in einem
 *  Ordner je Bundesland (der Slug trägt das Bundesland nicht). */
export const LANDESRECHT_STATE_DIRS = [
  "bgld",
  "ktn",
  "noe",
  "ooe",
  "sbg",
  "stmk",
  "tir",
  "vbg",
  "wien",
] as const;

/**
 * Alle Pfade, unter denen die Textdatei eines Slugs liegen kann — in der
 * Reihenfolge, in der der Aufrufer auf Existenz prüfen soll. Bundesrecht hat
 * genau einen Ort; Landesrecht zusätzlich die Bundesland-Ordner.
 */
export function corpusFileCandidatesForSlug(source: string, slug: string): string[] {
  const flat = corpusFileForSlug(source, slug);
  if (!flat) return [];
  if (source !== "law-at-landesrecht") return [flat];
  const files = LAW_SOURCE_CFG[source]!.files!;
  const rel = slug.slice(files.slugPrefix.length);
  return [flat, ...LANDESRECHT_STATE_DIRS.map((state) => `${files.dir}/${state}/${rel}.md`)];
}
