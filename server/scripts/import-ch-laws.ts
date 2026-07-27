#!/usr/bin/env bun
/**
 * Import CH law markdown files into the database with correct slug pattern
 * (legal/statutes/ch/{abbr}) and source_id (law-ch).
 *
 * Usage:
 *   bun run server/scripts/import-ch-laws.ts [--no-embed] [--dir /tmp/ch-laws]
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname, basename } from "path";
import { loadConfig } from "../src/core/config.ts";
import { PostgresEngine } from "../src/core/postgres-engine.ts";
import { importFromContent } from "../src/core/import-file.ts";

const NO_EMBED = Bun.argv.includes("--no-embed");
const DIR_ARG = Bun.argv.find((a) => a.startsWith("--dir="));
const DIR = DIR_ARG ? DIR_ARG.split("=")[1] : "/tmp/ch-laws";

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  CH Law Import — legal/statutes/ch/{abbr} → law-ch");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Dir: ${DIR}`);
  console.log(`No-Embed: ${NO_EMBED ? "JA" : "Nein"}`);
  console.log("");

  const config = loadConfig();
  if (!config?.database_url) {
    console.error("FATAL: No DATABASE_URL in config or env");
    process.exit(1);
  }

  const engine = new PostgresEngine();
  await engine.connect({ database_url: config.database_url });
  await engine.initSchema();

  // Disable statement timeout for this session — large law files can take
  // minutes to chunk + insert, and the default 10min timeout is too tight.
  await engine.executeRaw("SET statement_timeout = 0");

  const files = readdirSync(DIR)
    .filter((f) => extname(f) === ".md")
    .sort();

  console.log(`Found ${files.length} markdown files\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let totalChunks = 0;

  for (const file of files) {
    const abbr = basename(file, ".md");
    const slug = `legal/statutes/ch/${abbr}`;
    const filePath = join(DIR, file);

    try {
      const content = readFileSync(filePath, "utf-8");
      const stat = statSync(filePath);
      console.log(`  [${abbr}] ${stat.size} bytes → ${slug}`);

      const result = await importFromContent(engine, slug, content, {
        noEmbed: NO_EMBED,
        sourceId: "law-ch",
        sourcePath: filePath,
      });

      if (result.status === "skipped") {
        console.log(`    ⏭️  skipped (unchanged)`);
        skipped++;
      } else {
        console.log(`    ✅ imported`);
        imported++;
      }
    } catch (e) {
      errors++;
      console.error(`    ❌ ${abbr}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  Done: ${imported} imported, ${skipped} skipped, ${errors} errors`);
  console.log("═══════════════════════════════════════════════════════════");

  await engine.disconnect?.();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
