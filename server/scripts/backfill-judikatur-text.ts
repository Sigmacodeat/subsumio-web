#!/usr/bin/env bun
/**
 * Backfill full text for judikatur files that were created with --skip-text.
 * Fetches text in parallel batches (5 concurrent) for speed.
 *
 * Usage:
 *   bun scripts/backfill-judikatur-text.ts --dir law-corpus/at-judikatur --batch 5
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { proxyFetchOptions, getUserAgent } from "./ris-proxy";
import {
  stripHtmlComplete,
  contentMatchesDocument,
  validateFetchedText,
  validateLegalStructure,
  contentHash,
  atomicWrite,
  risXmlToText,
} from "./backfill-utils";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const RATE_LIMIT_MS = 200;

function stripHtml(html: string): string {
  return stripHtmlComplete(html);
}

function extractRisReferences(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const result = (data.OgdSearchResult ?? data) as Record<string, unknown>;
  const docResults = result.OgdDocumentResults as Record<string, unknown> | undefined;
  if (!docResults) return [];
  const refs = docResults.OgdDocumentReference;
  if (Array.isArray(refs)) return refs as Array<Record<string, unknown>>;
  if (refs && typeof refs === "object") return [refs as Record<string, unknown>];
  return [];
}

function extractHtmlUrl(ref: Record<string, unknown>): string {
  const data = (ref.Data ?? {}) as Record<string, unknown>;
  const dl = (data.Dokumentliste ?? {}) as Record<string, unknown>;
  const cr = (dl.ContentReference ?? {}) as Record<string, unknown>;
  const urls = cr.Urls as Record<string, unknown> | undefined;
  if (!urls) return "";
  const contentUrl = urls.ContentUrl;
  if (!contentUrl) return "";
  const urlArr = Array.isArray(contentUrl) ? contentUrl : [contentUrl];
  for (const u of urlArr) {
    const du = u as Record<string, unknown>;
    if (du.DataType === "Html") return String(du.Url ?? "");
  }
  if (urlArr.length > 0) {
    const first = urlArr[0] as Record<string, unknown>;
    return String(first.Url ?? "");
  }
  return "";
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": getUserAgent() },
        signal: AbortSignal.timeout(30_000),
        ...proxyFetchOptions(),
      });
      if (res.status === 429 || res.status >= 500) {
        const backoff = 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const backoff = 1000 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new Error("fetchWithRetry exhausted");
}

/** Fetch text by RIS document number (search by Dokumentnummer).
 *  Every candidate passes contentMatchesDocument() identity check. */
async function fetchTextByDocNumber(
  docNumber: string,
  fmFields: { case_number: string; ecli: string; celex: string }
): Promise<string> {
  try {
    const url = new URL(`${RIS_BASE}/judikatur`);
    url.searchParams.set("Applikation", "Justiz");
    url.searchParams.set("Dokumentnummer", docNumber);
    const res = await fetchWithRetry(url.toString());
    if (!res.ok) return "";
    const data = (await res.json()) as Record<string, unknown>;
    const refs = extractRisReferences(data);
    if (refs.length === 0) return "";

    // Try HTML content URL first
    const htmlUrl = extractHtmlUrl(refs[0]!);
    if (htmlUrl) {
      const htmlRes = await fetchWithRetry(htmlUrl);
      if (htmlRes.ok) {
        const candidate = stripHtml(await htmlRes.text());
        if (candidate.length >= 50 && contentMatchesDocument(candidate, fmFields)) {
          return candidate;
        }
      }
    }

    // Fallback: inline content
    const content = (refs[0] as Record<string, unknown>).Content as
      | Record<string, unknown>
      | undefined;
    if (content) {
      const dataContent = (content.Data as Record<string, unknown> | undefined) ?? {};
      const text = String(dataContent.Text ?? "");
      if (text) {
        const candidate = stripHtml(text);
        if (candidate.length >= 50 && contentMatchesDocument(candidate, fmFields)) {
          return candidate;
        }
      }
    }
    return "";
  } catch {
    return "";
  }
}

/** Extract frontmatter fields for identity verification. */
function extractFmFields(content: string): { case_number: string; ecli: string; celex: string } {
  const caseMatch = content.match(/^case_number:\s*['"]?([^\n'"]*)['"]?/m);
  const ecliMatch = content.match(/^ecli:\s*['"]?([^\n'"]*)['"]?/m);
  const celexMatch = content.match(/^celex:\s*['"]?([^\n'"]*)['"]?/m);
  return {
    case_number: caseMatch?.[1]?.trim() ?? "",
    ecli: ecliMatch?.[1]?.trim() ?? "",
    celex: celexMatch?.[1]?.trim() ?? "",
  };
}

/** Try the deterministic RIS document URL from the file's source_url.
 *  Strategy: XML first (cleanest), then HTML, then OGD search fallback.
 *  Every candidate passes contentMatchesDocument() identity check.
 */
async function fetchRisFullText(content: string, docNumber: string): Promise<string> {
  const urlMatch = content.match(/source_url:\s*"?([^\s"]+)"?/);
  const sourceUrl = urlMatch ? urlMatch[1]!.trim() : "";
  const abfrageMatch = sourceUrl.match(/[?&]Abfrage=([^&]+)/);
  const dokNrMatch = sourceUrl.match(/[?&]Dokumentnummer=([^&]+)/);
  const fmFields = extractFmFields(content);

  if (abfrageMatch && dokNrMatch) {
    const abfrage = abfrageMatch[1]!;
    const dokNr = dokNrMatch[1]!;

    // Strategy 1: XML (cleanest — structured nutzdaten, no site chrome)
    const xmlUrl = `https://www.ris.bka.gv.at/Dokumente/${abfrage}/${dokNr}/${dokNr}.xml`;
    try {
      const xmlRes = await fetchWithRetry(xmlUrl);
      if (xmlRes.ok) {
        const candidate = risXmlToText(await xmlRes.text());
        if (candidate.length >= 50 && contentMatchesDocument(candidate, fmFields)) {
          return candidate;
        }
      }
    } catch {
      // XML failed — try HTML
    }

    // Strategy 2: HTML (noisier, but stripHtmlComplete handles chrome)
    const htmlUrl = `https://www.ris.bka.gv.at/Dokumente/${abfrage}/${dokNr}/${dokNr}.html`;
    try {
      const htmlRes = await fetchWithRetry(htmlUrl);
      if (htmlRes.ok) {
        const candidate = stripHtml(await htmlRes.text());
        if (candidate.length >= 200 && contentMatchesDocument(candidate, fmFields)) {
          return candidate;
        }
      }
    } catch {
      // HTML failed — fall through to OGD search
    }
  }

  // Strategy 3: OGD search by Dokumentnummer
  return fetchTextByDocNumber(docNumber, fmFields);
}

/** Extract RIS document number from frontmatter source_url or filename. */
function extractDocNumber(content: string, filename: string): string {
  // Try to extract from frontmatter
  const urlMatch = content.match(/source_url:\s*"?([^\s"]+)"?/);
  if (urlMatch) {
    const url = urlMatch[1]!;
    const docMatch = url.match(/Dokumentnummer=([^&]+)/);
    if (docMatch) return docMatch[1]!;
  }
  // Try to extract from the RIS ID in frontmatter
  const idMatch = content.match(/ris-([A-Za-z0-9_]+)/);
  if (idMatch) return idMatch[1]!;
  return "";
}

/** Check if a file has real text content (not just the placeholder). */
function hasText(content: string): boolean {
  if (content.includes("*Volltext nicht abrufbar") || content.includes("*Volltext nicht verfügbar"))
    return false;
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (!bodyMatch) return false;
  const body = bodyMatch[1]!.trim();
  if (body.length < 200) return false;
  return true;
}

/** Inject text into an existing markdown file, preserving frontmatter.
 *  Adds content_hash to frontmatter for post-backfill verification. */
function injectText(content: string, text: string): string {
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)/);
  if (!fmMatch) return content;
  let frontmatter = fmMatch[1]!;
  const sourceMatch = content.match(/Quelle:\s*\[([^\]]+)\]\(([^\)]+)\)/);
  const sourceLine = sourceMatch ? `\n---\n*Quelle: [${sourceMatch[1]}](${sourceMatch[2]})*` : "";
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const titleLine = titleMatch ? `# ${titleMatch[1]}\n\n` : "";

  // Inject content_hash into frontmatter
  const hash = contentHash(text);
  if (frontmatter.includes("content_hash:")) {
    frontmatter = frontmatter.replace(/content_hash:\s*"?[^"]*"?/, `content_hash: "${hash}"`);
  } else {
    frontmatter = frontmatter.replace(/---\n$/, `content_hash: "${hash}"\n---\n`);
  }

  return `${frontmatter}\n${titleLine}${text}${sourceLine}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--dir");
  const dir = dirIdx >= 0 ? args[dirIdx + 1]! : "law-corpus/at-judikatur";
  const batchIdx = args.indexOf("--batch");
  const batchSize = batchIdx >= 0 ? parseInt(args[batchIdx + 1]!, 10) : 5;
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]!, 10) : 0;
  const forceReFetch = args.includes("--force-refetch");

  const _scriptDir = dirname(fileURLToPath(import.meta.url));
  const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
  const absDir = dir.startsWith("law-corpus/")
    ? join(_corpusRoot, dir.replace(/^law-corpus\//, ""))
    : join(_scriptDir, "..", dir);
  const files = readdirSync(absDir).filter((f) => f.endsWith(".md"));

  // Find files without text
  const textless: string[] = [];
  for (const file of files) {
    const content = readFileSync(join(absDir, file), "utf-8");
    if (!hasText(content) || forceReFetch) {
      textless.push(file);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Backfill Judikatur Text`);
  console.log(`  Directory: ${absDir}`);
  console.log(`  Total files: ${files.length}`);
  console.log(`  Textless: ${textless.length}`);
  console.log(`  Batch size: ${batchSize} concurrent`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  if (textless.length === 0) {
    console.log("✅ All files already have text. Nothing to do.");
    return;
  }

  const toProcess = limit > 0 ? textless.slice(0, limit) : textless;
  let processed = 0;
  let success = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < toProcess.length; i += batchSize) {
    const batch = toProcess.slice(i, i + batchSize);
    const promises = batch.map(async (file) => {
      const filepath = join(absDir, file);
      const content = readFileSync(filepath, "utf-8");
      const docNumber = extractDocNumber(content, file);
      if (!docNumber) {
        return { file, success: false, text: "", reason: "no_doc_number" };
      }
      const text = await fetchRisFullText(content, docNumber);
      if (text.length < 100) {
        return { file, success: false, text: "", reason: "fetch_failed" };
      }
      // Validate fetched text before writing
      const validation = validateFetchedText(text);
      if (!validation.valid) {
        return { file, success: false, text: "", reason: `validation: ${validation.reason}` };
      }
      // Structure validation for court decisions
      const structResult = validateLegalStructure(validation.cleanedText, "court_decision");
      if (!structResult.valid) {
        return { file, success: false, text: "", reason: `structure: ${structResult.reason}` };
      }
      return { file, success: true, text: validation.cleanedText, reason: "" };
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      processed++;
      if (result.success) {
        const filepath = join(absDir, result.file);
        const content = readFileSync(filepath, "utf-8");
        const updated = injectText(content, result.text);
        try {
          atomicWrite(filepath, updated);
          success++;
        } catch (e: any) {
          console.error(`  ⚠️ write failed for ${result.file}: ${e?.message}`);
          failed++;
        }
      } else {
        if (result.reason && result.reason !== "fetch_failed") {
          console.error(`  ⚠️ ${result.file}: ${result.reason}`);
        }
        failed++;
      }
    }

    if (processed % 50 < batchSize) {
      console.log(`  [${processed}/${toProcess.length}] ✅ ${success} ❌ ${failed}`);
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  SUMMARY — Backfill Text`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Success:   ${success}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
