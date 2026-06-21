#!/usr/bin/env bun
/**
 * Import EU statutes from law-corpus/eu/ into the running brain via HTTP API.
 * Splits each law into per-§ pages (like import-statutes-split.ts) but posts
 * to the running engine instead of connecting to the DB directly — so the
 * AI gateway (embeddings) works.
 *
 * Usage:
 *   bun run server/scripts/import-eu-statutes-http.ts \
 *     [--engine http://localhost:3001] [--key API_KEY] [--source law-eu] [--dry-run]
 */
import { join } from "path";
import { splitStatute } from "../src/core/legal/split-statute.ts";

const ENGINE =
  (Bun.argv.includes("--engine") ? Bun.argv[Bun.argv.indexOf("--engine") + 1] : null) ??
  process.env.SUBSUMIO_API_URL ??
  "http://localhost:3001";
const KEY =
  (Bun.argv.includes("--key") ? Bun.argv[Bun.argv.indexOf("--key") + 1] : null) ??
  process.env.SUBSUMIO_WEB_API_KEY ??
  "";
const SOURCE =
  (Bun.argv.includes("--source") ? Bun.argv[Bun.argv.indexOf("--source") + 1] : null) ?? "law-eu";
const DRY = Bun.argv.includes("--dry-run");

const CORPUS = join(import.meta.dir, "..", "..", "law-corpus");

const EU_FILES = [
  { file: "eu/dsgvo.md", abbr: "dsgvo" },
  { file: "eu/dsrl.md", abbr: "dsrl" },
  { file: "eu/eprivacy.md", abbr: "eprivacy" },
  { file: "eu/romi.md", abbr: "romi" },
  { file: "eu/romii.md", abbr: "romii" },
  { file: "eu/brusselsibis.md", abbr: "brusselsibis" },
  { file: "eu/euco.md", abbr: "euco" },
];

function yamlEscape(v: string): string {
  return JSON.stringify(v);
}

function sectionPage(
  abbr: string,
  meta: {
    abbreviation?: string;
    title?: string;
    version_date?: string;
    source_url?: string;
    license?: string;
  },
  section: { marker: string; ref: string; title: string; body: string }
): string {
  const heading = `${section.marker} ${section.ref} ${meta.abbreviation || abbr.toUpperCase()}`;
  const fm: Record<string, string> = {
    type: "law",
    jurisdiction: "eu",
    abbreviation: meta.abbreviation || abbr.toUpperCase(),
    statute: meta.title || abbr,
    paragraph: section.ref,
  };
  if (meta.version_date) fm.version_date = meta.version_date;
  if (meta.source_url) fm.source_url = meta.source_url;
  if (meta.license) fm.license = meta.license;
  const front = `---\n${Object.entries(fm)
    .map(([k, v]) => `${k}: ${yamlEscape(v)}`)
    .join("\n")}\n---\n`;
  return `${front}\n# ${heading}\n\n${section.body}\n`;
}

async function ensureSource() {
  if (DRY || !KEY) return;
  const res = await fetch(`${ENGINE}/api/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-subsumio-api-key": KEY },
    body: JSON.stringify({ id: SOURCE, name: SOURCE }),
  });
  if (res.ok) console.log(`  Source '${SOURCE}' ensured`);
  else if (res.status === 409) console.log(`  Source '${SOURCE}' already exists`);
  else console.log(`  Source ensure: ${res.status} (continuing)`);
}

async function importPage(slug: string, content: string, title: string): Promise<boolean> {
  if (DRY) return true;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-subsumio-api-key": KEY,
  };
  const res = await fetch(`${ENGINE}/api/pages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ slug, title, content, type: "law", tags: ["statute", "eu"] }),
  });
  if (res.ok) return true;
  if (res.status === 409) return true; // already exists
  const body = await res.text().catch(() => `HTTP ${res.status}`);
  console.error(`  ❌ ${slug}: ${res.status} ${body.slice(0, 150)}`);
  return false;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — EU Gesetze-Import (pro §, via HTTP API)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Engine: ${ENGINE} | Source: ${SOURCE} | Mode: ${DRY ? "DRY-RUN" : "live"}`);
  console.log("");

  await ensureSource();

  let total = 0;
  let ok = 0;
  let errors = 0;

  for (const sf of EU_FILES) {
    const path = join(CORPUS, sf.file);
    let raw: string;
    try {
      raw = await Bun.file(path).text();
    } catch {
      console.error(`  ❌ ${sf.file}: not found`);
      errors++;
      continue;
    }

    const { meta, sections } = splitStatute(raw);
    if (sections.length === 0) {
      console.error(`  ⚠️  ${sf.file}: 0 sections parsed`);
      continue;
    }

    let lawOk = 0;
    for (const section of sections) {
      const slug = `legal/statutes/eu/${sf.abbr}/${section.id}`;
      const page = sectionPage(sf.abbr, meta, section);
      const title = `${section.marker} ${section.ref} ${meta.abbreviation || sf.abbr.toUpperCase()}`;
      total++;
      if (await importPage(slug, page, title)) {
        lawOk++;
        ok++;
      } else {
        errors++;
      }
    }
    console.log(
      `  ${lawOk === sections.length ? "✅" : "⚠️"}  eu/${sf.abbr}: ${lawOk}/${sections.length} §-pages`
    );
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  GESAMT: ${ok}/${total} §-Seiten importiert, ${errors} Fehler`);
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
