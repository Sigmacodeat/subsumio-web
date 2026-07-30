/**
 * CH Multilingual Corpus Import Script
 *
 * Downloads the key Swiss laws in French and Italian from odat.ch
 * and saves them as markdown files in law-corpus/ch-fr/ and law-corpus/ch-it/.
 *
 * odat.ch (Forma Legis) serves static HTML for all three Swiss official languages
 * (DE, FR, IT) with the same article structure. The German corpus already uses
 * odat.ch as its source. Fedlex.admin.ch is a JS SPA and cannot be scraped without
 * a headless browser.
 *
 * Key laws covered:
 *   OR  (SR 220)     — Obligationenrecht / Code des obligations / Codice delle obbligazioni
 *   ZGB (SR 210)     — Zivilgesetzbuch / Code civil / Codice civile
 *   StGB (SR 311.0)  — Strafgesetzbuch / Code pénal / Codice penale
 *   ZPO (SR 272)     — Zivilprozessordnung / Code de procédure civile / Codice di procedura civile
 *   StPO (SR 312.0)  — Strafprozessordnung / Code de procédure pénale / Codice di procedura penale
 *
 * Usage:
 *   bun run src/eval/import-ch-multilingual.ts [--language fr|it|both] [--laws or,zgb,stgb]
 *
 * Output:
 *   law-corpus/ch-fr/<law>.md
 *   law-corpus/ch-it/<law>.md
 *
 * License: Quelle: odat.ch (Forma Legis) — CC-BY-SA-4.0. Nicht-amtliche Veröffentlichung.
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

interface LawMapping {
  abbr: string;
  sr: string;
  titleFr: string;
  titleIt: string;
  ccYear: string;
  ccNumber: string;
}

const SWISS_LAWS: LawMapping[] = [
  {
    abbr: "or",
    sr: "220",
    ccYear: "1912",
    ccNumber: "1",
    titleFr: "Code des obligations",
    titleIt: "Codice delle obbligazioni",
  },
  {
    abbr: "zgb",
    sr: "210",
    ccYear: "1907",
    ccNumber: "7",
    titleFr: "Code civil",
    titleIt: "Codice civile",
  },
  {
    abbr: "stgb",
    sr: "311.0",
    ccYear: "1937",
    ccNumber: "1",
    titleFr: "Code pénal",
    titleIt: "Codice penale",
  },
  {
    abbr: "zpo",
    sr: "272",
    ccYear: "2010",
    ccNumber: "1",
    titleFr: "Code de procédure civile",
    titleIt: "Codice di procedura civile",
  },
  {
    abbr: "stpo",
    sr: "312.0",
    ccYear: "2007",
    ccNumber: "1",
    titleFr: "Code de procédure pénale",
    titleIt: "Codice di procedura penale",
  },
];

const ODAT_BASE = "https://www.odat.ch";
const VERSION_DATE = "20260101";

function parseArgs(argv: string[]): { language: string; laws: string[] } {
  let language = "both";
  let lawsStr = "";
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--language" && i + 1 < args.length) {
      language = args[++i];
    }
    if (args[i] === "--laws" && i + 1 < args.length) {
      lawsStr = args[++i];
    }
  }
  const laws = lawsStr ? lawsStr.split(",").map((l) => l.trim().toLowerCase()) : [];
  return { language, laws };
}

function buildOdatUrl(law: LawMapping, lang: "fr" | "it"): string {
  return `${ODAT_BASE}/${lang}/cc/${law.sr}-${VERSION_DATE}-${lang}.html`;
}

async function fetchOdatContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "fr,it",
      "User-Agent": "Subsumio-Corpus-Importer/1.0 (legal research platform)",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const html = await response.text();

  // Remove script/style/nav/header/footer/disclaimer
  const cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<dialog[^>]*>[\s\S]*?<\/dialog>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");

  // Convert HTML to text — preserve article structure
  const text = cleanHtml
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis, "\n\n## $1\n\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gis, "$1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gis, "- $1\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&ccedil;/g, "ç")
    .replace(/&uuml;/g, "ü")
    .replace(/&ouml;/g, "ö")
    .replace(/&auml;/g, "ä")
    .replace(/\n{3,}/g, "\n\n\n")
    .trim();

  return text;
}

function buildFrontmatter(abbr: string, sr: string, lang: string, title: string): string {
  return `---
title: "${title} (${abbr.toUpperCase()} — Schweiz)"
type: "law"
jurisdiction: "ch-${lang}"
abbreviation: "${abbr.toUpperCase()}"
language: "${lang}"
sr_number: "${sr}"
version_date: "2026-01-01"
retrieved_at: "${new Date().toISOString().slice(0, 10)}"
source: "odat.ch (Forma Legis)"
source_url: "${ODAT_BASE}/${lang}/cc/${sr}-${VERSION_DATE}-${lang}.html"
license: "Quelle: odat.ch (Forma Legis) — CC-BY-SA-4.0. Nicht-amtliche Veröffentlichung."
---

`;
}

async function importLaw(law: LawMapping, lang: "fr" | "it", corpusDir: string): Promise<boolean> {
  const url = buildOdatUrl(law, lang);
  const title = lang === "fr" ? law.titleFr : law.titleIt;

  process.stderr.write(
    `[ch-${lang}] Fetching ${law.abbr.toUpperCase()} (SR ${law.sr}) from ${url}...\n`
  );

  try {
    const content = await fetchOdatContent(url);

    if (content.length < 5000) {
      process.stderr.write(
        `[ch-${lang}] WARNING: Content too short (${content.length} chars) for ${law.abbr} — likely a 404 or disclaimer page\n`
      );
      return false;
    }

    const frontmatter = buildFrontmatter(law.abbr, law.sr, lang, title);
    const fullContent = frontmatter + content;

    const outDir = join(corpusDir);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    const outPath = join(outDir, `${law.abbr}.md`);
    writeFileSync(outPath, fullContent, "utf-8");

    process.stderr.write(
      `[ch-${lang}] Saved ${law.abbr.toUpperCase()} → ${outPath} (${content.length} chars)\n`
    );
    return true;
  } catch (err) {
    process.stderr.write(`[ch-${lang}] ERROR fetching ${law.abbr}: ${(err as Error)?.message}\n`);
    return false;
  }
}

async function main() {
  const opts = parseArgs(process.argv);

  const languages = opts.language === "both" ? ["fr", "it"] : [opts.language];
  const lawsToImport =
    opts.laws.length > 0 ? SWISS_LAWS.filter((l) => opts.laws.includes(l.abbr)) : SWISS_LAWS;

  process.stderr.write(
    `[ch-multilingual] Importing ${lawsToImport.length} laws in ${languages.join(", ")}\n`
  );

  let successCount = 0;
  let failCount = 0;

  for (const lang of languages) {
    const corpusDir = join(REPO_ROOT, "law-corpus", `ch-${lang}`);
    process.stderr.write(`\n[ch-${lang}] Output directory: ${corpusDir}\n`);

    for (const law of lawsToImport) {
      const ok = await importLaw(law, lang as "fr" | "it", corpusDir);
      if (ok) {
        successCount++;
      } else {
        failCount++;
      }

      // Be polite to the server
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  process.stderr.write(`\n[ch-multilingual] Done: ${successCount} imported, ${failCount} failed\n`);

  if (failCount > 0 && successCount === 0) {
    process.stderr.write(
      `[ch-multilingual] All imports failed — check network and odat.ch availability\n`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
