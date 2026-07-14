#!/usr/bin/env bun
/**
 * Backfill full text for judikatur files that were created with --skip-text.
 * Fetches text in parallel batches (5 concurrent) for speed.
 *
 * Usage:
 *   bun scripts/backfill-judikatur-text.ts --dir law-corpus/at-judikatur --batch 5
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const RATE_LIMIT_MS = 200;

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
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
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)" },
        signal: AbortSignal.timeout(30_000),
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

/** Fetch text by RIS document number (search by Dokumentnummer). */
async function fetchTextByDocNumber(docNumber: string): Promise<string> {
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
        const html = await htmlRes.text();
        return stripHtml(html);
      }
    }

    // Fallback: inline content
    const content = (refs[0] as Record<string, unknown>).Content as Record<string, unknown> | undefined;
    if (content) {
      const dataContent = (content.Data as Record<string, unknown> | undefined) ?? {};
      const text = String(dataContent.Text ?? "");
      if (text) return stripHtml(text);
    }
    return "";
  } catch {
    return "";
  }
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
  if (content.includes("*Volltext nicht abrufbar") || content.includes("*Volltext nicht verfügbar")) return false;
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (!bodyMatch) return false;
  const body = bodyMatch[1]!.trim();
  if (body.length < 200) return false;
  return true;
}

/** Inject text into an existing markdown file, preserving frontmatter. */
function injectText(content: string, text: string): string {
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)/);
  if (!fmMatch) return content;
  const frontmatter = fmMatch[1]!;
  const sourceMatch = content.match(/Quelle:\s*\[([^\]]+)\]\(([^\)]+)\)/);
  const sourceLine = sourceMatch ? `\n---\n*Quelle: [${sourceMatch[1]}](${sourceMatch[2]})*` : "";
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const titleLine = titleMatch ? `# ${titleMatch[1]}\n\n` : "";
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

  const absDir = join(import.meta.dir, "..", dir);
  const files = readdirSync(absDir).filter((f) => f.endsWith(".md"));

  // Find files without text
  const textless: string[] = [];
  for (const file of files) {
    const content = readFileSync(join(absDir, file), "utf-8");
    if (!hasText(content)) {
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
        return { file, success: false, text: "" };
      }
      const text = await fetchTextByDocNumber(docNumber);
      return { file, success: text.length > 100, text };
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      processed++;
      if (result.success) {
        const filepath = join(absDir, result.file);
        const content = readFileSync(filepath, "utf-8");
        const updated = injectText(content, result.text);
        writeFileSync(filepath, updated, "utf-8");
        success++;
      } else {
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
