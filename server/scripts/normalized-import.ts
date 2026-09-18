#!/usr/bin/env bun
/**
 * Normalize, then import — the only way corpus files reach the database.
 *
 *   bun scripts/normalized-import.ts --corpus at-judikatur-bvwg -- \
 *     scripts/import-judikatur.ts --source bvwg --no-embed --from-normalized
 *
 * 1. Every raw file whose canonical copy under _normalized/<corpus> is missing
 *    or older is run through normalize-corpus.ts (same rules, same validator,
 *    duplicate selection over the whole corpus).
 * 2. The import command runs; it must read from _normalized/<corpus>.
 *
 * Raw files the validator rejects stay out of the database until a refetch
 * fixes them — that is the point of the gate.
 */

import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("_") || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

/** Raw files with no canonical copy yet, or changed since it was written. */
export function staleRawFiles(raw: string, norm: string): string[] {
  if (!existsSync(raw)) return [];
  return walk(raw).filter((f) => {
    const target = join(norm, f.slice(raw.length + 1));
    if (!existsSync(target)) return true;
    return statSync(f).mtimeMs > statSync(target).mtimeMs;
  });
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf("--");
  const own = sep >= 0 ? argv.slice(0, sep) : argv;
  const importCmd = sep >= 0 ? argv.slice(sep + 1) : [];
  const corpus = own[own.indexOf("--corpus") + 1];
  if (own.indexOf("--corpus") < 0 || !corpus || importCmd.length === 0) {
    console.error("usage: normalized-import.ts --corpus <dir> -- <import script> [args…]");
    process.exit(2);
  }
  const root = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");
  const rawDir = join(root, corpus);
  const normDir = join(root, "_normalized", corpus);

  const stale = staleRawFiles(rawDir, normDir);
  console.log(`[normalized-import] ${corpus}: ${stale.length} Rohdateien neu oder geändert`);
  if (stale.length > 0) {
    const list = join(mkdtempSync(join(tmpdir(), "norm-")), "files.txt");
    writeFileSync(list, stale.join("\n"));
    const n = spawnSync(
      "bun",
      [
        join(import.meta.dir, "normalize", "normalize-corpus.ts"),
        "--corpus",
        corpus,
        "--file-list",
        list,
      ],
      { stdio: "inherit", env: { ...process.env, LAW_CORPUS_ROOT: root } }
    );
    if (n.status !== 0) {
      console.error(
        `[normalized-import] Normalisierung fehlgeschlagen (exit ${n.status}) — kein Import.`
      );
      process.exit(n.status ?? 1);
    }
  }
  const r = spawnSync("bun", importCmd, { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
