#!/usr/bin/env bun
/**
 * Ergänzt `content_hash` in den XML-Normdateien unter law-corpus/at-normen/.
 *
 * batch-import-from-disk.ts verwirft Dateien ohne content_hash als
 * Qualitätsfehler (Integritätsprüfung, Zeile ~397). ris-xml-fetch-normen.ts
 * schrieb den Hash anfangs nicht — dieser Backfill zieht ihn für die bereits
 * geholten Dateien nach, ohne RIS erneut anzufragen.
 *
 * Gleiches Verfahren wie backfill-utils.ts:contentHash — SHA-256 über den
 * getrimmten Body, auf 16 Zeichen gekürzt.
 *
 *   bun run server/scripts/backfill-normen-content-hash.ts          # Probelauf
 *   bun run server/scripts/backfill-normen-content-hash.ts --apply
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const APPLY = process.argv.includes("--apply");
const dirArg = process.argv.indexOf("--dir");
const ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");
const DIR = dirArg > -1 ? process.argv[dirArg + 1] : join(ROOT, "at-normen");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function main() {
  if (!existsSync(DIR)) {
    console.error(`Verzeichnis fehlt: ${DIR}`);
    process.exit(1);
  }
  console.log(APPLY ? `ERGÄNZUNG (--apply) — ${DIR}\n` : `PROBELAUF — ${DIR}, es wird nichts geschrieben.\n`);

  const files = walk(DIR);
  let hatte = 0;
  let ergaenzt = 0;
  let unlesbar = 0;

  for (const p of files) {
    const raw = readFileSync(p, "utf-8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) {
      unlesbar++;
      continue;
    }
    if (/^content_hash:/m.test(m[1])) {
      hatte++;
      continue;
    }
    const hash = createHash("sha256").update(m[2].trim()).digest("hex").slice(0, 16);
    if (APPLY) writeFileSync(p, `---\n${m[1]}\ncontent_hash: "${hash}"\n---\n${m[2]}`);
    ergaenzt++;
  }

  console.log(`  ${files.length} Dateien geprüft`);
  console.log(`  ${hatte} hatten bereits einen content_hash`);
  console.log(`  ${ergaenzt} ${APPLY ? "ergänzt" : "zu ergänzen"}`);
  if (unlesbar > 0) console.log(`  ${unlesbar} mit unlesbarem Frontmatter — unangetastet`);
  if (!APPLY && ergaenzt > 0) console.log("\n  Mit --apply ausführen.");
}

main();
