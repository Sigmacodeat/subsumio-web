#!/usr/bin/env bun
/**
 * Clean AT Landesrecht files — remove RIS HTML navigation noise.
 *
 * Problem: 11.867 of 15.216 files contain RIS navigation boilerplate
 * (Accesskey, Navigationsleiste, Seitenbereiche, etc.) mixed with
 * actual legal content. This script strips the noise lines.
 *
 * Usage:
 *   bun scripts/clean-landesrecht.ts [--dry-run] [--limit N]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const DIR = join(_corpusRoot, "at-landesrecht");

const NOISE_PATTERNS = [
  /^(Zum Inhalt|Zur Navigationsleiste|Kontakt|Impressum|Datenschutzerkl|Barrierefreiheitserkl|Sitemap|English|Seitenbereiche|Navigationsleiste|Startseite|Bund|Länder|Bezirke|Gemeinden|Judikatur|Kundmachungen|Gesamtabfrage|Druckansicht|Navigation im Suchergebnis|Zum Seitenanfang|Über diese Seite)\b/,
  /Accesskey\s*[0-9A-Z]/i,
  /^\.\s*$/,
  /^RIS - .* - Landesgesetzblatt authentisch/i,
  /^-\s+(Startseite|Bund|Länder|Bezirke|Gemeinden|Judikatur|Kundmachungen|Gesamabfrage|Gesamtabfrage|Hilfe|Kontakt|Impressum)\s*$/,
  /^Hauptdokument$/,
  /^Anlagen$/,
  /^Anlage \d+$/,
  /^Begleitende Dokumente$/,
  /^Landesgesetzblatt authentisch/i,
  /^Kurztitel$/,
  /^Titel$/,
  /^Dokumentnummer$/,
  /^European Legislation Identifier/i,
  /^Typ$/,
  /^Kundmachungsorgan$/,
  /^Kundmachungsdatum$/,
  /^Bundesland$/,
  /^Inkrafttretensdatum$/,
  /^Außerkrafttretensdatum$/,
  /^Index$/,
  /^Gesetzesnummer$/,
  /^§\/Artikel\/Anlage$/,
  /^Text$/,
  /^Zuletzt aktualisiert am$/,
  /^LGBl\. Nr\./,
  /^Datum der Kundmachung$/,
  /^Web-Seite:$/,
  /^RTF-Dokument:$/,
  /^Signiertes PDF-Dokument:$/,
  /^Dokument als PDF$/,
  /^Dokument als RTF$/,
];

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&auml;/g, "\u00e4")
    .replace(/&ouml;/g, "\u00f6")
    .replace(/&uuml;/g, "\u00fc")
    .replace(/&Auml;/g, "\u00c4")
    .replace(/&Ouml;/g, "\u00d6")
    .replace(/&Uuml;/g, "\u00dc")
    .replace(/&szlig;/g, "\u00df")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanBody(body: string): string {
  // First decode HTML entities
  body = decodeHtmlEntities(body);
  const lines = body.split("\n");
  const cleaned: string[] = [];
  let skipSection = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip empty lines but preserve them for structure
    if (!trimmed) {
      // Don't add multiple consecutive empty lines
      if (cleaned.length > 0 && cleaned[cleaned.length - 1] !== "") {
        cleaned.push("");
      }
      continue;
    }

    // Check if line matches any noise pattern
    let isNoise = false;
    for (const pattern of NOISE_PATTERNS) {
      if (pattern.test(trimmed)) {
        isNoise = true;
        break;
      }
    }

    if (isNoise) continue;

    // Skip the "*Quelle: [RIS-OGD]*" footer line (keep it actually)
    // We want to keep this

    cleaned.push(lines[i]);
  }

  // Remove trailing empty lines
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === "") {
    cleaned.pop();
  }

  // Remove leading empty lines
  while (cleaned.length > 0 && cleaned[0].trim() === "") {
    cleaned.shift();
  }

  return cleaned.join("\n");
}

function parseFrontmatter(content: string): { fm: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: "", body: content };
  return { fm: match[1], body: match[2] };
}

function atomicWrite(filepath: string, content: string): void {
  const tmp = filepath + ".tmp";
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, filepath);
}

async function main() {
  if (!existsSync(DIR)) {
    console.error(`Directory not found: ${DIR}`);
    process.exit(1);
  }

  const allFiles = readdirSync(DIR).filter((f) => f.endsWith(".md"));
  const noisyFiles: string[] = [];

  for (const f of allFiles) {
    const content = readFileSync(join(DIR, f), "utf-8");
    if (/Accesskey|Navigationsleiste|Seitenbereiche/.test(content)) {
      noisyFiles.push(f);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  AT Landesrecht — HTML Noise Cleaner`);
  console.log(`  Total files: ${allFiles.length}`);
  console.log(`  Noisy files: ${noisyFiles.length}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Limit: ${LIMIT || "all"}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const toProcess = LIMIT > 0 ? noisyFiles.slice(0, LIMIT) : noisyFiles;
  let cleaned = 0;
  let unchanged = 0;
  let tooShort = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const filename = toProcess[i];
    const filepath = join(DIR, filename);
    const content = readFileSync(filepath, "utf-8");
    const { fm, body } = parseFrontmatter(content);

    const cleanedBody = cleanBody(body);

    // Check if cleaning actually removed noise
    const hadNoise = /Accesskey|Navigationsleiste|Seitenbereiche/.test(body);
    const hasNoise = /Accesskey|Navigationsleiste|Seitenbereiche/.test(cleanedBody);

    if (hadNoise && !hasNoise && cleanedBody.trim().length >= 50) {
      if (!dryRun) {
        const updated = `---\n${fm}\n---\n${cleanedBody}\n`;
        atomicWrite(filepath, updated);
      }
      cleaned++;
    } else if (cleanedBody.trim().length < 50) {
      // After cleaning, too little content remains — mark as placeholder
      if (!dryRun) {
        const updated = `---\n${fm}\n---\n\n# ${filename.replace(".md", "")}\n\n*Volltext nicht abrufbar — siehe Quelle.*\n\n---\n*Quelle: [RIS-OGD](https://www.ris.bka.gv.at)*\n`;
        atomicWrite(filepath, updated);
      }
      tooShort++;
    } else {
      unchanged++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(
        `  [${i + 1}/${toProcess.length}] cleaned=${cleaned} unchanged=${unchanged} tooShort=${tooShort}`
      );
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(
    `  DONE: ${cleaned} cleaned, ${unchanged} unchanged, ${tooShort} tooShort→placeholder`
  );
  console.log(`═══════════════════════════════════════════════════════════`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
