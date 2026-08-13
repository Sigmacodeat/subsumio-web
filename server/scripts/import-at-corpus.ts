#!/usr/bin/env bun
/**
 * import-at-corpus — import Austrian Staatsverträge + Landesrecht into the brain.
 *
 * Each file is imported as a single page (these are individual laws/treaties,
 * not monolithic codes that need per-§ splitting). Files large enough to
 * benefit from splitting are run through splitStatute() first.
 *
 * Usage:
 *   bun run server/scripts/import-at-corpus.ts [--phase staatsvertraege|landesrecht|all]
 *                                               [--dry-run] [--no-embed] [--limit N]
 *
 * Sources created:
 *   law-at-staatsvertraege — Staatsverträge (federal treaties)
 *   law-at-landesrecht     — Landesrecht (state laws + ordinances)
 *
 * Slug patterns:
 *   legal/staatsvertraege/at/<filename-slug>
 *   legal/landesrecht/at/<state-code>/<filename-slug>
 */

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { splitStatute } from "../src/core/legal/split-statute.ts";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const NO_EMBED = args.includes("--no-embed");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const phaseIdx = args.indexOf("--phase");
const PHASE = phaseIdx >= 0 ? args[phaseIdx + 1] : "all";

const CORPUS_ROOT = join(import.meta.dir, "..", "..", "law-corpus");
const STAATSVERTRAEGE_DIR = join(CORPUS_ROOT, "at-staatsvertraege");
const LANDESRECHT_DIR = join(CORPUS_ROOT, "at-landesrecht");

const STAATSVERTRAEGE_SOURCE = "law-at-staatsvertraege";
const LANDESRECHT_SOURCE = "law-at-landesrecht";

/** Max file size (chars) to import as a single page without splitting. */
const SPLIT_THRESHOLD = 50_000;

interface CorpusFile {
  slug: string;
  content: string;
  sourceId: string;
  label: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function loadStaatsvertraege(): CorpusFile[] {
  if (!existsSync(STAATSVERTRAEGE_DIR)) return [];
  const files = readdirSync(STAATSVERTRAEGE_DIR)
    .filter((f) => f.endsWith(".md"))
    .slice(0, LIMIT);
  return files.map((f) => {
    const content = readFileSync(join(STAATSVERTRAEGE_DIR, f), "utf-8");
    const slug = `legal/staatsvertraege/at/${f.replace(/\.md$/, "")}`;
    return { slug, content, sourceId: STAATSVERTRAEGE_SOURCE, label: f };
  });
}

function loadLandesrecht(): CorpusFile[] {
  if (!existsSync(LANDESRECHT_DIR)) return [];
  const stateDirs = readdirSync(LANDESRECHT_DIR).filter((d) => {
    const p = join(LANDESRECHT_DIR, d);
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
  const results: CorpusFile[] = [];
  let count = 0;
  for (const stateDir of stateDirs) {
    const dirPath = join(LANDESRECHT_DIR, stateDir);
    const files = readdirSync(dirPath).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      if (count >= LIMIT) break;
      const content = readFileSync(join(dirPath, f), "utf-8");
      const slug = `legal/landesrecht/at/${stateDir}/${f.replace(/\.md$/, "")}`;
      results.push({ slug, content, sourceId: LANDESRECHT_SOURCE, label: `${stateDir}/${f}` });
      count++;
    }
    if (count >= LIMIT) break;
  }
  return results;
}

/** Try to split a large file into per-§ sections. Returns null if no sections found. */
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
  const doStaatsvertraege = PHASE === "all" || PHASE === "staatsvertraege";
  const doLandesrecht = PHASE === "all" || PHASE === "landesrecht";

  let files: CorpusFile[] = [];
  if (doStaatsvertraege) files = files.concat(loadStaatsvertraege());
  if (doLandesrecht) files = files.concat(loadLandesrecht());

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — AT Corpus Import (Staatsverträge + Landesrecht)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Phase: ${PHASE}`);
  console.log(
    `  Mode: ${DRY ? "DRY-RUN (kein DB-Write)" : NO_EMBED ? "import, no-embed" : "import + embed"}`
  );
  console.log(`  Gefunden: ${files.length} Dateien`);
  if (doStaatsvertraege)
    console.log(
      `    Staatsverträge: ${files.filter((f) => f.sourceId === STAATSVERTRAEGE_SOURCE).length}`
    );
  if (doLandesrecht)
    console.log(
      `    Landesrecht: ${files.filter((f) => f.sourceId === LANDESRECHT_SOURCE).length}`
    );
  console.log("");

  if (DRY) {
    let totalSections = 0;
    let wholeFiles = 0;
    for (const f of files) {
      const charCount = f.content.length;
      if (charCount > SPLIT_THRESHOLD) {
        const split = trySplit(f.content);
        if (split && split.length > 1) {
          totalSections += split.length;
          continue;
        }
      }
      wholeFiles++;
      totalSections++;
    }
    console.log(
      `  Geschätzte Seiten: ${totalSections} (${wholeFiles} ganze Dateien + ${totalSections - wholeFiles} §-Sections)`
    );
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
    // Non-fatal: pre-v39 brains may not have a usable config table.
  }

  // Register sources
  const sourcesToCreate = [
    { id: STAATSVERTRAEGE_SOURCE, name: "AT Staatsverträge", jurisdiction: "at" },
    { id: LANDESRECHT_SOURCE, name: "AT Landesrecht", jurisdiction: "at" },
  ];
  for (const src of sourcesToCreate) {
    await engine.executeRaw(
      `INSERT INTO sources (id, name, jurisdiction, config)
       VALUES ($1, $2, $3::text, jsonb_build_object('federated', true, 'legal_reference', true, 'jurisdiction', $3::text))
       ON CONFLICT (id) DO UPDATE SET
         config = sources.config || EXCLUDED.config,
         jurisdiction = COALESCE(sources.jurisdiction, EXCLUDED.jurisdiction)`,
      [src.id, src.name, src.jurisdiction]
    );
  }
  console.log(`  Quellen registriert: ${sourcesToCreate.map((s) => s.id).join(", ")}`);
  console.log("");

  let totalPages = 0;
  let totalErrors = 0;
  let totalSkipped = 0;
  let totalSplit = 0;

  for (const f of files) {
    const charCount = f.content.length;
    let pages: Array<{ slug: string; content: string }> = [];

    // Try splitting large files into per-§ sections
    if (charCount > SPLIT_THRESHOLD) {
      const split = trySplit(f.content);
      if (split && split.length > 1) {
        pages = split.map((s) => ({
          slug: `${f.slug}/${s.slugSuffix}`,
          content: s.body,
        }));
        totalSplit++;
      } else {
        pages = [{ slug: f.slug, content: f.content }];
      }
    } else {
      pages = [{ slug: f.slug, content: f.content }];
    }

    let okForFile = 0;
    let errForFile = 0;
    let skipForFile = 0;

    for (const page of pages) {
      try {
        const result = await importFromContent(engine, page.slug, page.content, {
          noEmbed: NO_EMBED,
          sourceId: f.sourceId,
          skipContentDuplicates: true,
        });
        if (result.status === "imported") {
          okForFile++;
        } else if (result.status === "skipped") {
          skipForFile++;
        } else {
          errForFile++;
          if (errForFile <= 3) {
            console.error(`  ❌ ${page.slug}: ${result.error || result.status}`);
          }
        }
      } catch (e) {
        errForFile++;
        if (errForFile <= 3) {
          console.error(`  ❌ ${page.slug}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    totalPages += okForFile;
    totalErrors += errForFile;
    totalSkipped += skipForFile;

    if ((totalPages + totalSkipped) % 100 === 0 && totalPages + totalSkipped > 0) {
      console.log(`    ... ${totalPages + totalSkipped} Seiten importiert, ${totalErrors} Fehler`);
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    `  GESAMT: ${totalPages} Seiten importiert, ${totalSkipped} skipped, ${totalErrors} Fehler`
  );
  console.log(`  Davon ${totalSplit} Dateien per-§ gesplittet`);
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
