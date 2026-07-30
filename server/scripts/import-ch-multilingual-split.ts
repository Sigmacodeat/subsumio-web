#!/usr/bin/env bun
/**
 * Import CH multilingual (FR/IT) statutes split per article into the DB.
 *
 * Uses the same splitStatute() as the DE/AT/CH importer, but bypasses the
 * jurisdiction validation that only allows at/de/ch/eu. The FR/IT files
 * use the same odat.ch `Art. N` heading format as the German CH corpus.
 *
 * Slug pattern: legal/statutes/ch-fr/{abbr}/art-{N}
 *               legal/statutes/ch-it/{abbr}/art-{N}
 *
 * Usage:
 *   bun run scripts/import-ch-multilingual-split.ts [--no-embed] [--lang fr|it|both]
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");

const args = process.argv.slice(2);
const NO_EMBED = args.includes("--no-embed");
const langIdx = args.indexOf("--lang");
const LANG_FILTER = langIdx !== -1 ? args[langIdx + 1] : "both";

const CORPUS = join(__dirname, "..", "..", "law-corpus");

const FILES: Array<{ file: string; abbr: string; lang: "fr" | "it" }> = [
  { file: "ch-fr/or.md", abbr: "or", lang: "fr" },
  { file: "ch-fr/zgb.md", abbr: "zgb", lang: "fr" },
  { file: "ch-fr/stgb.md", abbr: "stgb", lang: "fr" },
  { file: "ch-fr/stpo.md", abbr: "stpo", lang: "fr" },
  { file: "ch-fr/zpo.md", abbr: "zpo", lang: "fr" },
  { file: "ch-it/or.md", abbr: "or", lang: "it" },
  { file: "ch-it/zgb.md", abbr: "zgb", lang: "it" },
  { file: "ch-it/stgb.md", abbr: "stgb", lang: "it" },
  { file: "ch-it/stpo.md", abbr: "stpo", lang: "it" },
  { file: "ch-it/zpo.md", abbr: "zpo", lang: "it" },
];

async function main() {
  const { splitStatute } = await import("../src/core/legal/split-statute.ts");
  const { importFromContent } = await import("../src/core/import-file.ts");
  const { loadConfig } = await import("../src/core/config.ts");
  const { PostgresEngine } = await import("../src/core/postgres-engine.ts");

  const config = loadConfig();
  if (!config?.database_url) {
    console.error("FATAL: No DATABASE_URL in config or env");
    process.exit(1);
  }

  const engine = new PostgresEngine();
  await engine.connect({ database_url: config.database_url });
  await engine.executeRaw("SET statement_timeout = 0");

  // Ensure sources exist
  for (const lang of ["fr", "it"]) {
    if (LANG_FILTER !== "both" && LANG_FILTER !== lang) continue;
    const sourceId = `law-ch-${lang}`;
    await engine.executeRaw(
      `INSERT INTO sources (id, name, jurisdiction, config)
       VALUES ($1, $1, 'ch', jsonb_build_object('federated', true, 'legal_reference', true, 'jurisdiction', 'ch'))
       ON CONFLICT (id) DO NOTHING`,
      [sourceId]
    );
  }

  const selected = FILES.filter((f) => LANG_FILTER === "both" || f.lang === LANG_FILTER);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  CH Multilingual Split Import (per-Article)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Files: ${selected.length}, Embed: ${NO_EMBED ? "NEIN" : "JA"}`);
  console.log("");

  let totalSections = 0;
  let totalErrors = 0;

  for (const sf of selected) {
    const path = join(CORPUS, sf.file);
    let raw: string;
    try {
      raw = await Bun.file(path).text();
    } catch {
      console.error(`  ❌ ${sf.file}: not found`);
      totalErrors++;
      continue;
    }

    const { meta, sections } = splitStatute(raw);
    const sourceId = `law-ch-${sf.lang}`;
    const jurSlug = `ch-${sf.lang}`;

    if (sections.length === 0) {
      console.error(`  ❌ ${sf.file}: no sections found by splitter`);
      totalErrors++;
      continue;
    }

    let ok = 0;
    let skipped = 0;
    for (const section of sections) {
      const slug = `legal/statutes/${jurSlug}/${sf.abbr}/${section.id}`;
      const heading = `${section.marker} ${section.ref} ${meta.abbreviation || sf.abbr.toUpperCase()}`;
      const title = section.title ? `${heading} — ${section.title}` : heading;
      const fm: Record<string, string> = {
        title: title,
        type: "law",
        jurisdiction: jurSlug,
        abbreviation: meta.abbreviation || sf.abbr.toUpperCase(),
        paragraph: section.ref,
        statute: meta.title || sf.abbr,
      };
      if (meta.version_date) fm.version_date = meta.version_date;
      if (meta.source_url) fm.source_url = meta.source_url;
      if (meta.license) fm.license = meta.license;
      const front = `---\n${Object.entries(fm)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n")}\n---\n`;
      const pageContent = `${front}\n# ${heading}\n\n${section.body}\n`;

      try {
        const result = await importFromContent(engine, slug, pageContent, {
          noEmbed: NO_EMBED,
          sourceId,
          skipContentDuplicates: true,
        });
        if (result.status === "imported") ok++;
        else if (result.status === "skipped") skipped++;
        else {
          totalErrors++;
          console.error(`  ❌ ${slug}: ${result.error || result.status}`);
        }
      } catch (e) {
        totalErrors++;
        console.error(`  ❌ ${slug}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    totalSections += ok;
    console.log(
      `  ✅ ${jurSlug}/${sf.abbr}: ${ok}/${sections.length} articles${skipped > 0 ? ` (${skipped} skipped)` : ""}`
    );
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  GESAMT: ${totalSections} article-pages imported, ${totalErrors} errors`);
  console.log("═══════════════════════════════════════════════════════════");

  await engine.disconnect?.();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
