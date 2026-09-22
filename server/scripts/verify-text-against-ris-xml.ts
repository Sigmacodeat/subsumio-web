#!/usr/bin/env bun
/**
 * Compares the norm text in the database, word for word, with the RIS XML it
 * was made from.
 *
 * Counting documents and comparing metadata says a norm is present and
 * labelled right; it does not say the text is the text RIS published. The
 * fetchers keep the original XML (`_xml/<corpus>/gnr-…/<docnr>.xml`), so for
 * every document that has one the question can be answered exactly and
 * without a single RIS request: take the words between the "Text" heading and
 * the next metadata block in the XML, and check that the page in the database
 * carries them.
 *
 * Coverage is the share of the XML's words found in the page (as a multiset,
 * so a paragraph that went missing counts even if its words occur elsewhere).
 * A faithful conversion sits at ~1.0; tables and footnote markers cost a
 * little; a lost paragraph or a wrong document shows up far below.
 *
 * Usage:
 *   bun run scripts/verify-text-against-ris-xml.ts --corpus at-landesrecht
 *   bun run scripts/verify-text-against-ris-xml.ts --corpus at-normen --threshold 0.97
 */

import { parseArgs } from "util";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    corpus: { type: "string", default: "at-landesrecht" },
    root: { type: "string", default: "/law-corpus/_xml" },
    threshold: { type: "string", default: "0.97" },
    limit: { type: "string" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(
    "Usage: verify-text-against-ris-xml.ts [--corpus at-landesrecht|at-normen] [--threshold 0.97] [--limit N]"
  );
  process.exit(0);
}

process.env.GBRAIN_STATEMENT_TIMEOUT = "15min";
const THRESHOLD = Number(values.threshold);
const LIMIT = values.limit ? Number(values.limit) : Infinity;

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  disconnect(): Promise<void>;
  connect(cfg: unknown): Promise<void>;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
};

/** The words of a text, lower-cased, punctuation and markup characters dropped. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[   ]/g, " ")
    .replace(/[^\p{L}\p{N}§]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 0);
}

/**
 * The norm text of a RIS document: what stands between the "Text" heading and
 * the next metadata heading. Page headers and footers ("www.ris.bka.gv.at
 * Seite 1 von 3") are layout, not law, and are cut first.
 */
export function risBodyText(xml: string): string | null {
  const noChrome = xml.replace(/<(kzinhalt|fzinhalt)\b[\s\S]*?<\/\1>/g, " ");
  const start = noChrome.search(/<ueberschrift typ="titel"[^>]*>\s*Text\s*<\/ueberschrift>/);
  if (start < 0) return null;
  const after = noChrome.slice(start).replace(/^<ueberschrift[^>]*>[\s\S]*?<\/ueberschrift>/, "");
  const end = after.search(/<ueberschrift typ="titel"/);
  const body = end >= 0 ? after.slice(0, end) : after;
  return body
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m) => ENTITIES[m] ?? " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** Share of `expected`'s words present in `actual`, counted as a multiset. */
export function coverage(expected: string[], actual: string[]): number {
  if (expected.length === 0) return 1;
  const have = new Map<string, number>();
  for (const w of actual) have.set(w, (have.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of expected) {
    const c = have.get(w) ?? 0;
    if (c > 0) {
      hit++;
      have.set(w, c - 1);
    }
  }
  return hit / expected.length;
}

function* xmlFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* xmlFiles(p);
    else if (entry.name.endsWith(".xml")) yield p;
  }
}

async function main() {
  const dir = join(values.root as string, values.corpus as string);
  if (!existsSync(dir)) {
    console.error(`Verzeichnis fehlt: ${dir}`);
    process.exit(1);
  }
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  const files: Array<{ docId: string; path: string }> = [];
  for (const p of xmlFiles(dir)) {
    files.push({
      docId: p
        .split("/")
        .pop()!
        .replace(/\.xml$/, ""),
      path: p,
    });
    if (files.length >= LIMIT) break;
  }
  console.log(`XML-Originale: ${files.length.toLocaleString("de-AT")} (${values.corpus})`);

  let compared = 0;
  let noPage = 0;
  let noBody = 0;
  const buckets = { exact: 0, high: 0, mid: 0, low: 0 };
  const worst: Array<{ docId: string; cov: number; xmlWords: number; title: string }> = [];
  // Which fetch generation a page came from decides how far its text can be
  // trusted; a defect that clusters in one generation condemns the generation.
  const perGen = new Map<string, { n: number; bad: number }>();

  const BATCH = 500;
  for (let i = 0; i < files.length; i += BATCH) {
    const slice = files.slice(i, i + BATCH);
    const rows = (await engine.executeRaw(
      `SELECT frontmatter->>'doc_id' AS doc_id, title, compiled_truth,
              coalesce(frontmatter->>'normalizer_version', 'alt') AS nv,
              coalesce(frontmatter->>'source_format', '?') AS fmt
         FROM pages
        WHERE deleted_at IS NULL AND frontmatter->>'doc_id' = ANY($1::text[])`,
      [slice.map((f) => f.docId)]
    )) as Array<{
      doc_id: string;
      title: string | null;
      compiled_truth: string | null;
      nv: string;
      fmt: string;
    }>;
    const byId = new Map(rows.map((r) => [r.doc_id, r]));

    for (const f of slice) {
      const page = byId.get(f.docId);
      if (!page) {
        noPage++;
        continue;
      }
      const body = risBodyText(readFileSync(f.path, "utf8"));
      if (body == null) {
        noBody++;
        continue;
      }
      const expected = words(body);
      const cov = coverage(expected, words(page.compiled_truth ?? ""));
      compared++;
      const gen = `Normalizer v${page.nv}, Format ${page.fmt}`;
      const g = perGen.get(gen) ?? { n: 0, bad: 0 };
      g.n++;
      if (cov < THRESHOLD) g.bad++;
      perGen.set(gen, g);
      if (cov >= 0.999) buckets.exact++;
      else if (cov >= THRESHOLD) buckets.high++;
      else if (cov >= 0.8) buckets.mid++;
      else buckets.low++;
      if (cov < THRESHOLD) {
        worst.push({ docId: f.docId, cov, xmlWords: expected.length, title: page.title ?? "" });
      }
    }
    if ((i / BATCH) % 10 === 0)
      process.stdout.write(`\r  geprüft ${Math.min(i + BATCH, files.length)}`);
  }
  console.log("\n");

  const pct = (v: number) => (compared > 0 ? ((v / compared) * 100).toFixed(2) : "0") + " %";
  console.log(`  verglichen:                     ${compared.toLocaleString("de-AT")}`);
  console.log(
    `  wortgleich (≥ 99,9 %):          ${buckets.exact.toLocaleString("de-AT")}  (${pct(buckets.exact)})`
  );
  console.log(
    `  ≥ ${(THRESHOLD * 100).toFixed(0)} %:                         ${buckets.high.toLocaleString("de-AT")}  (${pct(buckets.high)})`
  );
  console.log(
    `  80–${(THRESHOLD * 100).toFixed(0)} %:                        ${buckets.mid.toLocaleString("de-AT")}  (${pct(buckets.mid)})`
  );
  console.log(
    `  unter 80 %:                     ${buckets.low.toLocaleString("de-AT")}  (${pct(buckets.low)})`
  );
  console.log(`  XML ohne Textabschnitt:         ${noBody.toLocaleString("de-AT")}`);
  console.log(`  XML ohne aktive Seite in der DB: ${noPage.toLocaleString("de-AT")}`);

  console.log(`\n  Nach Abrufgeneration:`);
  for (const [gen, g] of [...perGen].sort((a, b) => b[1].n - a[1].n)) {
    console.log(
      `    ${gen.padEnd(34)} ${g.n.toLocaleString("de-AT").padStart(7)} geprüft, ` +
        `${g.bad} abweichend (${((g.bad / g.n) * 100).toFixed(2)} %)`
    );
  }

  if (worst.length > 0) {
    worst.sort((a, b) => a.cov - b.cov);
    console.log(`\n  Größte Abweichungen:`);
    for (const w of worst.slice(0, 15)) {
      console.log(
        `    ${(w.cov * 100).toFixed(1).padStart(5)} %  ${w.docId}  (${w.xmlWords} Wörter)  ${w.title.slice(0, 50)}`
      );
    }
  }
  await engine.disconnect();
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
