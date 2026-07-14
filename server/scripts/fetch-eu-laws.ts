#!/usr/bin/env bun
/**
 * Fetch EU legislation and case law from EUR-Lex Cellar SPARQL API.
 *
 * Uses the public SPARQL endpoint at publications.europa.eu to discover
 * all EU legal works (regulations, directives, decisions, case law),
 * then downloads their HTML content in German via the Cellar REST API.
 *
 * Usage:
 *   bun scripts/fetch-eu-laws.ts --type regulation --skip-text
 *   bun scripts/fetch-eu-laws.ts --type all --skip-text
 *
 * SPARQL endpoint: https://publications.europa.eu/webapi/rdf/sparql
 * Cellar REST:     https://publications.europa.eu/resource/cellar/{id}
 * No auth required (public open data).
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { dump as yamlDump } from "js-yaml";

const SPARQL_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";
const CELLAR_BASE = "https://publications.europa.eu/resource/cellar";
const RATE_LIMIT_MS = 200;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const SPARQL_PAGE_SIZE = 1000;

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(_scriptDir, "..", "..", "law-corpus", "eu");

interface EUTypeConfig {
  label: string;
  outDir: string;
  resourceTypes: string[];
  knownTotal: number;
}

const TYPE_CONFIGS: Record<string, EUTypeConfig> = {
  regulation: {
    label: "Verordnungen",
    outDir: "regulations",
    resourceTypes: [
      "http://publications.europa.eu/resource/authority/resource-type/REG",
      "http://publications.europa.eu/resource/authority/resource-type/REG_IMPL",
      "http://publications.europa.eu/resource/authority/resource-type/REG_DEL",
      "http://publications.europa.eu/resource/authority/resource-type/REG_FINANC",
    ],
    knownTotal: 163787,
  },
  directive: {
    label: "Richtlinien",
    outDir: "directives",
    resourceTypes: [
      "http://publications.europa.eu/resource/authority/resource-type/DIR",
      "http://publications.europa.eu/resource/authority/resource-type/DIR_IMPL",
      "http://publications.europa.eu/resource/authority/resource-type/DIR_DEL",
    ],
    knownTotal: 8201,
  },
  decision: {
    label: "Entscheidungen",
    outDir: "decisions",
    resourceTypes: [
      "http://publications.europa.eu/resource/authority/resource-type/DEC",
      "http://publications.europa.eu/resource/authority/resource-type/DEC_DEL",
      "http://publications.europa.eu/resource/authority/resource-type/DEC_IMPL",
    ],
    knownTotal: 30085,
  },
  caselaw: {
    label: "EuGH Urteile",
    outDir: "caselaw",
    resourceTypes: [
      "http://publications.europa.eu/resource/authority/resource-type/JUDG",
      "http://publications.europa.eu/resource/authority/resource-type/ORDER",
      "http://publications.europa.eu/resource/authority/resource-type/OPIN_AG",
    ],
    knownTotal: 44571,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  headers?: Record<string, string>,
  maxRetries: number = MAX_RETRIES
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)", ...headers },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr ?? new Error("fetchWithRetry exhausted");
}

function buildSparqlQuery(
  resourceTypes: string[],
  offset: number,
  limit: number
): string {
  const typeFilter = resourceTypes
    .map((t) => `?type=<${t}>`)
    .join("||\n  ");

  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
  select distinct ?work ?celex where {
    ?work cdm:work_has_resource-type ?type.
    FILTER(${typeFilter})
    FILTER not exists{?work cdm:do_not_index "true"^^<http://www.w3.org/2001/XMLSchema#boolean>}
    OPTIONAL{?work cdm:resource_legal_id_celex ?celex.}
  } OFFSET ${offset} LIMIT ${limit}`;
}

interface EUWork {
  workUri: string;
  celex: string;
  cellarId: string;
}

async function fetchSparqlPage(
  resourceTypes: string[],
  offset: number
): Promise<EUWork[]> {
  const query = buildSparqlQuery(resourceTypes, offset, SPARQL_PAGE_SIZE);
  const url = new URL(SPARQL_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "application/json");

  const res = await fetchWithRetry(url.toString());
  if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}`);
  const data = (await res.json()) as any;
  const bindings = data?.results?.bindings ?? [];

  return bindings.map((b: any) => {
    const workUri = b.work?.value ?? "";
    const celex = b.celex?.value ?? "";
    const cellarId = workUri.split("/cellar/")[1] ?? "";
    return { workUri, celex, cellarId };
  });
}

function stripHtmlSimple(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
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
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function buildMarkdown(celex: string, text: string, workUri: string): string {
  const frontmatter = yamlDump(
    {
      type: "eu_legislation",
      jurisdiction: "eu",
      celex,
      source: "eur-lex-cellar",
      source_url: workUri,
      retrieved_at: new Date().toISOString().slice(0, 10),
    },
    { lineWidth: -1, noRefs: true }
  ).trimEnd();

  const body = text || "*Volltext nicht abrufbar — siehe EUR-Lex.*";

  return `---
${frontmatter}
---

# ${celex}

${body}

---
*Quelle: [EUR-Lex](${workUri})*
`;
}

function loadExistingFiles(outDir: string): Set<string> {
  const files = new Set<string>();
  if (!existsSync(outDir)) return files;
  for (const f of readdirSync(outDir)) {
    if (f.endsWith(".md")) files.add(f.replace(".md", ""));
  }
  return files;
}

// ── Fetch one EU type ──────────────────────────────────────────────────

async function fetchEUType(
  typeKey: string,
  config: EUTypeConfig,
  skipText: boolean,
  target: number
): Promise<{ written: number; skipped: number }> {
  const outDir = join(CORPUS_DIR, config.outDir);
  mkdirSync(outDir, { recursive: true });

  const existing = loadExistingFiles(outDir);
  const existingCount = existing.size;

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  EU ${config.label} — Full Scan`);
  console.log(`  Existing: ${existingCount} files | API total: ~${config.knownTotal}`);
  console.log(`  Target: ${target} | Skip text: ${skipText}`);
  console.log(`  Output: ${outDir}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  let written = 0;
  let skipped = 0;
  let offset = 0;
  let totalFound = 0;

  while (totalFound < target) {
    let works: EUWork[];
    try {
      works = await fetchSparqlPage(config.resourceTypes, offset);
    } catch (err) {
      console.error(`  SPARQL offset ${offset} failed: ${err}`);
      break;
    }
    if (works.length === 0) {
      console.log(`  No more results at offset ${offset}`);
      break;
    }

    console.log(`  Page at offset ${offset}: ${works.length} works`);

    for (const work of works) {
      if (totalFound >= target) break;
      totalFound++;

      if (!work.celex || !work.cellarId) {
        skipped++;
        continue;
      }

      const fileKey = slugify(work.celex);
      if (existing.has(fileKey)) {
        skipped++;
        continue;
      }
      existing.add(fileKey);

      let text = "";
      if (!skipText) {
        try {
          const contentUrl = `${CELLAR_BASE}/${work.cellarId}`;
          const res = await fetchWithRetry(contentUrl, {
            Accept: "text/html",
            "Accept-Language": "de",
          });
          if (res.ok) {
            const html = await res.text();
            text = stripHtmlSimple(html);
          }
        } catch {
          // text stays empty
        }
      }

      const filename = `${fileKey}.md`;
      const filepath = join(outDir, filename);
      writeFileSync(filepath, buildMarkdown(work.celex, text, work.workUri), "utf-8");
      written++;

      if (written % 500 === 0) {
        console.log(`  [${written}] ${work.celex}`);
      }

      if (!skipText) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    offset += SPARQL_PAGE_SIZE;
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n  ${config.label} SUMMARY: ${written} written, ${skipped} skipped, ${existingCount} pre-existing`);
  return { written, skipped };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const typeIdx = args.indexOf("--type");
  const typeArg = typeIdx >= 0 ? args[typeIdx + 1] : "all";
  const skipText = args.includes("--skip-text");
  const targetIdx = args.indexOf("--target");
  const targetOverride = targetIdx >= 0 ? parseInt(args[targetIdx + 1], 10) : 0;

  const typesToRun = typeArg === "all"
    ? Object.keys(TYPE_CONFIGS)
    : typeArg.split(",").map((t) => t.trim());

  let grandWritten = 0;
  let grandSkipped = 0;

  for (const typeKey of typesToRun) {
    const config = TYPE_CONFIGS[typeKey];
    if (!config) {
      console.error(`Unknown type: ${typeKey}. Available: ${Object.keys(TYPE_CONFIGS).join(", ")}`);
      continue;
    }

    const target = targetOverride || config.knownTotal;
    const result = await fetchEUType(typeKey, config, skipText, target);
    grandWritten += result.written;
    grandSkipped += result.skipped;
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  EU GRAND TOTAL: ${grandWritten} written, ${grandSkipped} skipped`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`\nNext steps:`);
  console.log(`  1. Backfill text if needed`);
  console.log(`  2. Import to DB:  bun scripts/import-judikatur.ts --source eu --no-embed`);
  console.log(`  3. Embed:         bun scripts/embed-pending-at.ts --source law-eu`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
