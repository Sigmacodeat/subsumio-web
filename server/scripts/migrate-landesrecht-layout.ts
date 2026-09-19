#!/usr/bin/env bun
/**
 * One-off: moves state-law files from gnr-<nr>/ into <state>/gnr-<nr>/.
 *
 * The states number their laws independently, so gnr-10000001/p-1.md held
 * whichever state's § 1 was written last. fetch-at-landesrecht-xml.ts now
 * writes <state>/gnr-<nr>/; this moves what is already on disk (raw and
 * _normalized) so both layouts do not coexist. Files are moved, never
 * deleted; the state comes from the RIS document number (LTI… → tir).
 * Files whose doc_id carries no state (older HTML generations) stay put.
 *
 *   bun scripts/migrate-landesrecht-layout.ts            # report
 *   bun scripts/migrate-landesrecht-layout.ts --apply    # move
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync } from "fs";
import { join } from "path";
import { landOfDocId } from "./normalize/normalize-corpus";

const ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");
const APPLY = process.argv.includes("--apply");

export function docIdOf(content: string): string | null {
  return content.slice(0, 1500).match(/^doc_id:\s*["']?([^"'\s]+)/m)?.[1] ?? null;
}

function migrate(base: string): { moved: number; kept: number; conflicts: number } {
  const out = { moved: 0, kept: 0, conflicts: 0 };
  if (!existsSync(base)) return out;
  for (const dir of readdirSync(base, { withFileTypes: true })) {
    if (!dir.isDirectory() || !/^(gnr-|no-gn$)/.test(dir.name)) continue;
    const from = join(base, dir.name);
    for (const f of readdirSync(from)) {
      if (!f.endsWith(".md")) continue;
      const src = join(from, f);
      const land = landOfDocId(docIdOf(readFileSync(src, "utf8")));
      if (!land) {
        out.kept++;
        continue;
      }
      const dest = join(base, land, dir.name, f);
      if (existsSync(dest)) {
        out.conflicts++;
        continue;
      }
      if (APPLY) {
        mkdirSync(join(base, land, dir.name), { recursive: true });
        renameSync(src, dest);
      }
      out.moved++;
    }
    if (APPLY && readdirSync(from).length === 0) rmdirSync(from);
  }
  return out;
}

if (import.meta.main) {
  for (const base of [join(ROOT, "at-landesrecht"), join(ROOT, "_normalized", "at-landesrecht")]) {
    const r = migrate(base);
    console.log(
      `${base}: ${r.moved} ${APPLY ? "verschoben" : "zu verschieben"}, ${r.kept} ohne Bundesland belassen, ${r.conflicts} Ziel existiert schon`
    );
  }
}
