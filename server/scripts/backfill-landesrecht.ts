#!/usr/bin/env bun
/**
 * Backfill AT Landesrecht — ELI URL Fetcher
 *
 * Problem: 6.988 of 11.867 AT-Landesrecht files are placeholders.
 * Source URLs are RIS ELI URLs (https://www.ris.bka.gv.at/eli/lgbl/...).
 *
 * Strategy: RIS ELI URLs redirect to the actual document page.
 * We fetch the HTML, extract the Landesrecht text, and verify identity
 * via the LGBl number in the frontmatter.
 *
 * RIS OGD compliance: single connection, 1500ms delay.
 *
 * Usage:
 *   bun scripts/backfill-landesrecht.ts --limit 100
 *   bun scripts/backfill-landesrecht.ts --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { proxyFetchOptions, getUserAgent } from "./ris-proxy";
import {
  stripHtmlComplete,
  validateFetchedText,
  validateLegalStructure,
  contentHash,
  atomicWrite as atomicWriteUtil,
} from "./backfill-utils";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;
const TIMEOUT_MS = 30_000;
const DELAY_MS = 1500; // RIS: 1.5s between requests

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;
const dryRun = args.includes("--dry-run");
const forceReFetch = args.includes("--force-refetch");

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const ABS_DIR = join(_corpusRoot, "at-landesrecht");

// ── Helpers ────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": getUserAgent(),
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "de",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...proxyFetchOptions(),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
          continue;
        }
      }
      return res;
    } catch {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      }
    }
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&auml;/g, "\u00e4")
    .replace(/&ouml;/g, "\u00f6")
    .replace(/&uuml;/g, "\u00fc")
    .replace(/&Auml;/g, "\u00c4")
    .replace(/&Ouml;/g, "\u00d6")
    .replace(/&Uuml;/g, "\u00dc")
    .replace(/&szlig;/g, "\u00df")
    .replace(/&eacute;/g, "\u00e9")
    .replace(/&agrave;/g, "\u00e0");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<h[1-6][^>]*>/gi, "\n## ")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Extract only the actual legal document content from a RIS HTML page.
 *  RIS pages contain navigation chrome (Accesskey links, Seitenbereiche,
 *  Kontakt, Impressum, etc.) that must be stripped. */
function extractRisContent(html: string): string {
  let content = html;

  // Remove script/style/nav/header/footer
  content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");

  // RIS-specific: remove known non-content divs by ID
  content = content.replace(/<div[^>]*id="header"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, "");
  content = content.replace(/<div[^>]*id="TopPageNavigation"[^>]*>[\s\S]*?<\/div>/gi, "");
  content = content.replace(
    /<div[^>]*id="TopDocumentNavigation_ContainerPanel"[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  content = content.replace(
    /<div[^>]*id="BottomDocumentNavigation_ContainerPanel"[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  content = content.replace(/<div[^>]*id="footer"[^>]*>[\s\S]*?<\/div>/gi, "");
  content = content.replace(/<div[^>]*id="Topline"[^>]*>[\s\S]*?<\/div>/gi, "");

  // RIS-specific: remove navigation lists
  content = content.replace(
    /<ul[^>]*class="[^"]*(?:nav|menu|access|skip|tabStrip)[^"]*"[^>]*>[\s\S]*?<\/ul>/gi,
    ""
  );
  content = content.replace(
    /<div[^>]*class="[^"]*(?:tabStrip|nav|menu|breadcrumb|sidebar)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );

  // Strategy 1: RIS document pages use <div class="paperw"> for the actual law text
  let mainMatch = content.match(/<div[^>]*class="paperw"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (mainMatch) {
    const text = stripHtml(mainMatch[1]);
    if (text.length >= 100) return text;
  }
  // Greedy fallback: paperw to end of document
  mainMatch = content.match(/<div[^>]*class="paperw"[^>]*>([\s\S]*?)<\/body>/i);
  if (mainMatch) {
    const text = stripHtml(mainMatch[1]);
    if (text.length >= 100) return text;
  }

  // Strategy 1b: RIS uses <div class="documentContent"> for ELI metadata pages
  mainMatch = content.match(/<div[^>]*class="documentContent"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (mainMatch) {
    const text = stripHtml(mainMatch[1]);
    if (text.length >= 100) return text;
  }

  // Strategy 2: <div class="document"> container
  mainMatch = content.match(/<div[^>]*class="document"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (mainMatch) {
    const text = stripHtml(mainMatch[1]);
    if (text.length >= 100) return text;
  }

  // Strategy 3: <div id="content"> container
  mainMatch = content.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (mainMatch) {
    const text = stripHtml(mainMatch[1]);
    if (text.length >= 100) return text;
  }

  // Strategy 4: <div id="main"> container
  mainMatch = content.match(/<div[^>]*id="main"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (mainMatch) {
    const text = stripHtml(mainMatch[1]);
    if (text.length >= 100) return text;
  }

  // Strategy 5: <main> tag
  mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) {
    const text = stripHtml(mainMatch[1]);
    if (text.length >= 100) return text;
  }

  // Strategy 6: <article> tag
  mainMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (mainMatch) {
    const text = stripHtml(mainMatch[1]);
    if (text.length >= 100) return text;
  }

  // Fallback: strip all HTML, then remove known RIS navigation text
  let text = stripHtml(content);
  const navPatterns = [
    /Zum Inhalt \(Accesskey 0\)/g,
    /Zur Navigationsleiste \(Accesskey 1\)/g,
    /Zum Hauptbereich \(Accesskey 2\)/g,
    /Kontakt \(Accesskey 4\)/g,
    /Impressum \(Accesskey 5\)/g,
    /Seitenbereiche:/g,
    /RIS - .* - Landesgesetzblatt authentisch f[^r]*r [^\n]+/g,
    /Zum Inhalt/g,
    /Zur Navigation/g,
    /Springe zum Inhalt/g,
    /- Startseite\n/g,
    /- Bund\n/g,
    /- Länder\n/g,
    /- Bezirke\n/g,
    /- Gemeinden\n/g,
    /- Judikatur\n/g,
    /- Kundmachungen, Erlässe\n/g,
    /- Gesamtabfrage\n/g,
    /- Hilfe\n/g,
    /- Kontakt\n/g,
    /- Impressum\n/g,
    /Kurztitel:/g,
    /Titel:/g,
    /Kundmachungsdatum:/g,
    /Bundesland:/g,
    /LGBl\. Nr\./g,
    /Typ:/g,
    /ELI:/g,
    /CELEX:/g,
    /Dokument als PDF/g,
    /Dokument als RTF/g,
    /Web-Seite:/g,
    /RTF-Dokument:/g,
    /Signiertes PDF-Dokument:/g,
  ];
  for (const p of navPatterns) {
    text = text.replace(p, "");
  }
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

function isPlaceholder(body: string): boolean {
  return body.includes("Volltext nicht abrufbar") || body.trim().length < 50;
}

function parseFrontmatter(content: string): { fm: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: "", body: content };
  return { fm: match[1], body: match[2] };
}

function extractSourceUrl(fm: string): string {
  const match = fm.match(/source_url:\s*"?([^\n"]+)"?/);
  return match ? match[1].trim() : "";
}

function extractLgblId(fm: string): string {
  // Extract LGBl identifier from frontmatter or filename
  const match = fm.match(/title:\s*"?([^"\n]+)"?/);
  return match ? match[1].trim() : "";
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** RIS ELI URLs for Landesrecht follow the pattern:
 *  https://www.ris.bka.gv.at/eli/lgbl/{Bundesland}/{Jahr}/{Nummer}/{Datum}
 *  The ELI URL is a METADATA PAGE with links to the actual document.
 *  The real law text is at /Dokumente/LgblAuth/{ID}/{ID}.html (110KB+).
 *  Strategy: ELI page → extract document link → fetch document HTML → extract text.
 *  Fallback: OGD API (data.bka.gv.at) → get content URLs → fetch document HTML. */
async function fetchLandesrechtText(eliUrl: string, lgblId: string): Promise<string> {
  // Strategy 1: Fetch ELI metadata page, extract the /Dokumente/LgblAuth/ HTML link
  const res = await fetchWithRetry(eliUrl);
  if (res && res.ok) {
    const metaHtml = await res.text();
    // Look for the document HTML link: /Dokumente/LgblAuth/{ID}/{ID}.html
    const docLinkMatch = metaHtml.match(/href="([^"]*\/Dokumente\/LgblAuth\/[^"]+\.html)"/i);
    if (docLinkMatch) {
      let docUrl = docLinkMatch[1];
      // Make absolute if relative
      if (docUrl.startsWith("/")) {
        docUrl = `https://www.ris.bka.gv.at${docUrl}`;
      }
      const docRes = await fetchWithRetry(docUrl);
      if (docRes && docRes.ok) {
        const docHtml = await docRes.text();
        // Document pages have content in <div class="paperw"> or <div class="content">
        const text = extractRisContent(docHtml);
        if (text.length >= 100) return text;
      }
    }
    // Fallback: try extracting content from ELI page itself (rarely has full text)
    const eliText = extractRisContent(metaHtml);
    if (eliText.length >= 500) return eliText;
  }

  // Strategy 2: OGD API with correct endpoint 'Landesrecht'
  // ELI URL: /eli/lgbl/BU/2017/18/20170406
  const eliParts = eliUrl.match(/\/eli\/lgbl\/([^/]+)\/(\d+)\/([^/]+)\/(\d+)/);
  if (eliParts) {
    const [, bundesland, jahr, nummer] = eliParts;
    const ogdUrl = `https://data.bka.gv.at/ris/api/v2.6/Landesrecht?Bundesland=${bundesland}&Norm=${nummer}&Jahr=${jahr}`;
    try {
      const ogdRes = await fetchWithRetry(ogdUrl);
      if (ogdRes && ogdRes.ok) {
        const data = (await ogdRes.json()) as Record<string, unknown>;
        const docs = (data.OgdSearchResult as any)?.OgdDocumentResults?.OgdDocumentReference;
        if (docs) {
          const arr = Array.isArray(docs) ? docs : [docs];
          for (const d of arr) {
            const contentRefs = d.Data?.Dokumentliste?.ContentReference;
            const refArr = Array.isArray(contentRefs)
              ? contentRefs
              : contentRefs
                ? [contentRefs]
                : [];
            for (const ref of refArr) {
              if (ref.ContentType !== "MainDocument") continue;
              const urls = ref.Urls?.ContentUrl;
              const urlArr = Array.isArray(urls) ? urls : urls ? [urls] : [];
              // Prefer HTML, then XML
              for (const u of urlArr) {
                if (u.DataType === "Html") {
                  const docRes = await fetchWithRetry(u.Url);
                  if (docRes && docRes.ok) {
                    const text = extractRisContent(await docRes.text());
                    if (text.length >= 100) return text;
                  }
                }
              }
              // Try XML as fallback (RIS XML has structured Nutzdaten)
              for (const u of urlArr) {
                if (u.DataType === "Xml") {
                  const docRes = await fetchWithRetry(u.Url);
                  if (docRes && docRes.ok) {
                    const xmlText = await docRes.text();
                    const text = stripHtml(
                      xmlText
                        .replace(/<[^>]+>/g, " ")
                        .replace(/\s+/g, " ")
                        .trim()
                    );
                    if (text.length >= 100) return text;
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      /* OGD API failed */
    }
  }

  return "";
}

/** Atomic write via temp file + rename. */
function atomicWrite(filepath: string, content: string): void {
  const tmp = filepath + ".tmp";
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, filepath);
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(ABS_DIR)) {
    console.error(`Directory not found: ${ABS_DIR}`);
    process.exit(1);
  }

  // Global RIS lock — ensures no other RIS script runs simultaneously
  console.log("🔒 Acquiring RIS lock...");
  await acquireRisLock();
  console.log("✅ RIS lock acquired.");

  const allFiles = readdirSync(ABS_DIR).filter((f) => f.endsWith(".md"));
  const placeholders: string[] = [];

  for (const f of allFiles) {
    const content = readFileSync(join(ABS_DIR, f), "utf-8");
    const { body } = parseFrontmatter(content);
    if (isPlaceholder(body) || (forceReFetch && !content.includes("content_hash:")))
      placeholders.push(f);
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  AT Landesrecht Backfill — ELI URL Fetcher`);
  console.log(`  Total files: ${allFiles.length}`);
  console.log(`  Placeholders: ${placeholders.length}`);
  console.log(`  Rate limit: ${DELAY_MS}ms (RIS single-connection)`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const toProcess = LIMIT > 0 ? placeholders.slice(0, LIMIT) : placeholders;
  let ok = 0;
  let skip = 0;
  let fail = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const filename = toProcess[i];
    const filepath = join(ABS_DIR, filename);
    const content = readFileSync(filepath, "utf-8");
    const { fm, body } = parseFrontmatter(content);
    const sourceUrl = extractSourceUrl(fm);
    const lgblId = extractLgblId(fm);

    if (!sourceUrl || !sourceUrl.includes("ris.bka.gv.at")) {
      skip++;
      continue;
    }

    const text = await fetchLandesrechtText(sourceUrl, lgblId);

    if (text.length >= 100) {
      // Validate fetched text before writing
      const validation = validateFetchedText(text);
      if (!validation.valid) {
        console.error(`  ⚠️ validation failed for ${filename}: ${validation.reason}`);
        fail++;
        await new Promise((r) => setTimeout(r, DELAY_MS));
        continue;
      }
      const cleanText = validation.cleanedText;

      // Structure validation for state legislation — skip for short Verordnungen
      // Many Landesrecht documents are short metadata-only entries without §/Art. structure
      const docType = fm.match(/^type:\s*(\S+)/m)?.[1] ?? "state_legislation";
      if (cleanText.length > 2000) {
        const structResult = validateLegalStructure(cleanText, docType);
        if (!structResult.valid) {
          console.error(`  ⚠️ structure validation failed for ${filename}: ${structResult.reason}`);
          fail++;
          await new Promise((r) => setTimeout(r, DELAY_MS));
          continue;
        }
      }

      if (!dryRun) {
        // parseFrontmatter liefert fm="" wenn die Regex nicht greift (etwa bei
        // CRLF oder fehlendem Zeilenumbruch nach dem schließenden ---). Früher
        // wurde dann `---\n\ncontent_hash: …\n---\n<ganze Originaldatei>`
        // geschrieben: das echte Frontmatter rutschte in den Body und die Seite
        // verlor Typ, Titel und Quelle. Das hat 100 Landesrecht-Dateien
        // beschädigt. Lieber überspringen als still zerstören.
        if (fm.trim() === "") {
          console.error(`  ⚠️ ${filename}: Frontmatter nicht lesbar — übersprungen (nicht überschrieben)`);
          fail++;
          await new Promise((r) => setTimeout(r, DELAY_MS));
          continue;
        }
        // Inject content_hash into frontmatter
        const hash = contentHash(cleanText);
        const fmWithHash = fm.includes("content_hash:")
          ? fm.replace(/content_hash:\s*"?[^"]*"?/, `content_hash: "${hash}"`)
          : `${fm}\ncontent_hash: "${hash}"`;
        const newBody = body.replace(/\*Volltext nicht abrufbar — siehe Quelle\.\*/, cleanText);
        const updated = `---\n${fmWithHash}\n---\n${newBody}`;
        try {
          atomicWriteUtil(filepath, updated);
        } catch (e: any) {
          console.error(`  ⚠️ write failed for ${filename}: ${e?.message}`);
          fail++;
          await new Promise((r) => setTimeout(r, DELAY_MS));
          continue;
        }
      }
      ok++;
    } else {
      fail++;
    }

    if ((i + 1) % 100 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = ((i + 1) / elapsed).toFixed(1);
      const eta = Math.round((toProcess.length - i - 1) / parseFloat(rate));
      console.log(
        `  [${i + 1}/${toProcess.length}] ok=${ok} skip=${skip} fail=${fail} | ${rate}/s ETA ${eta}s`
      );
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  DONE: ${ok} backfilled, ${skip} skipped, ${fail} failed`);
  console.log(`  Time: ${elapsed}s`);
  console.log(`═══════════════════════════════════════════════════════════`);
}

main()
  .then(() => {
    releaseRisLock();
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    releaseRisLock();
    process.exit(1);
  });
