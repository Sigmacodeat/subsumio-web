#!/usr/bin/env bun
/**
 * batch-import-from-disk — Import on-disk corpus files that are NOT yet in the DB.
 *
 * Key design: bypasses initSchema() entirely. Connects to the Postgres engine
 * and imports files directly via importFromContent(). The initSchema() lock
 * issue (30+ min AccessExclusiveLock on pages table) is avoided by NOT calling
 * it — the schema is already up-to-date on the production DB.
 *
 * Features:
 *   - Resume cursor (tracks imported slugs in a JSON file)
 *   - Batch size control (--batch-size N)
 *   - Rate limiting between imports (--sleep-ms N)
 *   - Dry-run mode (--dry-run)
 *   - No-embed mode (--no-embed, import first, embed later via auto-embed-pending)
 *   - Per-source filtering (--source law-at-judikatur-vwgh)
 *   - Progress reporting every batch
 *   - Graceful shutdown on SIGINT (saves cursor)
 *
 * Usage:
 *   bun run server/scripts/batch-import-from-disk.ts \
 *     --source law-at-judikatur-vwgh \
 *     --disk-dir law-corpus/at-judikatur-vwgh \
 *     --batch-size 200 --sleep-ms 50 --no-embed
 *
 *   bun run server/scripts/batch-import-from-disk.ts \
 *     --source law-eu --disk-dir law-corpus/eu \
 *     --batch-size 500 --sleep-ms 20 --no-embed --dry-run
 *
 * Safety:
 *   - Does NOT call initSchema() — avoids the 30+ min lock issue
 *   - Uses skipContentDuplicates: true to avoid re-importing unchanged pages
 *   - Cursor saved after every batch
 *   - SIGINT handler saves cursor before exit
 */

import { parseArgs } from "util";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, extname, resolve } from "path";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    source: { type: "string" },
    "disk-dir": { type: "string" },
    "batch-size": { type: "string", default: "200" },
    "sleep-ms": { type: "string", default: "50" },
    "cursor-file": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "no-embed": { type: "boolean", default: false },
    "slug-prefix": { type: "string" },
    "slug-from-path": { type: "boolean", default: false },
    "file-glob": { type: "string", default: "*.md" },
    "file-list": { type: "string" },
    "max-file-size": { type: "string", default: "2097152" },
    "force-rechunk": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
batch-import-from-disk — Import on-disk corpus files into the DB

Usage:
  bun run server/scripts/batch-import-from-disk.ts [options]

Required:
  --source       Source ID in DB (e.g. law-at-judikatur-vwgh, law-eu)
  --disk-dir     Relative path to on-disk corpus dir (e.g. law-corpus/at-judikatur-vwgh)

Options:
  --batch-size   Files per batch (default: 200)
  --sleep-ms     Sleep between files in ms (default: 50)
  --cursor-file  Resume cursor path (default: /tmp/import-cursor-<source>.json)
  --dry-run      Show what would be imported, don't write to DB
  --no-embed     Skip embedding (import first, embed later)
  --slug-prefix  Override slug prefix (default: auto from source ID)
  --file-glob    File extension filter (default: *.md)
  --max-file-size  Skip files larger than N bytes (default: 2097152 = 2MB)
  --force-rechunk Re-chunk already-imported pages (useful after chunker updates)
  --help         This help

Examples:
  # Import VwGH judikatur (82k files, no embed first pass)
  bun run server/scripts/batch-import-from-disk.ts \\
    --source law-at-judikatur-vwgh \\
    --disk-dir law-corpus/at-judikatur-vwgh \\
    --batch-size 200 --sleep-ms 50 --no-embed

  # Dry run EU regulations
  bun run server/scripts/batch-import-from-disk.ts \\
    --source law-eu --disk-dir law-corpus/eu \\
    --dry-run --batch-size 500
`);
  process.exit(0);
}

const SOURCE_ID = values.source as string;
const DISK_DIR = values["disk-dir"] as string;
const BATCH_SIZE = parseInt(values["batch-size"] as string, 10) || 200;
const SLEEP_MS = parseInt(values["sleep-ms"] as string, 10) || 50;
const CURSOR_FILE =
  (values["cursor-file"] as string | undefined) || `/tmp/import-cursor-${SOURCE_ID}.json`;
const DRY_RUN = values["dry-run"] as boolean;
const NO_EMBED = values["no-embed"] as boolean;
const SLUG_PREFIX = values["slug-prefix"] as string | undefined;
const SLUG_FROM_PATH = values["slug-from-path"] as boolean;
const FILE_GLOB = values["file-glob"] as string;
const MAX_FILE_SIZE = parseInt(values["max-file-size"] as string, 10) || 2 * 1024 * 1024;
const FORCE_RECHUNK = values["force-rechunk"] as boolean;

if (!SOURCE_ID || !DISK_DIR) {
  console.error("ERROR: --source and --disk-dir are required. Use --help for usage.");
  process.exit(1);
}

interface CursorState {
  importedSlugs: string[];
  lastFile: string;
  totalImported: number;
  totalErrors: number;
  totalSkipped: number;
  totalQualityFail: number;
  qualityFailures: { file: string; reason: string }[];
  startedAt: string;
  lastUpdate: string;
}

async function loadCursor(): Promise<CursorState> {
  try {
    if (existsSync(CURSOR_FILE)) {
      const raw = readFileSync(CURSOR_FILE, "utf-8");
      return JSON.parse(raw) as CursorState;
    }
  } catch {
    /* ignore */
  }
  return {
    importedSlugs: [],
    lastFile: "",
    totalImported: 0,
    totalErrors: 0,
    totalSkipped: 0,
    totalQualityFail: 0,
    qualityFailures: [],
    startedAt: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
  };
}

async function saveCursor(state: CursorState) {
  state.lastUpdate = new Date().toISOString();
  const raw = JSON.stringify(state);
  await Bun.write(CURSOR_FILE, raw);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Eigener Slug-Namensraum je AT-Gesetzesquelle.
 *
 * WARUM: Alle neun AT-Gesetzeskorpora teilten sich `legal/statutes/at/`.
 * Bundes- und Landesrecht vergeben ihre Gesetzesnummern unabhängig und bilden
 * beide `gnr-<nummer>/art-N` — 2.623 Slugs kollidierten, unter
 * `gnr-10000476/art-1` lagen "Kompetenzfeststellung durch den VfGH"
 * (Bundesrecht) und "Mattsee – Obertrum am See – Änderung der Gemeindegrenzen"
 * (Salzburger Landesrecht). Dieselbe Klasse traf generische Titel: zwei
 * verschiedene "Kundmachung"-Dokumente aus AVSV und Gemeinderecht landeten
 * auf demselben Slug.
 *
 * Eine Fundstelle, die auf zwei Gesetze zeigt, ist für ein Zitat unbrauchbar
 * und sieht dabei eindeutig aus — der gefährlichste Fehlertyp. Deshalb bekommt
 * jede Rechtsquelle ihren eigenen Raum. `law-at-normen` (Bundesrecht) bleibt
 * bewusst ohne Zusatz: es ist die Voreinstellung, und seine Slugs
 * (`abgb/p-1044`) sind bereits eingebürgert.
 */
const AT_STATUTE_NAMESPACES: Record<string, string> = {
  "law-at-landesrecht": "landesrecht",
  "law-at-gemeinden": "gemeinden",
  "law-at-bezirke": "bezirke",
  "law-at-bmerl": "erlaesse",
  "law-at-avn": "avn",
  "law-at-avsv": "avsv",
  "law-at-kmger": "kmger",
  "law-at-spg": "spg",
  "law-at-staatsvertraege": "staatsvertraege",
};

function deriveSlug(filePath: string, sourceId: string, slugPrefix?: string, diskRoot?: string): string {
  // --slug-from-path: den Pfad UNTERHALB des Wurzelverzeichnisses in den Slug
  // übernehmen. Nötig für verschachtelte Korpora wie at-normen/<abk>/<p-96>.md,
  // wo der Dateiname allein nicht eindeutig ist (abgb/p-96 vs. stgb/p-96).
  if (SLUG_FROM_PATH && diskRoot) {
    // Beide Seiten auf absolute Pfade bringen, BEVOR der Wurzelpfad abgeschnitten
    // wird. Ohne das schlägt der Abschnitt fehl, sobald --file-list relative
    // Pfade liefert (diskRoot ist immer absolut) — der komplette Pfad landete
    // dann im Slug: `legal/statutes/at/law-corpus/at-normen/uwg/p-1`. Das hat
    // 1.529 Seiten unter falschen Slugs angelegt.
    const absFile = filePath.startsWith("/") ? filePath : resolve(process.cwd(), filePath);
    const absRoot = resolve(diskRoot);
    const rel = (absFile.startsWith(`${absRoot}/`) ? absFile.slice(absRoot.length + 1) : absFile)
      .replace(/\.[^.]+$/, "");
    if (rel.startsWith("/") || rel.includes("..")) {
      throw new Error(
        `Slug-Ableitung fehlgeschlagen: ${filePath} liegt nicht unter ${diskRoot}. ` +
          `Mit --slug-from-path müssen alle Dateien unterhalb von --disk-dir liegen.`
      );
    }
    const prefix = slugPrefix ?? deriveSlugPrefix(sourceId);
    return `${prefix}/${rel}`;
  }

  const base = filePath.replace(/^.*\//, "").replace(/\.[^.]+$/, "");

  // Override prefix takes precedence
  if (slugPrefix) return `${slugPrefix}/${base}`;

  // Match existing DB slug patterns (verified from production data)
  if (sourceId === "law-at-judikatur") {
    return `legal/judikatur/at/${base}`;
  }
  if (sourceId.startsWith("law-at-judikatur-")) {
    const court = sourceId.replace("law-at-judikatur-", "");
    return `legal/judikatur/at/${court}/${base}`;
  }
  if (sourceId === "law-ch-judikatur") {
    return `legal/judikatur/ch/${base}`;
  }
  if (sourceId === "law-de-judikatur") {
    return `legal/judikatur/de/${base}`;
  }
  if (sourceId === "law-eu") {
    return `legal/regulations/eu/${base}`;
  }
  // Eigener Namensraum je Rechtsquelle — siehe AT_STATUTE_NAMESPACES.
  const eigenerRaum = AT_STATUTE_NAMESPACES[sourceId];
  if (eigenerRaum) {
    return `legal/statutes/at/${eigenerRaum}/${base}`;
  }
  // Verbleibend: law-at (konsolidiertes Bundesrecht) und law-at-normen
  if (sourceId.startsWith("law-at-") || sourceId === "law-at") {
    return `legal/statutes/at/${base}`;
  }
  if (sourceId.startsWith("law-de-") || sourceId === "law-de") {
    return `legal/statutes/de/${base}`;
  }
  if (sourceId.startsWith("law-ch-") || sourceId === "law-ch") {
    return `legal/statutes/ch/${base}`;
  }
  // Generic fallback: legal/<jur>/<base>
  const jur = sourceId.replace("law-", "").split("-")[0];
  return `legal/${jur}/${base}`;
}

function deriveSlugPrefix(sourceId: string): string {
  if (sourceId.startsWith("law-at-judikatur")) return "legal/judikatur/at";
  if (sourceId.startsWith("law-de-judikatur")) return "legal/judikatur/de";
  if (sourceId.startsWith("law-ch-judikatur")) return "legal/judikatur/ch";
  if (sourceId === "law-eu") return "legal/regulations/eu";
  // Landesrecht bekommt einen eigenen Namensraum. Bundes- und Landesrecht
  // vergeben Gesetzesnummern unabhängig voneinander, und beide Korpora bilden
  // ihre Pfade als `gnr-<nummer>/art-N`. Im gemeinsamen Namensraum
  // `legal/statutes/at/` kollidierten dadurch 2.623 Slugs — unter
  // `gnr-10000476/art-1` lagen "Kompetenzfeststellung durch den VfGH"
  // (Bundesrecht) und "Mattsee – Obertrum am See – Änderung der
  // Gemeindegrenzen" (Salzburger Landesrecht). Eine Fundstelle, zwei Gesetze.
  const eigenerRaum = AT_STATUTE_NAMESPACES[sourceId];
  if (eigenerRaum) return `legal/statutes/at/${eigenerRaum}`;
  // All law-at-* (non-judikatur) are statutes
  if (sourceId.startsWith("law-at-") || sourceId === "law-at") return "legal/statutes/at";
  if (sourceId.startsWith("law-de-") || sourceId === "law-de") return "legal/statutes/de";
  if (sourceId.startsWith("law-ch-") || sourceId === "law-ch") return "legal/statutes/ch";
  return `legal/${sourceId.replace("law-", "")}`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Batch Import from Disk");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Source ID:     ${SOURCE_ID}`);
  console.log(`Disk dir:      ${DISK_DIR}`);
  console.log(`Batch size:    ${BATCH_SIZE}`);
  console.log(`Sleep ms:      ${SLEEP_MS}`);
  console.log(`Cursor file:   ${CURSOR_FILE}`);
  console.log(`Dry run:       ${DRY_RUN ? "YES" : "no"}`);
  console.log(`No embed:      ${NO_EMBED ? "YES" : "no"}`);
  console.log("");

  // Resolve disk directory — absolute paths used as-is, relative resolved from cwd
  const diskPath = DISK_DIR.startsWith("/") ? DISK_DIR : join(process.cwd(), DISK_DIR);

  if (!existsSync(diskPath)) {
    console.error(`ERROR: Disk directory does not exist: ${diskPath}`);
    process.exit(1);
  }

  // Collect all .md files — from file-list or by walking disk dir
  let allFiles: string[] = [];
  const FILE_LIST = values["file-list"] as string | undefined;
  if (FILE_LIST) {
    console.log(`Loading file list from ${FILE_LIST}...`);
    const listContent = readFileSync(FILE_LIST, "utf-8");
    allFiles = listContent
      .trim()
      .split("\n")
      .filter((l) => l.trim().length > 0);
    console.log(`Found ${allFiles.length} files in list.`);
  } else {
    console.log(`Scanning ${diskPath} for ${FILE_GLOB} files...`);
    function walk(dir: string) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith(FILE_GLOB.replace("*.", "."))) {
          allFiles.push(fullPath);
        }
      }
    }
    walk(diskPath);
    console.log(`Found ${allFiles.length} files on disk.`);
  }

  // Load cursor
  const cursor = await loadCursor();
  let alreadyImported = new Set(cursor.importedSlugs);
  if (FORCE_RECHUNK) {
    console.log("⚠️  force-rechunk: ignoring cursor and reprocessing all files.");
    alreadyImported = new Set();
    cursor.importedSlugs = [];
    cursor.totalImported = 0;
    cursor.totalErrors = 0;
    cursor.totalSkipped = 0;
    cursor.totalQualityFail = 0;
    cursor.qualityFailures = [];
  }
  console.log(`Cursor: ${alreadyImported.size} already imported, resuming from last file.`);
  console.log("");

  // Filter out already-imported files unless force-rechunk is active
  const toImport = allFiles.filter((f) => {
    const slug = deriveSlug(f, SOURCE_ID, SLUG_PREFIX, diskPath);
    return !alreadyImported.has(slug);
  });
  console.log(
    `To import: ${toImport.length} files (skipping ${alreadyImported.size} already done).`
  );

  if (toImport.length === 0) {
    console.log("✅ Nothing to import — all files already in cursor.");
    // Even with nothing to import, run the completeness check so the 1:1
    // invariant is verified (all files on disk = already in cursor).
    const totalOnDisk = allFiles.length;
    const accountedFor = alreadyImported.size;
    const complete = accountedFor === totalOnDisk;
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  Vollständigkeit: ${accountedFor}/${totalOnDisk} ` +
      (complete ? "✓ 1:1" : `✗ ${totalOnDisk - accountedFor} FEHLEN`));
    console.log("═══════════════════════════════════════════════════════════");
    if (!complete) {
      console.error(`! FEHLER: ${totalOnDisk - accountedFor} Dateien nicht zugeordnet — das ist ein Bug.`);
      process.exit(1);
    }
    return;
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] First 10 files that would be imported:");
    for (const f of toImport.slice(0, 10)) {
      const slug = deriveSlug(f, SOURCE_ID, SLUG_PREFIX, diskPath);
      console.log(`  ${slug} ← ${f.replace(process.cwd() + "/", "")}`);
    }
    console.log(
      `\n[DRY-RUN] Total: ${toImport.length} files. Use without --dry-run to actually import.`
    );
    return;
  }

  // Connect to engine — NO initSchema() call
  console.log("\nConnecting to engine (NO initSchema — schema is already current)...");
  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } =
    await import("../src/core/ai/gateway.ts");
  const { importFromContent } = await import("../src/core/import-file.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  configureGateway(buildGatewayConfig(cfg));

  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  // ⚠️ NO initSchema() — the production schema is already up-to-date.
  // Calling initSchema() would acquire AccessExclusiveLock on pages for 30+ min.
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    /* non-fatal */
  }

  // Ensure source exists
  const jurisdiction = SOURCE_ID.startsWith("law-at")
    ? "at"
    : SOURCE_ID.startsWith("law-de")
      ? "de"
      : SOURCE_ID.startsWith("law-ch")
        ? "ch"
        : SOURCE_ID.startsWith("law-eu")
          ? "eu"
          : null;

  await engine.executeRaw(
    `INSERT INTO sources (id, name, jurisdiction, config)
     VALUES ($1, $2, $3::text, jsonb_build_object('federated', true, 'legal_reference', true))
     ON CONFLICT (id) DO UPDATE SET
       jurisdiction = COALESCE(sources.jurisdiction, EXCLUDED.jurisdiction)`,
    [SOURCE_ID, SOURCE_ID, jurisdiction]
  );
  console.log(`Source '${SOURCE_ID}' ensured (jurisdiction: ${jurisdiction}).`);

  // SIGINT handler — save cursor before exit
  let interrupted = false;
  const sigintHandler = async () => {
    if (interrupted) {
      console.log("\nForce exit (cursor may be incomplete).");
      process.exit(1);
    }
    interrupted = true;
    console.log("\nSIGINT received — saving cursor and exiting gracefully...");
    await saveCursor(cursor);
    console.log(`Cursor saved to ${CURSOR_FILE}.`);
    process.exit(0);
  };
  process.on("SIGINT", sigintHandler);

  // Import loop
  let batchImported = 0;
  let batchErrors = 0;
  let batchSkipped = 0;
  let batchNum = 0;
  const totalBatches = Math.ceil(toImport.length / BATCH_SIZE);
  const startTime = Date.now();

  for (let i = 0; i < toImport.length; i++) {
    if (interrupted) break;

    const filePath = toImport[i];
    const slug = deriveSlug(filePath, SOURCE_ID, SLUG_PREFIX, diskPath);

    try {
      const stats = statSync(filePath);
      if (stats.size > MAX_FILE_SIZE) {
        batchSkipped++;
        cursor.totalSkipped++;
        cursor.totalQualityFail++;
        cursor.qualityFailures.push({
          file: filePath,
          reason: `file too large (${stats.size} bytes > ${MAX_FILE_SIZE})`,
        });
        continue;
      }
      const content = readFileSync(filePath, "utf-8");
      if (content.trim().length === 0) {
        batchSkipped++;
        cursor.totalSkipped++;
        continue;
      }

      // ── Pre-Import Quality Gate ──────────────────────────────
      // 1. Must have content_hash in frontmatter (integrity check)
      if (!content.includes("content_hash:")) {
        batchSkipped++;
        cursor.totalSkipped++;
        cursor.totalQualityFail++;
        cursor.qualityFailures.push({ file: filePath, reason: "missing content_hash" });
        continue;
      }
      // 2. Must not have not_digitalized flag (placeholder files)
      if (content.includes("not_digitalized: true")) {
        batchSkipped++;
        cursor.totalSkipped++;
        continue;
      }
      // 3. Must not have encoding artifacts (Ã prefix = mojibake)
      if (
        content.includes("\u00c3\u00bf") ||
        content.includes("\u00c3\u00a4") ||
        content.includes("\u00c3\u00b6") ||
        content.includes("\u00c3\u00bc") ||
        content.includes("\u00c3\u0084") ||
        content.includes("\u00c3\u0096") ||
        content.includes("\u00c3\u009c") ||
        content.includes("\u00c3\u009f")
      ) {
        batchSkipped++;
        cursor.totalSkipped++;
        cursor.totalQualityFail++;
        cursor.qualityFailures.push({ file: filePath, reason: "encoding artifacts (mojibake)" });
        continue;
      }
      // 4. Body must be substantial (extract body after frontmatter).
      // RIS-XML norm files (type: law, source_format: xml) are official
      // legal sources — even a 11-char body like "§ 541. Wer" is a legitimate
      // norm text from RIS, not a truncation. Skip the body-length check for
      // these verified legal pages so short norms aren't silently lost.
      const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      const body = bodyMatch ? bodyMatch[1].trim() : content;
      const isRisLegalPage =
        content.includes("type: law") && content.includes("source_format: xml");
      if (body.length < 50 && !isRisLegalPage) {
        batchSkipped++;
        cursor.totalSkipped++;
        cursor.totalQualityFail++;
        cursor.qualityFailures.push({
          file: filePath,
          reason: `body too short (${body.length} chars)`,
        });
        continue;
      }

      const result = await importFromContent(engine, slug, content, {
        noEmbed: NO_EMBED,
        sourceId: SOURCE_ID,
        skipContentDuplicates: true,
        forceRechunk: FORCE_RECHUNK,
      });
      alreadyImported.add(slug);
      cursor.importedSlugs.push(slug);
      if (result.status === "skipped") {
        // importFromContent detected a content duplicate (same content_hash,
        // no frontmatter.id). Count it as skipped, not imported, so the
        // 1:1 completeness accounting stays accurate.
        cursor.totalSkipped++;
        batchSkipped++;
      } else if (result.status === "error") {
        // Defensive: importFromContent returned an error status without
        // throwing. Count it as an error, not imported.
        cursor.totalErrors++;
        batchErrors++;
        if (batchErrors <= 10 || batchErrors % 100 === 0) {
          console.error(`  ! [import error] ${slug}: ${result.error ?? "unknown"}`);
        }
      } else {
        cursor.totalImported++;
        batchImported++;
      }
    } catch (e) {
      batchErrors++;
      cursor.totalErrors++;
      const msg = e instanceof Error ? e.message : String(e);
      if (batchErrors <= 10 || batchErrors % 100 === 0) {
        console.error(`  ERROR [${slug}]: ${msg}`);
      }
    }

    cursor.lastFile = filePath;

    // Batch boundary
    if ((i + 1) % BATCH_SIZE === 0 || i === toImport.length - 1) {
      batchNum++;
      const elapsed = Date.now() - startTime;
      const rate = ((i + 1) / (elapsed / 1000)).toFixed(1);
      const remaining = Math.ceil((toImport.length - i - 1) / parseFloat(rate));
      console.log(
        `Batch ${batchNum}/${totalBatches}: ${batchImported} imported, ${batchSkipped} skipped, ${batchErrors} errors | ` +
          `${i + 1}/${toImport.length} (${rate} files/s, ETA ${remaining}s)`
      );

      // Save cursor after each batch
      await saveCursor(cursor);

      // Reset batch counters
      batchImported = 0;
      batchErrors = 0;
      batchSkipped = 0;

      // Sleep between batches to reduce DB load
      if (SLEEP_MS > 0 && i < toImport.length - 1) {
        await sleep(SLEEP_MS);
      }
    }
  }

  // Final cursor save
  await saveCursor(cursor);

  // ── Vollständigkeitsprüfung (1:1) ──────────────────────────────────
  // Jede Datei auf der Platte muss in genau einer Kategorie landen:
  //   imported | skipped (bereits in DB) | quality-fail | error
  // Wenn die Summe nicht aufgeht, sind Dateien stillschweigend verloren gegangen.
  const totalOnDisk = allFiles.length;
  const alreadyInCursor = allFiles.length - toImport.length;
  const totalImported = cursor.totalImported;
  const totalSkipped = cursor.totalSkipped;
  const totalErrors = cursor.totalErrors;
  const accountedFor = alreadyInCursor + totalImported + totalSkipped + totalErrors;
  const complete = accountedFor === totalOnDisk;

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  IMPORT COMPLETE`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Total on disk:    ${totalOnDisk}`);
  console.log(`Already in cursor:${alreadyInCursor}`);
  console.log(`Total imported:   ${totalImported}`);
  console.log(`Total errors:     ${totalErrors}`);
  console.log(`Total skipped:    ${totalSkipped}`);
  console.log(`Quality failures: ${cursor.totalQualityFail}`);
  console.log(`Duration:         ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log(`Cursor saved:     ${CURSOR_FILE}`);
  console.log(
    `Vollständigkeit:  ${accountedFor}/${totalOnDisk} ` +
      (complete ? "✓ 1:1" : `✗ ${totalOnDisk - accountedFor} FEHLEN`)
  );

  if (cursor.qualityFailures.length > 0) {
    console.log(`\n⚠️  Quality failures (${cursor.qualityFailures.length}):`);
    for (const qf of cursor.qualityFailures.slice(0, 20)) {
      console.log(`  ${qf.reason}: ${qf.file.replace(process.cwd() + "/", "")}`);
    }
    if (cursor.qualityFailures.length > 20) {
      console.log(`  ... and ${cursor.qualityFailures.length - 20} more`);
    }
  }
  if (NO_EMBED) {
    console.log(`\n⚠️  Embeddings were skipped. Run auto-embed-pending.ts to generate them:`);
    console.log(`  bun run server/scripts/auto-embed-pending.ts --source ${SOURCE_ID}`);
  }

  if (!complete) {
    console.error(`\n! FEHLER: ${totalOnDisk - accountedFor} Dateien nicht zugeordnet — das ist ein Bug.`);
    process.exit(1);
  }

  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
