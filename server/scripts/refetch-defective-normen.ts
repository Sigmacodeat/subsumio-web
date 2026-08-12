#!/usr/bin/env bun
/**
 * Refetch defective law-at-normen files from RIS XML with the fixed extractText().
 *
 * Was passiert:
 * 1. Liest die Liste der defekten Slugs aus der DB (corpus_defects)
 * 2. Mappt jeden Slug auf die Rohdatei und liest die NOR-ID aus dem Frontmatter
 * 3. Refetcht die XML von RIS und schreibt die korrigierte Markdown-Datei
 * 4. Vergleicht alt vs. neu — nur geänderte Dateien werden geschrieben
 *
 * Kein Import, keine DB-Änderung — nur Dateien werden aktualisiert.
 * Der anschließende Normalizer + Import ist ein separater Schritt.
 *
 *   bun server/scripts/refetch-defective-normen.ts --dry-run
 *   bun server/scripts/refetch-defective-normen.ts --batch 50
 *   bun server/scripts/refetch-defective-normen.ts --batch 50 --resume
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { $ } from "bun";

const args = process.argv.slice(2);
const arg = (n: string, d?: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const DRY = args.includes("--dry-run");
const RESUME = args.includes("--resume");
const BATCH = parseInt(arg("--batch", "50")!, 10);
const LIMIT = parseInt(arg("--limit", "0")!, 10);
const DEFECT_TYPES = arg("--types", "inner_truncation,abrupt_end,abrupt_mid,pdf_artifact,spoken_numbers")!;
const OUT = "/tmp/refetch-defective-normen.jsonl";

const CORPUS_ROOT = join(import.meta.dir, "..", "..", "law-corpus");
const RAW_DIR = join(CORPUS_ROOT, "at-normen");

// ── DB-Verbindung ──────────────────────────────────────────────────────
const DB_URL = (await $`grep -hoE 'postgres://[^"'"'"' ]+subsumio_law[^"'"'"' ]*' server/.env`.quiet())
  .stdout.toString().trim().split("\n")[0];

// ── extractText (identisch zu ris-xml-fetch-normen.ts, mit listelem+schluss Fix) ──
function extractText(xml: string): { text: string; meta: Record<string, string> } {
  const meta: Record<string, string> = {};
  const blocks: string[] = [];
  const tagRe = /<(absatz|ueberschrift|listelem|schluss|schlussteil)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const attrs = m[2];
    const inner = m[3];
    const ctM = attrs.match(/\bct="([^"]*)"/);
    const ct = ctM ? ctM[1] : null;
    const plain = inner
      .replace(/<[^>]+>/g, " ")
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) continue;
    if (ct && ct !== "text") {
      if (!meta[ct]) meta[ct] = plain;
      continue;
    }
    if (ct === "text") blocks.push(plain);
  }
  return { text: blocks.join("\n\n"), meta };
}

// ── Frontmatter aus Rohdatei lesen (nur nor_id und source_url) ──
function readNorId(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf8");
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return null;
    const fm = m[1];
    const norM = fm.match(/^nor_id:\s*"([^"]+)"/m);
    if (norM) return norM[1];
    // Fallback: aus source_url extrahieren
    const urlM = fm.match(/^source_url:\s*"([^"]+)"/m);
    if (urlM) {
      const url = urlM[1];
      const norM2 = url.match(/NOR\d+/);
      if (norM2) return norM2[0];
    }
    return null;
  } catch { return null; }
}

// ── Frontmatter aus Rohdatei lesen (komplett, für Wiederherstellung) ──
function readFrontmatter(filePath: string): { fm: string; body: string } | null {
  try {
    const content = readFileSync(filePath, "utf8");
    const m = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!m) return null;
    return { fm: m[1], body: content.slice(m[0].length) };
  } catch { return null; }
}

// ── XML fetchen mit Retry ──
async function fetchXml(norId: string): Promise<string | null> {
  const url = `https://www.ris.bka.gv.at/Dokumente/Bundesnormen/${norId}/${norId}.xml`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.status === 429 || res.status === 503) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      if (!res.ok) {
        if (attempt < 4) { await new Promise((r) => setTimeout(r, 500)); continue; }
        return null;
      }
      return await res.text();
    } catch {
      if (attempt < 4) { await new Promise((r) => setTimeout(r, 500)); continue; }
      return null;
    }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  // 1. Defekte Slugs aus DB holen
  const types = DEFECT_TYPES.split(",").map((t) => `'${t}'`).join(",");
  const sql = `select distinct slug from corpus_defects where source_id = 'law-at-normen' and defect_type in (${types})`;
  const raw = (await $`psql ${DB_URL} -tAF$'\x1f' -c ${sql}`.quiet()).stdout.toString();
  const slugs = raw.split("\n").filter(Boolean).map((l) => l.split("\x1f")[0]);

  // Resume: bereits verarbeitete Slugs überspringen
  const done = new Set<string>();
  if (RESUME && existsSync(OUT)) {
    for (const l of readFileSync(OUT, "utf8").split("\n")) {
      try { const j = JSON.parse(l); if (j.slug) done.add(j.slug); } catch { /* */ }
    }
    console.log(`[resume] ${done.size} Slugs bereits verarbeitet`);
  }

  const todo = slugs.filter((s) => !done.has(s));
  const n = LIMIT > 0 ? Math.min(todo.length, LIMIT) : todo.length;
  console.log(`Zu refetchen: ${n} von ${slugs.length} defekten Slugs${DRY ? " (DRY RUN)" : ""}`);

  let refetched = 0, unchanged = 0, failed = 0, notFound = 0;

  for (let i = 0; i < n; i++) {
    const slug = todo[i];
    // Slug → Dateipfad: legal/statutes/at/<law>/<para> → at-normen/<law>/<para>.md
    const slugPath = slug.replace("legal/statutes/at/", "");
    const filePath = join(RAW_DIR, slugPath + ".md");

    if (!existsSync(filePath)) {
      notFound++;
      if (!DRY) appendFileSync(OUT, JSON.stringify({ slug, status: "file_not_found" }) + "\n");
      continue;
    }

    const norId = readNorId(filePath);
    if (!norId) {
      failed++;
      if (!DRY) appendFileSync(OUT, JSON.stringify({ slug, status: "no_nor_id" }) + "\n");
      continue;
    }

    const xml = await fetchXml(norId);
    if (!xml) {
      failed++;
      if (!DRY) appendFileSync(OUT, JSON.stringify({ slug, status: "fetch_failed", norId }) + "\n");
      continue;
    }

    const { text } = extractText(xml);
    if (!text.trim()) {
      failed++;
      if (!DRY) appendFileSync(OUT, JSON.stringify({ slug, status: "empty_text", norId }) + "\n");
      continue;
    }

    // Frontmatter behalten, nur Body ersetzen
    const fm = readFrontmatter(filePath);
    if (!fm) {
      failed++;
      if (!DRY) appendFileSync(OUT, JSON.stringify({ slug, status: "no_frontmatter" }) + "\n");
      continue;
    }

    // Titel aus Frontmatter
    const titleM = fm.fm.match(/^title:\s*"([^"]+)"/m);
    const title = titleM ? titleM[1] : slugPath;

    // content_hash neu berechnen
    const newHash = createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);

    // Vergleiche mit altem content_hash
    const oldHashM = fm.fm.match(/^content_hash:\s*"([^"]+)"/m);
    const oldHash = oldHashM ? oldHashM[1] : "";

    if (oldHash === newHash) {
      unchanged++;
      if (!DRY) appendFileSync(OUT, JSON.stringify({ slug, status: "unchanged", norId }) + "\n");
      continue;
    }

    // Neue Datei zusammenbauen: alter Frontmatter (mit neuem content_hash) + neuer Body
    let newFm = fm.fm.replace(/^content_hash:\s*"[^"]*"/m, `content_hash: "${newHash}"`);
    const newContent = `---\n${newFm}\n---\n\n# ${title}\n\n${text}\n`;

    if (!DRY) {
      writeFileSync(filePath, newContent);
      appendFileSync(OUT, JSON.stringify({ slug, status: "refetched", norId, oldHash, newHash, addedChars: text.length - fm.body.length }) + "\n");
    }
    refetched++;

    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/${n}  refetched=${refetched} unchanged=${unchanged} failed=${failed} notFound=${notFound}`);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Fertig: ${n} Slugs verarbeitet`);
  console.log(`  refetched: ${refetched}`);
  console.log(`  unchanged: ${unchanged}`);
  console.log(`  failed:    ${failed}`);
  console.log(`  notFound:  ${notFound}`);
  if (!DRY) console.log(`\nProtokoll: ${OUT}`);
}

await main();
