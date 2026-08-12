#!/usr/bin/env bun
/**
 * Corpus Index Builder — baut einen File-Index für alle _normalized/ Korpora.
 *
 * Nutzt OS `find` + batch `stat` (25s für 713K Dateien) statt Node.js
 * `glob.sync()` + `statSync()` (10s pro Korpus, 76s für Overview).
 *
 * Output: law-corpus/_normalized/_index/{corpus}.json
 * Format: [{path, size, mtime}, ...] sortiert nach Pfad
 *
 * Usage:
 *   bun server/scripts/build-corpus-index.ts              # alle Korpora
 *   bun server/scripts/build-corpus-index.ts --corpus at-normen  # nur eines
 *   bun server/scripts/build-corpus-index.ts --watch      # inkrementell via chokidar
 */

import { $ } from "bun";
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";

const NORMALIZED_ROOT = join(process.cwd(), "law-corpus", "_normalized");
const INDEX_DIR = join(NORMALIZED_ROOT, "_index");

const args = process.argv.slice(2);
const corpusArg = args.find((a) => a.startsWith("--corpus="))?.split("=")[1];
const watch = args.includes("--watch");

interface FileEntry {
  path: string;
  size: number;
  mtime: number;
}

/** Baue Index für ein Korpus via OS find + batch stat. */
async function buildCorpusIndex(corpus: string): Promise<FileEntry[]> {
  const corpusDir = join(NORMALIZED_ROOT, corpus);
  if (!existsSync(corpusDir)) return [];

  // OS find + batch stat — viel schneller als glob.sync + statSync
  // macOS stat format: -f '{"size":%z,"mtime":%m,"path":"%N"}'
  // Linux stat format: -c '{"size":%s,"mtime":%Y,"path":"%n"}'
  const isMac = process.platform === "darwin";
  const statFmt = isMac ? "-f" : "-c";
  const statArg = isMac
    ? '{"size":%z,"mtime":%m,"path":"%N"}'
    : '{"size":%s,"mtime":%Y,"path":"%n"}';

  // Use Bun.spawn with array args (no shell parsing issues)
  const proc = Bun.spawn([
    "find", corpusDir, "-type", "f", "-name", "*.md",
    "-exec", "stat", statFmt, statArg, "{}", "+",
  ], { stdout: "pipe", stderr: "pipe" });
  const result = await new Response(proc.stdout).text();

  const entries: FileEntry[] = [];
  for (const line of result.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      // Normalize path to relative
      const relPath = obj.path.replace(/.*law-corpus\/_normalized\//, "");
      entries.push({
        path: relPath,
        size: obj.size,
        mtime: obj.mtime,
      });
    } catch {
      // skip malformed lines
    }
  }

  // Sort by path
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

/** Baue Index für alle Korpora. */
async function buildAll() {
  mkdirSync(INDEX_DIR, { recursive: true });

  const dirs = readdirSync(NORMALIZED_ROOT)
    .filter((d) => d.startsWith("at-") || d === "at")
    .filter((d) => {
      const full = join(NORMALIZED_ROOT, d);
      return statSync(full).isDirectory();
    })
    .sort();

  let totalFiles = 0;
  const startTime = Date.now();

  for (const corpus of dirs) {
    const t0 = Date.now();
    const entries = await buildCorpusIndex(corpus);
    const indexPath = join(INDEX_DIR, `${corpus}.json`);
    writeFileSync(indexPath, JSON.stringify(entries), "utf-8");
    totalFiles += entries.length;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ${corpus}: ${entries.length.toLocaleString("de-AT")} files (${elapsed}s)`);
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone: ${totalFiles.toLocaleString("de-AT")} files in ${totalElapsed}s`);
  console.log(`Index files: ${INDEX_DIR}/`);
}

// ── Main ────────────────────────────────────────────────────────────────

if (corpusArg) {
  // Single corpus
  mkdirSync(INDEX_DIR, { recursive: true });
  const t0 = Date.now();
  buildCorpusIndex(corpusArg).then((entries) => {
    const indexPath = join(INDEX_DIR, `${corpusArg}.json`);
    writeFileSync(indexPath, JSON.stringify(entries), "utf-8");
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`${corpusArg}: ${entries.length.toLocaleString("de-AT")} files (${elapsed}s)`);
  });
} else {
  buildAll();
}

// Watch mode — inkrementelle Updates via chokidar
if (watch) {
  const { watch: chokidarWatch } = await import("chokidar");
  console.log("\nWatching for changes...");

  const watcher = chokidarWatch(`${NORMALIZED_ROOT}/at-*/**/*.md`, {
    ignoreInitial: true,
    persistent: true,
  });

  watcher.on("all", async (event, filePath) => {
    const relPath = filePath.replace(/.*law-corpus\/_normalized\//, "");
    const corpus = relPath.split("/")[0];
    if (!corpus.startsWith("at")) return;

    // Rebuild just this corpus
    const entries = await buildCorpusIndex(corpus);
    const indexPath = join(INDEX_DIR, `${corpus}.json`);
    writeFileSync(indexPath, JSON.stringify(entries), "utf-8");
    console.log(`  [${event}] ${relPath} → rebuilt ${corpus} (${entries.length} files)`);
  });
}
