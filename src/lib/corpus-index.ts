/**
 * Corpus Index — Memory-Cache für File-Index.
 *
 * Lädt Index-Dateien aus law-corpus/_normalized/_index/{corpus}.json
 * und hält sie im Memory. Kein glob.sync + statSync mehr pro Request.
 *
 * Performance: 76s → <50ms (Overview), 12s → <5ms (List)
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync,
} from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const NORMALIZED_ROOT = join(REPO_ROOT, "law-corpus", "_normalized");
const INDEX_DIR = join(NORMALIZED_ROOT, "_index");

export interface IndexedFile {
  path: string;
  size: number;
  mtime: number;
}

// ── Memory Cache ────────────────────────────────────────────────────────

const cache = new Map<string, IndexedFile[]>();
let allCorporaCache: string[] | null = null;

/** Lädt alle Korpus-Namen (at-*, de-*, ch-*, eu-* Ordner). */
export function listCorpusNames(): string[] {
  if (allCorporaCache) return allCorporaCache;
  if (!existsSync(NORMALIZED_ROOT)) {
    allCorporaCache = [];
    return [];
  }
  allCorporaCache = readdirSync(NORMALIZED_ROOT)
    .filter(
      (d) =>
        d.startsWith("at-") ||
        d === "at" ||
        d.startsWith("de") ||
        d.startsWith("ch") ||
        d.startsWith("eu")
    )
    .filter((d) => {
      try {
        return statSync(join(NORMALIZED_ROOT, d)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
  return allCorporaCache;
}

/** Lädt Index für ein Korpus (mit Memory-Cache). */
export function getCorpusIndex(corpus: string): IndexedFile[] {
  if (cache.has(corpus)) return cache.get(corpus)!;

  const indexPath = join(INDEX_DIR, `${corpus}.json`);
  if (!existsSync(indexPath)) {
    // Index noch nicht gebaut → leeres Array
    // (API-Route kann entscheiden, ob sie einen Build triggert)
    cache.set(corpus, []);
    return [];
  }

  try {
    const raw = readFileSync(indexPath, "utf-8");
    const entries = JSON.parse(raw) as IndexedFile[];
    cache.set(corpus, entries);
    return entries;
  } catch {
    cache.set(corpus, []);
    return [];
  }
}

/**
 * Aktualisiert einen einzelnen Eintrag im Index (Disk + Memory).
 * Wird nach Write/Create aufgerufen.
 */
export function updateIndexEntry(corpus: string, entry: IndexedFile): void {
  const entries = getCorpusIndex(corpus);
  const idx = entries.findIndex((e) => e.path === entry.path);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
    entries.sort((a, b) => a.path.localeCompare(b.path));
  }
  persistIndex(corpus, entries);
}

/**
 * Entfernt einen Eintrag aus dem Index (Disk + Memory).
 * Wird nach Delete aufgerufen.
 */
export function removeIndexEntry(corpus: string, path: string): void {
  const entries = getCorpusIndex(corpus).filter((e) => e.path !== path);
  persistIndex(corpus, entries);
}

/** Schreibt den Index auf Disk und aktualisiert den Memory-Cache. */
function persistIndex(corpus: string, entries: IndexedFile[]): void {
  const indexPath = join(INDEX_DIR, `${corpus}.json`);
  // BUG 58: atomic write (tmp + fsync + rename) — Index-Dateien können
  // mehrere MB groß sein (148K Dateien × JSON). Nicht-atomarer Write
  // kann bei Abbruch zu korruptem Index führen.
  const tmp = `${indexPath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(entries), "utf-8");
  try {
    const fd = openSync(tmp, "r+");
    try {
      fsyncSync(fd);
    } catch {
      /* fsync nicht verfügbar */
    }
    closeSync(fd);
  } catch {
    /* ignore */
  }
  renameSync(tmp, indexPath);
  cache.set(corpus, entries);
}

/** Invalidiert gesamten Cache. */
export function clearCache(): void {
  cache.clear();
  allCorporaCache = null;
}

/** Prüft ob ein Index existiert (für Auto-Build-Decision). */
export function hasIndex(corpus: string): boolean {
  return existsSync(join(INDEX_DIR, `${corpus}.json`));
}

/** Prüft ob Index veraltet ist (älter als 1 Stunde). */
export function isIndexStale(corpus: string): boolean {
  const indexPath = join(INDEX_DIR, `${corpus}.json`);
  if (!existsSync(indexPath)) return true;
  try {
    const stat = statSync(indexPath);
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs > 60 * 60 * 1000; // 1 Stunde
  } catch {
    return true;
  }
}

// ── Path Validation (re-exportiert aus corpus-steward.ts für Backward-Compat) ─

export { safeCorpusPath } from "@/lib/corpus-steward";
