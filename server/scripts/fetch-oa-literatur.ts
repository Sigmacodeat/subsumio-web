#!/usr/bin/env bun
/**
 * Harvest Open-Access legal journals for the literature corpus.
 *
 * Providers (all verified live 2026-07-18):
 *   - alj        Austrian Law Journal (Uni Graz, Diamond OA)   → OAI-PMH, oai_dc
 *   - suigeneris sui generis (CH, CC BY-SA 4.0)                → OAI-PMH, oai_dc
 *   - vfblog     Verfassungsblog (DE, CC BY-SA 4.0 default)    → WordPress REST, Volltext
 *
 * OAI-PMH providers yield metadata + abstract only (content_scope: "abstract") —
 * full-text PDFs are licensed per article and are NOT fetched in phase 1.
 * Verfassungsblog yields full rendered post content (content_scope: "full").
 *
 * Usage:
 *   bun scripts/fetch-oa-literatur.ts [--provider alj|suigeneris|vfblog] [--target N] [--refresh]
 *
 * Output:
 *   law-corpus/at-literatur/alj-<id>.md
 *   law-corpus/ch-literatur/suigeneris-<id>.md
 *   law-corpus/de-literatur/vfblog-<slug>.md
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { dump as yamlDump } from "js-yaml";
import { checkStaticCompliance } from "../src/core/legal/license-registry.ts";

const RATE_LIMIT_MS = 500;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");

const PROVIDER = argOf("--provider"); // undefined = alle
const TARGET = Number(argOf("--target") ?? "0");
const REFRESH = process.argv.includes("--refresh");

function argOf(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Subsumio-Legal-Import/1.0 (OA-Harvest)" },
        signal: AbortSignal.timeout(60_000),
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
    .replace(/&#8211;/g, "–")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#39;|&#8217;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Minimal oai_dc field extraction from one <record> XML fragment. */
function dcFields(recordXml: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of recordXml.matchAll(/<dc:([a-z]+)(?:\s[^>]*)?>([\s\S]*?)<\/dc:\1>/g)) {
    const key = m[1];
    const val = stripHtml(m[2]).replace(/\s+/g, " ").trim();
    if (!val) continue;
    (out[key] ??= []).push(val);
  }
  return out;
}

interface OaiProvider {
  key: "alj" | "suigeneris";
  licenseSourceId: string;
  endpoint: string;
  outDir: string;
  jurisdiction: "at" | "ch";
  work: string;
  licenseNote: string;
}

const OAI_PROVIDERS: OaiProvider[] = [
  {
    key: "alj",
    licenseSourceId: "law-at-literatur-alj",
    endpoint: "https://alj.uni-graz.at/index.php/alj/oai",
    outDir: join(_corpusRoot, "at-literatur"),
    jurisdiction: "at",
    work: "Austrian Law Journal",
    licenseNote:
      "Diamond Open Access (DOAJ). Phase 1: Metadaten + Abstract via OAI-PMH; " +
      "Volltext-PDF nur nach Lizenzprüfung pro Artikel.",
  },
  {
    key: "suigeneris",
    licenseSourceId: "law-ch-literatur-suigeneris",
    endpoint: "https://sui-generis.ch/oai",
    outDir: join(_corpusRoot, "ch-literatur"),
    jurisdiction: "ch",
    work: "sui generis",
    licenseNote:
      "CC BY-SA 4.0. Phase 1: Metadaten + Abstract via OAI-PMH; " +
      "Volltext-PDF nur nach Lizenzprüfung pro Artikel.",
  },
];

async function harvestOai(p: OaiProvider): Promise<void> {
  const terms = checkStaticCompliance(p.licenseSourceId, "api");
  console.log(`[${p.key}] Lizenz OK (${terms.license_type}) — starte OAI-PMH-Harvest`);
  mkdirSync(p.outDir, { recursive: true });

  let token = "";
  let written = 0;
  let skipped = 0;

  for (;;) {
    const url = token
      ? `${p.endpoint}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`
      : `${p.endpoint}?verb=ListRecords&metadataPrefix=oai_dc`;
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      console.error(`[${p.key}] HTTP ${res.status} — Abbruch`);
      return;
    }
    const xml = await res.text();
    const records = [...xml.matchAll(/<record>([\s\S]*?)<\/record>/g)].map((m) => m[1]);
    if (records.length === 0 && !token) {
      console.log(`[${p.key}] Keine Records`);
      return;
    }

    for (const rec of records) {
      if (/<header[^>]*status="deleted"/.test(rec)) continue;
      const idM = /<identifier>([\s\S]*?)<\/identifier>/.exec(rec);
      const rawId = idM ? idM[1].trim() : "";
      const numId = rawId.split("/").pop() ?? rawId;
      if (!numId) continue;
      const outPath = join(p.outDir, `${p.key}-${numId}.md`);
      if (!REFRESH && existsSync(outPath)) {
        skipped++;
        continue;
      }
      const dc = dcFields(rec);
      const title = dc.title?.[0] ?? `${p.work} Artikel ${numId}`;
      const landing = (dc.identifier ?? []).find((v) => v.startsWith("http")) ?? "";
      const abstract = dc.description?.[0] ?? "";
      const fm = {
        title: `${p.work} — ${title.slice(0, 200)}`,
        type: "literatur",
        genre: "aufsatz",
        jurisdiction: p.jurisdiction,
        work: p.work,
        authors: dc.creator ?? null,
        oai_identifier: rawId,
        content_scope: "abstract",
        version_date: (dc.date?.[0] ?? "").slice(0, 10) || null,
        retrieved_at: new Date().toISOString().slice(0, 10),
        source: `oai-${p.key}`,
        source_url: landing || p.endpoint,
        license: `${p.licenseNote}${dc.rights?.length ? ` Rights: ${dc.rights.join("; ")}` : ""}`,
      };
      const body = [
        `# ${title}`,
        dc.creator?.length ? `\nAutor:innen: ${dc.creator.join("; ")}` : "",
        abstract ? `\n## Abstract\n\n${abstract}` : "",
        landing ? `\nVolltext: ${landing}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      writeFileSync(outPath, `---\n${yamlDump(fm)}---\n\n${body}\n`, "utf8");
      written++;
      if (TARGET > 0 && written >= TARGET) {
        console.log(`[${p.key}] Target erreicht. geschrieben=${written} übersprungen=${skipped}`);
        return;
      }
    }

    const tokenM = /<resumptionToken[^>]*>([\s\S]*?)<\/resumptionToken>/.exec(xml);
    const next = tokenM ? tokenM[1].trim() : "";
    if (!next) break;
    token = next;
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
  console.log(`[${p.key}] Fertig. geschrieben=${written} übersprungen=${skipped}`);
}

async function harvestVerfassungsblog(): Promise<void> {
  const terms = checkStaticCompliance("law-de-literatur-verfassungsblog", "api");
  console.log(`[vfblog] Lizenz OK (${terms.license_type}) — starte WP-REST-Harvest`);
  const outDir = join(_corpusRoot, "de-literatur");
  mkdirSync(outDir, { recursive: true });

  let page = 1;
  let written = 0;
  let skipped = 0;

  for (;;) {
    const res = await fetchWithRetry(
      `https://verfassungsblog.de/wp-json/wp/v2/posts?per_page=50&page=${page}`
    );
    if (res.status === 400) break; // hinter der letzten Seite
    if (!res.ok) {
      console.error(`[vfblog] HTTP ${res.status} — Abbruch`);
      return;
    }
    const posts = (await res.json()) as Array<{
      slug: string;
      link: string;
      date: string;
      title: { rendered: string };
      content: { rendered: string };
    }>;
    if (posts.length === 0) break;

    for (const post of posts) {
      const outPath = join(outDir, `vfblog-${post.slug}.md`);
      if (!REFRESH && existsSync(outPath)) {
        skipped++;
        continue;
      }
      const text = stripHtml(post.content.rendered);
      if (text.length < 800) continue;
      const title = stripHtml(post.title.rendered);
      const fm = {
        title: `Verfassungsblog — ${title.slice(0, 200)}`,
        type: "literatur",
        genre: "aufsatz",
        jurisdiction: "de",
        work: "Verfassungsblog",
        content_scope: "full",
        version_date: post.date.slice(0, 10),
        retrieved_at: new Date().toISOString().slice(0, 10),
        source: "verfassungsblog-wp",
        source_url: post.link,
        license:
          "CC BY-SA 4.0 (Standard-Lizenz des Verfassungsblogs; einzelne Beiträge können " +
          "abweichen). Namensnennung + Share-Alike erforderlich.",
      };
      writeFileSync(outPath, `---\n${yamlDump(fm)}---\n\n# ${title}\n\n${text}\n`, "utf8");
      written++;
      if (TARGET > 0 && written >= TARGET) {
        console.log(`[vfblog] Target erreicht. geschrieben=${written} übersprungen=${skipped}`);
        return;
      }
    }

    if (written % 200 < 50) console.log(`[vfblog] Seite ${page}: geschrieben=${written}`);
    page++;
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
  console.log(`[vfblog] Fertig. geschrieben=${written} übersprungen=${skipped}`);
}

async function main(): Promise<void> {
  const wanted = PROVIDER ? [PROVIDER] : ["alj", "suigeneris", "vfblog"];
  for (const key of wanted) {
    if (key === "vfblog") {
      await harvestVerfassungsblog();
    } else {
      const p = OAI_PROVIDERS.find((x) => x.key === key);
      if (!p) {
        console.error(`Unbekannter Provider: ${key} (erlaubt: alj, suigeneris, vfblog)`);
        process.exit(1);
      }
      await harvestOai(p);
    }
  }
}

main().catch((err) => {
  console.error("[oa-literatur] Fataler Fehler:", err);
  process.exit(1);
});
