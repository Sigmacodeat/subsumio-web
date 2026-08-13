#!/usr/bin/env bun
/**
 * import-eu-corpus — import EU legislation from EUR-Lex into the brain.
 *
 * Each file is imported as a single page. Large files (>50K chars) are
 * split into per-Artikel sections via splitStatute().
 *
 * Usage:
 *   bun run server/scripts/import-eu-corpus.ts [--type regulation|directive|decision|caselaw|all]
 *                                              [--dry-run] [--no-embed] [--limit N] [--offset N]
 *
 * Sources created:
 *   law-eu-regulations — EU Verordnungen
 *   law-eu-directives  — EU Richtlinien
 *   law-eu-decisions   — EU Entscheidungen
 *   law-eu-caselaw     — EuGH Urteile
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { splitStatute } from "../src/core/legal/split-statute.ts";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const NO_EMBED = args.includes("--no-embed");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const offsetIdx = args.indexOf("--offset");
const OFFSET = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1], 10) : 0;
const typeIdx = args.indexOf("--type");
const TYPE_ARG = typeIdx >= 0 ? args[typeIdx + 1] : "all";

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = join(_scriptDir, "..", "..", "law-corpus", "eu");

const TYPE_CONFIGS: Record<
  string,
  { dir: string; sourceId: string; slugPrefix: string; label: string }
> = {
  regulation: {
    dir: "regulations",
    sourceId: "law-eu-regulations",
    slugPrefix: "legal/eu/regulations",
    label: "EU Verordnungen",
  },
  directive: {
    dir: "directives",
    sourceId: "law-eu-directives",
    slugPrefix: "legal/eu/directives",
    label: "EU Richtlinien",
  },
  decision: {
    dir: "decisions",
    sourceId: "law-eu-decisions",
    slugPrefix: "legal/eu/decisions",
    label: "EU Entscheidungen",
  },
  caselaw: {
    dir: "caselaw",
    sourceId: "law-eu-caselaw",
    slugPrefix: "legal/eu/caselaw",
    label: "EuGH Urteile",
  },
};

const SPLIT_THRESHOLD = 50_000;

const typesToRun =
  TYPE_ARG === "all" ? Object.keys(TYPE_CONFIGS) : TYPE_ARG.split(",").map((t) => t.trim());

interface CorpusFile {
  slug: string;
  /** Absolute path — content is read lazily per file. Materializing all
   *  ~160k regulation bodies up front OOM-killed the import (exit 137). */
  path: string;
  sourceId: string;
  label: string;
}

function loadFiles(): CorpusFile[] {
  const files: CorpusFile[] = [];
  let count = 0;

  for (const typeKey of typesToRun) {
    const cfg = TYPE_CONFIGS[typeKey];
    if (!cfg) {
      console.error(`Unknown type: ${typeKey}. Available: ${Object.keys(TYPE_CONFIGS).join(", ")}`);
      continue;
    }

    const dirPath = join(CORPUS_ROOT, cfg.dir);
    if (!existsSync(dirPath)) {
      console.log(`  Skipping ${typeKey}: directory not found`);
      continue;
    }

    const allFiles = readdirSync(dirPath)
      .filter((f) => f.endsWith(".md"))
      .sort();
    const dirFiles = allFiles.slice(OFFSET, OFFSET + LIMIT);
    for (const f of dirFiles) {
      const slug = `${cfg.slugPrefix}/${f.replace(/\.md$/, "")}`;
      files.push({
        slug,
        path: join(dirPath, f),
        sourceId: cfg.sourceId,
        label: `${typeKey}/${f}`,
      });
      count++;
    }
  }

  return files;
}

function trySplit(content: string): Array<{ slugSuffix: string; body: string }> | null {
  try {
    const { sections } = splitStatute(content);
    if (sections.length === 0) return null;
    return sections.map((s) => ({
      slugSuffix: s.id,
      body: `# ${s.marker} ${s.ref} — ${s.title}\n\n${s.body}`,
    }));
  } catch {
    return null;
  }
}

async function main() {
  const files = loadFiles();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — EU Corpus Import");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Types: ${typesToRun.join(", ")}`);
  console.log(`  Mode: ${DRY ? "DRY-RUN" : NO_EMBED ? "import, no-embed" : "import + embed"}`);
  if (OFFSET > 0) console.log(`  Offset: ${OFFSET}, Limit: ${LIMIT === Infinity ? "∞" : LIMIT}`);
  console.log(`  Gefunden: ${files.length} Dateien`);

  for (const typeKey of typesToRun) {
    const cfg = TYPE_CONFIGS[typeKey];
    if (!cfg) continue;
    const count = files.filter((f) => f.sourceId === cfg.sourceId).length;
    if (count > 0) console.log(`    ${cfg.label}: ${count}`);
  }
  console.log("");

  if (DRY) {
    let totalSections = 0;
    let wholeFiles = 0;
    let placeholders = 0;
    for (const f of files) {
      const content = readFileSync(f.path, "utf-8");
      if (content.includes("Volltext nicht abrufbar")) {
        placeholders++;
        continue;
      }
      if (content.length > SPLIT_THRESHOLD) {
        const split = trySplit(content);
        if (split && split.length > 1) {
          totalSections += split.length;
          continue;
        }
      }
      wholeFiles++;
      totalSections++;
    }
    console.log(
      `  Geschätzte Seiten: ${totalSections} (${wholeFiles} ganze Dateien + ${totalSections - wholeFiles} Sections)`
    );
    console.log(`  Placeholder (kein Text): ${placeholders} — übersprungen`);
    return;
  }

  const { importFromContent } = await import("../src/core/import-file.ts");
  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } =
    await import("../src/core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  configureGateway(buildGatewayConfig(cfg));

  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  await engine.initSchema();
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    // Non-fatal
  }

  // Register sources
  for (const typeKey of typesToRun) {
    const cfg2 = TYPE_CONFIGS[typeKey];
    if (!cfg2) continue;
    await engine.executeRaw(
      `INSERT INTO sources (id, name, jurisdiction, config)
       VALUES ($1, $2, 'eu', jsonb_build_object('federated', true, 'legal_reference', true, 'jurisdiction', 'eu'))
       ON CONFLICT (id) DO UPDATE SET
         config = sources.config || EXCLUDED.config,
         jurisdiction = COALESCE(sources.jurisdiction, EXCLUDED.jurisdiction)`,
      [cfg2.sourceId, cfg2.label]
    );
  }
  console.log(`  Quellen registriert`);
  console.log("");

  let totalPages = 0;
  let totalErrors = 0;
  let totalSkipped = 0;
  let totalSplit = 0;
  let totalPlaceholders = 0;

  for (const f of files) {
    // Read lazily — one file body in memory at a time.
    const content = readFileSync(f.path, "utf-8");
    // Skip placeholder files (no text content)
    if (content.includes("Volltext nicht abrufbar")) {
      totalPlaceholders++;
      continue;
    }

    let pages: Array<{ slug: string; content: string }> = [];

    if (content.length > SPLIT_THRESHOLD) {
      const split = trySplit(content);
      if (split && split.length > 1) {
        pages = split.map((s) => ({
          slug: `${f.slug}/${s.slugSuffix}`,
          content: s.body,
        }));
        totalSplit++;
      } else {
        pages = [{ slug: f.slug, content }];
      }
    } else {
      pages = [{ slug: f.slug, content }];
    }

    for (const page of pages) {
      try {
        const result = await importFromContent(engine, page.slug, page.content, {
          noEmbed: NO_EMBED,
          sourceId: f.sourceId,
          skipContentDuplicates: false,
        });
        if (result.status === "imported") {
          totalPages++;
        } else if (result.status === "skipped") {
          totalSkipped++;
        } else {
          totalErrors++;
          if (totalErrors <= 5) {
            console.error(`  ❌ ${page.slug}: ${result.error || result.status}`);
          }
        }
      } catch (e) {
        totalErrors++;
        if (totalErrors <= 5) {
          console.error(`  ❌ ${page.slug}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    if ((totalPages + totalSkipped) % 500 === 0 && totalPages + totalSkipped > 0) {
      console.log(
        `    ... ${totalPages + totalSkipped} Seiten, ${totalErrors} Fehler, ${totalPlaceholders} Placeholder übersprungen`
      );
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  GESAMT: ${totalPages} importiert, ${totalSkipped} skipped, ${totalErrors} Fehler`);
  console.log(
    `  ${totalSplit} Dateien per-Section gesplittet, ${totalPlaceholders} Placeholder übersprungen`
  );
  console.log("═══════════════════════════════════════════════════════════");

  if (!DRY && NO_EMBED) {
    console.log("⚠️  Embedding übersprungen. Nachholen: bun run server/scripts/auto-embed-pg.ts");
  }

  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
