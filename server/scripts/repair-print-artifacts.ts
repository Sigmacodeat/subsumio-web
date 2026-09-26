#!/usr/bin/env bun
/**
 * Removes the two print-layout artifacts the import gate rejects —
 * body:pdf_pagebreak and body:letterhead (validateBody in
 * normalize/canonical-schema.ts) — from the RAW corpus files of the listed
 * documents. The normal pipeline (normalized-import.ts: mtime-aware
 * normalize → import) then carries the cleaned text into the database.
 *
 * Why not clean-pdf-artifacts.ts: it greps DB credentials out of
 * server/.env, shells out to psql, reads a different defect table
 * (corpus_defects), assumes law-corpus under the cwd, logs to /tmp, and
 * applies broader rewrites (any "Seite X von Y", any doubled capitalised
 * word "GrazGraz" → "Graz") that can touch real text. This script removes
 * only what the gate itself names:
 *
 *   - the RIS page footer "www.ris.bka.gv.at Seite X von Y" (either order),
 *     exactly the pdf_pagebreak pattern — never part of any legal text;
 *   - whole SHORT lines (≤ 160 chars) carrying a letterhead marker
 *     (DVR number, UID ATU…, "P.b.b. Erscheinungsort") — the authority's
 *     print header. A marker inside a long line is left alone and reported
 *     as "manuell": that is running text, not a header.
 *
 * Frontmatter stays byte-identical (the normalizer recomputes content_hash).
 *
 * Usage:
 *   bun scripts/repair-print-artifacts.ts --source law-at-avn --ids <file> --dry-run
 *   bun scripts/repair-print-artifacts.ts --source law-at-avn --ids <file>
 */

import { parseArgs } from "util";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { corpusDirOf, DOC_CLASS_OF_SOURCE } from "./audit-plausibility-full.ts";
import { validateBody } from "./normalize/canonical-schema.ts";
import { indexRawFilesById, readIdList } from "./corpus-id-index.ts";

/** Same pattern as RE_PDF_PAGEBREAK in canonical-schema.ts, global. */
const RIS_PAGE_FOOTER =
  /www\.ris\.bka\.gv\.at\s*Seite \d+ von \d+|Seite \d+ von \d+\s*www\.ris\.bka\.gv\.at/g;
/** Same pattern as RE_LETTERHEAD in canonical-schema.ts. */
const LETTERHEAD_MARKER = /DVR:\s*\d{7}|UID:\s*ATU\d+|P\.b\.b\. Erscheinungsort/;
export const MAX_LETTERHEAD_LINE = 160;

export interface StripResult {
  body: string;
  footers: number;
  letterheadLines: number;
}

/** Pure: removes RIS page footers and short letterhead lines; everything else stays as it was. */
export function stripPrintArtifacts(body: string): StripResult {
  let footers = 0;
  let out = body.replace(RIS_PAGE_FOOTER, (m) => {
    footers++;
    return m.includes("\n") ? "\n" : "";
  });
  let letterheadLines = 0;
  out = out
    .split("\n")
    .filter((line) => {
      if (!LETTERHEAD_MARKER.test(line) || line.trim().length > MAX_LETTERHEAD_LINE) return true;
      letterheadLines++;
      return false;
    })
    .join("\n");
  if (footers > 0 || letterheadLines > 0) {
    // Only tidy what the removal left behind: trailing blanks and blank-line runs.
    out = out.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  }
  return { body: out, footers, letterheadLines };
}

/** Splits a raw corpus file into its untouched frontmatter block and the body. */
export function splitRaw(text: string): { head: string; body: string } {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? { head: m[0], body: text.slice(m[0].length) } : { head: "", body: text };
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      source: { type: "string" },
      ids: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  const source = values.source as string | undefined;
  const idsFile = values.ids as string | undefined;
  if (!source || !DOC_CLASS_OF_SOURCE[source] || !idsFile) {
    console.error("usage: repair-print-artifacts.ts --source <source_id> --ids <file> [--dry-run]");
    process.exit(2);
  }
  const DRY = values["dry-run"] as boolean;
  const docClass = DOC_CLASS_OF_SOURCE[source]!;
  const root = process.env.LAW_CORPUS_ROOT ?? "/law-corpus";
  const dir = join(root, corpusDirOf(source));

  const ids = readIdList(idsFile);
  const index = indexRawFilesById(dir, new Set(ids));
  let cleaned = 0,
    unchanged = 0,
    stillFlagged = 0;
  const manual: string[] = [];

  for (const id of ids) {
    for (const path of index.get(id) ?? []) {
      const text = readFileSync(path, "utf8");
      const { head, body } = splitRaw(text);
      const r = stripPrintArtifacts(body);
      const left = validateBody(r.body, docClass)
        .map((i) => i.code)
        .filter((c) => c === "pdf_pagebreak" || c === "letterhead");
      if (left.length > 0) {
        stillFlagged++;
        if (manual.length < 20) manual.push(`${id} (${left.join(", ")}) ${path}`);
      }
      if (r.body === body) {
        unchanged++;
        continue;
      }
      cleaned++;
      if (!DRY) {
        const tmp = join(
          dirname(path),
          `.print-${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`
        );
        writeFileSync(tmp, head + r.body, "utf8");
        renameSync(tmp, path);
      }
    }
  }

  const noFile = ids.filter((id) => !index.has(id)).length;
  console.log(
    `${DRY ? "TROCKENLAUF — " : ""}${source}: ${ids.length} Nummern, ${noFile} ohne Rohdatei`
  );
  console.log(`  bereinigt:          ${cleaned}`);
  console.log(`  unverändert:        ${unchanged}`);
  console.log(`  danach noch Befund: ${stillFlagged} (manuell prüfen)`);
  for (const m of manual) console.log(`    ${m}`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
