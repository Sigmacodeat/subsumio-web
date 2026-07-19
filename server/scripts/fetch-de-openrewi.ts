#!/usr/bin/env bun
/**
 * Fetch OpenRewi open legal textbooks/casebooks from de.wikibooks.org
 * via the MediaWiki API (CC BY-SA 4.0).
 *
 * OpenRewi publishes peer-organized Lehr-, Fall- und Handbücher (Grundrechte,
 * Staatsorganisationsrecht, Verwaltungsrecht, Asylrecht, ...) as Wikibooks
 * subpages under the "OpenRewi" prefix. License: CC BY-SA 4.0 — attribution
 * and share-alike are recorded in the frontmatter of every generated file.
 *
 * API (verified 2026-07-18):
 *   list=allpages&apprefix=OpenRewi   → page inventory
 *   action=parse&pageid=…&prop=text  → rendered HTML per page
 *
 * Usage:
 *   bun scripts/fetch-de-openrewi.ts [--target N] [--refresh]
 *
 * Output: law-corpus/de-literatur/openrewi-<slug>.md — idempotent unless --refresh.
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { dump as yamlDump } from "js-yaml";
import { checkStaticCompliance } from "../src/core/legal/license-registry.ts";

const API = "https://de.wikibooks.org/w/api.php";
const RATE_LIMIT_MS = 1200; // Wikimedia rate-limits aggressiv (429) — konservativ bleiben
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 2000;
const MIN_TEXT_CHARS = 800;

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const OUT_DIR = join(_corpusRoot, "de-literatur");

const TARGET = Number(argOf("--target") ?? "0");
const REFRESH = process.argv.includes("--refresh");

function argOf(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const terms = checkStaticCompliance("law-de-literatur-openrewi", "api");
console.log(
  `[license] ${terms.source_name}: ${terms.license_type} — API-Nutzung erlaubt (CC BY-SA 4.0)`
);

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Subsumio-Legal-Import/1.0 (CC-BY-SA-Harvest)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const retryAfterS = Number(res.headers.get("retry-after") ?? "0");
          const backoffMs = Math.max(retryAfterS * 1000, RETRY_BASE_MS * Math.pow(2, attempt));
          await new Promise((r) => setTimeout(r, backoffMs));
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
    .replace(/<table[^>]*class="[^"]*(?:navbox|metadata)[^"]*"[^>]*>[\s\S]*?<\/table>/gi, "")
    .replace(/<div[^>]*class="[^"]*(?:noprint|mw-editsection)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<span class="mw-editsection">[\s\S]*?<\/span>/gi, "")
    .replace(/<h([1-6])[^>]*>/gi, (_m, l) => `\n\n${"#".repeat(Number(l))} `)
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[Bearbeiten[^\]]*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

interface WikiPage {
  pageid: number;
  title: string;
}

async function listOpenRewiPages(): Promise<WikiPage[]> {
  const pages: WikiPage[] = [];
  let cont = "";
  for (;;) {
    const params = new URLSearchParams({
      action: "query",
      list: "allpages",
      apprefix: "OpenRewi",
      aplimit: "500",
      format: "json",
    });
    if (cont) params.set("apcontinue", cont);
    const res = await fetchWithRetry(`${API}?${params}`);
    if (!res.ok) throw new Error(`allpages HTTP ${res.status}`);
    const data = (await res.json()) as {
      query?: { allpages?: WikiPage[] };
      continue?: { apcontinue?: string };
    };
    pages.push(...(data.query?.allpages ?? []));
    const next = data.continue?.apcontinue;
    if (!next) break;
    cont = next;
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
  return pages;
}

async function fetchPageHtml(pageid: number): Promise<string> {
  const params = new URLSearchParams({
    action: "parse",
    pageid: String(pageid),
    prop: "text",
    format: "json",
    disableeditsection: "1",
  });
  const res = await fetchWithRetry(`${API}?${params}`);
  if (!res.ok) throw new Error(`parse HTTP ${res.status}`);
  const data = (await res.json()) as { parse?: { text?: { "*"?: string } } };
  return data.parse?.text?.["*"] ?? "";
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const pages = await listOpenRewiPages();
  console.log(`[openrewi] ${pages.length} Wikibooks-Seiten unter Prefix "OpenRewi"`);

  let written = 0;
  let skipped = 0;
  let thin = 0;

  for (const page of pages) {
    const cleanTitle = page.title.replace(/^OpenRewi\/?\s*/, "").trim() || page.title;
    const slug = `openrewi-${slugify(cleanTitle)}`;
    const outPath = join(OUT_DIR, `${slug}.md`);
    if (!REFRESH && existsSync(outPath)) {
      skipped++;
      continue;
    }
    let html: string;
    try {
      html = await fetchPageHtml(page.pageid);
    } catch (err) {
      // Einzelseiten-Fehler (z.B. hartnäckiges 429) killt nicht den Lauf —
      // idempotenter Re-Run holt die Seite später nach.
      console.error(`[openrewi] ${page.title}: ${err instanceof Error ? err.message : err}`);
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }
    const text = stripHtml(html);
    if (text.length < MIN_TEXT_CHARS) {
      thin++;
      continue;
    }
    const sourceUrl = `https://de.wikibooks.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
    const fm = {
      title: `OpenRewi — ${cleanTitle}`,
      type: "literatur",
      genre: "lehrbuch",
      jurisdiction: "de",
      work: "OpenRewi (Wikibooks)",
      wikibooks_pageid: page.pageid,
      version_date: new Date().toISOString().slice(0, 10),
      retrieved_at: new Date().toISOString().slice(0, 10),
      source: "wikibooks-openrewi",
      source_url: sourceUrl,
      license:
        "CC BY-SA 4.0 (https://de.wikibooks.org/wiki/Benutzer:OpenRewi/_Weiterverwendung). " +
        "Namensnennung: OpenRewi-Autor:innen via Versionsgeschichte der Quellseite; Share-Alike.",
    };
    const md = `---\n${yamlDump(fm)}---\n\n${text}\n`;
    writeFileSync(outPath, md, "utf8");
    written++;
    if (written % 50 === 0) console.log(`[openrewi] ${written} geschrieben…`);
    if (TARGET > 0 && written >= TARGET) break;
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  console.log(`[openrewi] Fertig. geschrieben=${written} übersprungen=${skipped} dünn=${thin}`);
}

main().catch((err) => {
  console.error("[openrewi] Fataler Fehler:", err);
  process.exit(1);
});
