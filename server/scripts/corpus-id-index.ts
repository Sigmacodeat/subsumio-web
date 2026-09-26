/**
 * Which raw corpus files belong to which RIS document number.
 *
 * Targeted repairs (refetch by id list, print-artifact cleanup) must write
 * to the file that already carries the document — never beside it. The
 * normalizer picks ONE file per doc_id by text quality (selectWinners in
 * normalize/normalize-corpus.ts), not by recency: a fresh copy written to a
 * second path can lose against the old one and the database keeps the old
 * text. That is exactly what happens to repair-known-bad-generation.ts,
 * which writes Landesrecht to `<land>/gnr-<land>-<nr>/` while the fetcher
 * wrote `<land>/gnr-<nr>/`.
 *
 * The doc_id is derived with the normalizer's own rule (mapToCanonical), so
 * "same document" means the same thing here as in the import gate.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mapToCanonical, parseRaw } from "./normalize/normalize-corpus.ts";

/** One id per line; blank lines and `#` comments are ignored, duplicates dropped, order kept. */
export function parseIdList(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const id = line.trim();
    if (!id || id.startsWith("#")) continue;
    seen.add(id);
  }
  return [...seen];
}

export function readIdList(path: string): string[] {
  return parseIdList(readFileSync(path, "utf8"));
}

/** The doc_id the normalizer would give this raw file, or null. */
export function docIdOfRawText(text: string): string | null {
  const raw = parseRaw(text);
  if (Object.keys(raw.fm).length === 0) return null;
  const id = mapToCanonical(raw, "").doc_id;
  return id || null;
}

/** `retrieved_at` of a raw file's frontmatter (quotes stripped), or null. */
export function retrievedAtOfRawText(text: string): string | null {
  const v = parseRaw(text).fm["retrieved_at"];
  if (!v) return null;
  const s = v.trim().replace(/^["']|["']$/g, "");
  return s ? s.slice(0, 10) : null;
}

/** Markdown files under `dir`, skipping `_state`-style and dot entries (same rule as the normalizer's walk). */
function walkMarkdown(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("_") || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkMarkdown(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

/**
 * doc_id → every raw file under `dir` that carries it, restricted to `wanted`.
 * Several paths for one id are real (older layouts, earlier repairs); callers
 * overwrite all of them so whichever the normalizer picks is the fresh text.
 */
export function indexRawFilesById(dir: string, wanted: Set<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!existsSync(dir) || wanted.size === 0) return out;
  for (const path of walkMarkdown(dir)) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const id = docIdOfRawText(text);
    if (!id || !wanted.has(id)) continue;
    const list = out.get(id);
    if (list) list.push(path);
    else out.set(id, [path]);
  }
  for (const list of out.values()) list.sort();
  return out;
}

/**
 * Resume rule for an id-list run: an id is done when it has at least one raw
 * file and every one of them was retrieved on or after `since` (YYYY-MM-DD).
 */
export function alreadyRefetched(retrievedAts: (string | null)[], since: string): boolean {
  return retrievedAts.length > 0 && retrievedAts.every((d) => d !== null && d >= since);
}
