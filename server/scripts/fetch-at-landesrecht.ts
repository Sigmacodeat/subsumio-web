#!/usr/bin/env bun
/**
 * Fetch ALL Austrian state law (Landesrecht) from RIS-OGD API.
 *
 * Paginates through the RIS Landesrecht API to collect every available
 * state-level legal document. Downloads as markdown files.
 *
 * Usage:
 *   bun scripts/fetch-at-landesrecht.ts [--skip-text] [--target N]
 *
 * RIS-OGD API: https://data.bka.gv.at/ris/api/v2.6/Landesrecht
 * No auth required (public OGD).
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { dump as yamlDump } from "js-yaml";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const RATE_LIMIT_MS = 200;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(_scriptDir, "..", "..", "law-corpus", "at-landesrecht");

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)" },
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

function extractContentUrl(ref: Record<string, unknown>): string {
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

function loadExistingIds(): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(OUT_DIR)) return ids;
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith(".md")) ids.add(f.replace(".md", ""));
  }
  return ids;
}

async function main() {
  const args = process.argv.slice(2);
  const skipText = args.includes("--skip-text");
  const targetIdx = args.indexOf("--target");
  const target = targetIdx >= 0 ? parseInt(args[targetIdx + 1], 10) : 11867;

  mkdirSync(OUT_DIR, { recursive: true });
  const existing = loadExistingIds();

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  AT Landesrecht — Full Scan`);
  console.log(`  Existing: ${existing.size} files | API total: ~11.867`);
  console.log(`  Target: ${target} | Skip text: ${skipText}`);
  console.log(`  Output: ${OUT_DIR}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  let written = 0;
  let skipped = 0;
  let totalFetched = 0;

  for (let page = 1; page <= 500; page++) {
    if (totalFetched >= target) break;

    const url = new URL(`${RIS_BASE}/Landesrecht`);
    url.searchParams.set("DokumenteProSeite", "OneHundred");
    url.searchParams.set("Seitennummer", String(page));

    let data: any;
    try {
      const res = await fetchWithRetry(url.toString());
      if (!res.ok) {
        console.error(`  Page ${page}: HTTP ${res.status}`);
        break;
      }
      data = await res.json();
    } catch (err) {
      console.error(`  Page ${page} failed: ${err}`);
      break;
    }

    const refs = data?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference ?? [];
    if (refs.length === 0) break;

    for (const ref of refs) {
      if (totalFetched >= target) break;
      totalFetched++;

      const meta = ref?.Data?.Metadaten ?? {};
      const tech = meta?.Technisch ?? {};
      const allgemein = meta?.Allgemein ?? {};
      const lr = meta?.Landesrecht ?? {};

      const id = tech?.ID ?? `lr-${totalFetched}`;
      const title = lr?.Kurztitel ?? lr?.Langtitel ?? id;
      const docUrl = allgemein?.DokumentUrl ?? "";
      const organ = tech?.Organ ?? "";

      const fileKey = slugify(id);
      if (existing.has(fileKey)) {
        skipped++;
        continue;
      }
      existing.add(fileKey);

      let text = "";
      if (!skipText) {
        const contentUrl = extractContentUrl(ref);
        if (contentUrl) {
          try {
            const res = await fetchWithRetry(contentUrl);
            if (res.ok) {
              text = stripHtmlSimple(await res.text());
            }
          } catch {}
        }
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      }

      const frontmatter = yamlDump(
        {
          type: "state_legislation",
          jurisdiction: "at",
          title: title.slice(0, 200),
          source: "ris-ogd",
          source_url: docUrl,
          organ,
          retrieved_at: new Date().toISOString().slice(0, 10),
        },
        { lineWidth: -1, noRefs: true }
      ).trimEnd();

      const body = text || "*Volltext nicht abrufbar — siehe Quelle.*";
      const md = `---
${frontmatter}
---

# ${title.slice(0, 200)}

${body}

---
*Quelle: [RIS-OGD](${docUrl})*
`;

      writeFileSync(join(OUT_DIR, `${fileKey}.md`), md, "utf-8");
      written++;

      if (written % 100 === 0) {
        console.log(`  [${written}] ${id} — ${title.slice(0, 60)}`);
      }
    }

    console.log(`  Page ${page}: ${refs.length} refs (total written: ${written})`);
    if (refs.length < 100) break;
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  SUMMARY: ${written} written, ${skipped} skipped, ${existing.size - written} pre-existing`);
  console.log(`═══════════════════════════════════════════════════════════`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
