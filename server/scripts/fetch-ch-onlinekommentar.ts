#!/usr/bin/env bun
/**
 * Fetch Open-Access commentaries from Onlinekommentar.ch (CC BY 4.0).
 *
 * Onlinekommentar.ch publishes peer-reviewed article-by-article commentaries
 * on Swiss law (ZGB, OR, BV, BPR, ...) under CC BY 4.0 — the only fully open
 * licensed legal commentary in the DACH region. Attribution is required and
 * is preserved in the frontmatter (authors + Zitiervorschlag when found).
 *
 * Structure (verified 2026-07-18):
 *   /de/kommentare            → index listing every commentary page
 *   /de/kommentare/<slug>     → one commentary (e.g. bv3 = Kommentar zu Art. 3 BV)
 * No sitemap.xml; leaf pages carry the text in <main>/<article>.
 *
 * Usage:
 *   bun scripts/fetch-ch-onlinekommentar.ts [--target N] [--refresh]
 *
 * Output: law-corpus/ch-literatur/ok-<slug>.md — idempotent unless --refresh.
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { dump as yamlDump } from "js-yaml";
import { checkStaticCompliance } from "../src/core/legal/license-registry.ts";

const BASE = "https://onlinekommentar.ch";
const INDEX_PATHS = ["/de/kommentare"];
const RATE_LIMIT_MS = 400;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const MIN_TEXT_CHARS = 1500; // unter dieser Länge: Index-/Platzhalterseite, kein Kommentar

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const OUT_DIR = join(_corpusRoot, "ch-literatur");

const TARGET = Number(argOf("--target") ?? "0");
const REFRESH = process.argv.includes("--refresh");

function argOf(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const terms = checkStaticCompliance("law-ch-literatur-onlinekommentar", "scraping");
console.log(`[license] ${terms.source_name}: ${terms.license_type} — Nutzung erlaubt (CC BY 4.0)`);

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Subsumio-Legal-Import/1.0 (CC-BY-Harvest; Kontakt: admin)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr ?? new Error("fetchWithRetry exhausted");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<h([1-6])[^>]*>/gi, (_m, l) => `\n\n${"#".repeat(Number(l))} `)
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract the <main>…</main> (fallback <article>) region of a page. */
function mainRegion(html: string): string {
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (main) return main[1];
  const article = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  return article ? article[1] : html;
}

function titleOf(html: string): string {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1) return stripHtml(h1[1]).replace(/\s+/g, " ").trim();
  const t = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return t
    ? stripHtml(t[1])
        .replace(/\s*[|–-]\s*Onlinekommentar.*$/i, "")
        .trim()
    : "";
}

/**
 * Commentary pages embed structured data in the SSR payload (verified
 * 2026-07-18): `suggested_citation_long: '…'` and `assigned_authors:
 * [{ name: '…' }]`. Extract from raw HTML — no text heuristics.
 */
function zitiervorschlagOf(html: string): string | null {
  const m = /suggested_citation_long:\s*'((?:[^'\\]|\\.)+)'/.exec(html);
  return m ? m[1].replace(/\\'/g, "'").replace(/\s+/g, " ").trim() : null;
}

function authorsOf(html: string): string[] | null {
  const block = /'?assigned_authors'?:\s*\[([\s\S]{0,3000}?)\]/.exec(html);
  if (!block) return null;
  const names: string[] = [];
  for (const m of block[1].matchAll(/'?name'?:\s*'((?:[^'\\]|\\.)+)'/g)) {
    names.push(m[1].replace(/\\'/g, "'").trim());
  }
  return names.length > 0 ? names : null;
}

async function collectSlugs(): Promise<string[]> {
  const slugs = new Set<string>();
  for (const path of INDEX_PATHS) {
    const res = await fetchWithRetry(`${BASE}${path}`);
    if (!res.ok) continue;
    const html = await res.text();
    for (const m of html.matchAll(/href="\/de\/kommentare\/([a-z0-9-]+)"/g)) {
      slugs.add(m[1]);
    }
    // Werk-Indexseiten (z.B. /de/kommentare/zgb) verlinken weitere Leaf-Seiten
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
  // Zweite Ebene: jede gefundene Seite kann weitere Kommentar-Links tragen
  const firstLevel = [...slugs];
  for (const slug of firstLevel.slice(0, 60)) {
    // nur mutmaßliche Index-Seiten (reine Gesetzes-Kürzel ohne Ziffern) crawlen
    if (/\d/.test(slug)) continue;
    const res = await fetchWithRetry(`${BASE}/de/kommentare/${slug}`);
    if (res.ok) {
      const html = await res.text();
      for (const m of html.matchAll(/href="\/de\/kommentare\/([a-z0-9-]+)"/g)) {
        slugs.add(m[1]);
      }
    }
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
  return [...slugs].sort();
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const slugs = await collectSlugs();
  console.log(`[ok.ch] ${slugs.length} Kommentar-Slugs gefunden`);

  let written = 0;
  let skipped = 0;
  let thin = 0;

  for (const slug of slugs) {
    const outPath = join(OUT_DIR, `ok-${slug}.md`);
    if (!REFRESH && existsSync(outPath)) {
      skipped++;
      continue;
    }
    const res = await fetchWithRetry(`${BASE}/de/kommentare/${slug}`);
    if (!res.ok) {
      console.error(`[ok.ch] ${slug}: HTTP ${res.status} — übersprungen`);
      continue;
    }
    const html = await res.text();
    const text = stripHtml(mainRegion(html));
    if (text.length < MIN_TEXT_CHARS) {
      thin++; // Index-/Platzhalterseite
      continue;
    }
    const title = titleOf(html) || `Onlinekommentar ${slug}`;
    const fm = {
      title: `Onlinekommentar — ${title}`,
      type: "literatur",
      genre: "kommentar",
      jurisdiction: "ch",
      work: "Onlinekommentar",
      article_slug: slug,
      authors: authorsOf(html),
      citation: zitiervorschlagOf(html),
      version_date: new Date().toISOString().slice(0, 10),
      retrieved_at: new Date().toISOString().slice(0, 10),
      source: "onlinekommentar.ch",
      source_url: `${BASE}/de/kommentare/${slug}`,
      license:
        "CC BY 4.0 (https://onlinekommentar.ch/de/creative-commons-license). " +
        "Namensnennung erforderlich — Autor:innen und Zitiervorschlag siehe Frontmatter.",
    };
    const md = `---\n${yamlDump(fm)}---\n\n${text}\n`;
    writeFileSync(outPath, md, "utf8");
    written++;
    if (written % 25 === 0) console.log(`[ok.ch] ${written} geschrieben…`);
    if (TARGET > 0 && written >= TARGET) break;
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  console.log(`[ok.ch] Fertig. geschrieben=${written} übersprungen=${skipped} dünn=${thin}`);
}

main().catch((err) => {
  console.error("[ok.ch] Fataler Fehler:", err);
  process.exit(1);
});
