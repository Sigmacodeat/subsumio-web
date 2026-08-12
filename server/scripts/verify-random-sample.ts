#!/usr/bin/env bun
/**
 * Verify Random Sample — Pick N random .md files from disk,
 * fetch the corresponding RIS XML, compare all 13 fields.
 *
 * Usage:
 *   bun run scripts/verify-random-sample.ts              # 10 files
 *   bun run scripts/verify-random-sample.ts --count 20    # 20 files
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "disk-dir": { type: "string", default: "/Users/msc/subsumio-web/law-corpus/at-normen" },
    count: { type: "string", default: "10" },
  },
  allowPositionals: false,
});

const DISK_DIR = values["disk-dir"] as string;
const COUNT = parseInt(values.count as string, 10);

/** Collect all .md files recursively. */
function collectMdFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string) {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (extname(name) === ".md") files.push(full);
    }
  }
  walk(dir);
  return files;
}

/** Pick N random items from array. */
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

async function verifyFile(path: string): Promise<{ pass: boolean; issues: string[]; nor: string; name: string }> {
  const content = readFileSync(path, "utf-8");
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { pass: false, issues: ["NO FRONTMATTER"], nor: "?", name: path };

  const fm = fmMatch[1];
  const nor = fm.match(/nor_id:\s*"([^"]+)"/)?.[1] || "";
  const statute = fm.match(/statute:\s*"([^"]+)"/)?.[1] || "";
  const paragraph = fm.match(/paragraph:\s*"([^"]+)"/)?.[1] || "";
  const name = `${statute} ${paragraph}`.trim();

  if (!nor) return { pass: false, issues: ["NO nor_id"], nor: "?", name };

  // Fetch RIS XML
  const url = `https://www.ris.bka.gv.at/Dokumente/Bundesnormen/${nor}/${nor}.xml`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!resp.ok) return { pass: false, issues: [`HTTP ${resp.status}`], nor, name };
    const xml = await resp.text();

    // Extract all ct fields from XML
    const xmlMeta: Record<string, string> = {};
    const re = /<ueberschrift typ="titel"[^>]*>([^<]+)<\/ueberschrift>\s*<absatz[^>]*ct="([^"]*)"[^>]*>([^<]*)<\/absatz>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      xmlMeta[m[2]] = m[3].trim();
    }

    // Compare each field
    const fields = [
      { ct: "kurztitel", fm: "statute" },
      { ct: "kundmachungsorgan", fm: "kundmachungsorgan" },
      { ct: "typ", fm: "typ" },
      { ct: "artikel_anlage", fm: "paragraph" },
      { ct: "ikra", fm: "inkrafttretensdatum" },
      { ct: "abkuerzung", fm: "abbreviation" },
      { ct: "index", fm: "indizes" },
      { ct: "schlagworte", fm: "schlagworte" },
      { ct: "anmerkung", fm: "anmerkung" },
      { ct: "geaendert", fm: "zuletzt_aktualisiert" },
      { ct: "gesnr", fm: "gesetzesnummer" },
      { ct: "doknr", fm: "nor_id" },
      { ct: "adoknr", fm: "alte_dokumentnummer" },
    ];

    const issues: string[] = [];
    for (const f of fields) {
      const xmlVal = xmlMeta[f.ct] || null;
      const fmRegex = new RegExp(f.fm + ':\\s*"([^"]*)"');
      const fmMatch2 = fm.match(fmRegex);
      const fmVal = fmMatch2 ? fmMatch2[1] : null;

      if (xmlVal && !fmVal) {
        issues.push(`${f.ct}: XML has, FM missing`);
      } else if (xmlVal && fmVal) {
        if (f.ct === "ikra") {
          const parts = xmlVal.split(".");
          const normalized = `${parts[2]}-${parts[1]}-${parts[0]}`;
          if (fmVal !== normalized) issues.push(`${f.ct}: XML=${xmlVal} FM=${fmVal}`);
        } else if (f.ct === "doknr") {
          if (fmVal !== xmlVal) issues.push(`${f.ct}: XML=${xmlVal} FM=${fmVal}`);
        } else if (f.ct === "index") {
          if (!fmVal.includes(xmlVal)) issues.push(`${f.ct}: XML=${xmlVal} FM=${fmVal}`);
        } else if (xmlVal !== fmVal) {
          // Truncate long values for display
          const x = xmlVal.slice(0, 50);
          const fv = fmVal.slice(0, 50);
          issues.push(`${f.ct}: XML='${x}' FM='${fv}'`);
        }
      }
    }

    return { pass: issues.length === 0, issues, nor, name };
  } catch (e) {
    return { pass: false, issues: [`FETCH ERROR: ${e}`], nor, name };
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  RANDOM SAMPLE VERIFICATION (${COUNT} files)`);
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("Collecting .md files...");
  const allFiles = collectMdFiles(DISK_DIR);
  console.log(`Found ${allFiles.length} files\n`);

  if (allFiles.length < COUNT) {
    console.log(`Only ${allFiles.length} files available (requested ${COUNT})`);
  }

  const sampleFiles = sample(allFiles, Math.min(COUNT, allFiles.length));
  console.log(`Verifying ${sampleFiles.length} random files...\n`);

  let passCount = 0;
  let failCount = 0;

  for (const file of sampleFiles) {
    const result = await verifyFile(file);
    if (result.pass) {
      console.log(`✓ ${result.name} (${result.nor}): 13/13 MATCH`);
      passCount++;
    } else {
      console.log(`✗ ${result.name} (${result.nor}): ${result.issues.join(" | ")}`);
      failCount++;
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passCount} PASS / ${failCount} FAIL / ${sampleFiles.length} TOTAL`);
  console.log("═══════════════════════════════════════════════════════════");

  if (failCount > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
