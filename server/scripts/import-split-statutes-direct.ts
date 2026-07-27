#!/usr/bin/env bun
/**
 * Import split statute files directly into the DB (bypasses HTTP API / tenant requirement).
 *
 * Reads law-corpus-split/{de,ch}/ and imports each .md file via importFromContent().
 * Slug pattern: legal/statutes/{jur}/{abbr}/p-{para}  (DE split files)
 *                legal/statutes/{jur}/{abbr}           (CH whole files)
 *
 * Usage:
 *   bun run scripts/import-split-statutes-direct.ts --jur de --source law-de --dir /tmp/law-corpus-split/de
 *   bun run scripts/import-split-statutes-direct.ts --jur ch --source law-ch --dir /tmp/law-corpus-split/ch
 *   bun run scripts/import-split-statutes-direct.ts --jur de --source law-de --dir /tmp/law-corpus-split/de --no-embed
 *   bun run scripts/import-split-statutes-direct.ts --jur de --source law-de --dir /tmp/law-corpus-split/de --no-embed --skip-schema-init
 */

import { readdirSync, readFileSync } from "fs";
import { join, extname, basename } from "path";
import { loadConfig } from "../src/core/config.ts";
import { PostgresEngine } from "../src/core/postgres-engine.ts";
import { importFromContent } from "../src/core/import-file.ts";

const args = Bun.argv.slice(2);
const JUR = args.find((a) => a.startsWith("--jur="))?.split("=")[1] ?? "de";
const SOURCE = args.find((a) => a.startsWith("--source="))?.split("=")[1] ?? `law-${JUR}`;
const DIR =
  args.find((a) => a.startsWith("--dir="))?.split("=")[1] ?? `/tmp/law-corpus-split/${JUR}`;
const NO_EMBED = args.includes("--no-embed");
const SKIP_SCHEMA_INIT = args.includes("--skip-schema-init");
const SHARD_COUNT = Number(args.find((a) => a.startsWith("--shard-count="))?.split("=")[1] ?? "1");
const SHARD_INDEX = Number(args.find((a) => a.startsWith("--shard-index="))?.split("=")[1] ?? "0");

if (!Number.isInteger(SHARD_COUNT) || SHARD_COUNT < 1) {
  throw new Error("--shard-count must be a positive integer");
}
if (!Number.isInteger(SHARD_INDEX) || SHARD_INDEX < 0 || SHARD_INDEX >= SHARD_COUNT) {
  throw new Error("--shard-index must be an integer in [0, shard-count)");
}

function parseFrontmatter(text: string): Record<string, string> {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("---", 3);
  if (end === -1) return {};
  const raw = text.slice(3, end).trim();
  const fm: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].replace(/^"|"$/g, "").trim();
  }
  return fm;
}

async function main() {
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Split Statute Import — ${JUR.toUpperCase()} → ${SOURCE}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`Dir: ${DIR}`);
  console.log(`Embed: ${NO_EMBED ? "NEIN" : "JA"}`);
  console.log(`Schema init: ${SKIP_SCHEMA_INIT ? "ÜBERSPRUNGEN" : "JA"}`);
  console.log(`Shard: ${SHARD_INDEX + 1}/${SHARD_COUNT}`);
  console.log("");

  const config = loadConfig();
  if (!config?.database_url) {
    console.error("FATAL: No DATABASE_URL in config or env");
    process.exit(1);
  }

  const engine = new PostgresEngine();
  await engine.connect({ database_url: config.database_url });
  await engine.executeRaw("SET statement_timeout = 0");
  if (!SKIP_SCHEMA_INIT) {
    await engine.initSchema();
  }

  const allFiles = readdirSync(DIR)
    .filter((f) => extname(f) === ".md")
    .sort();
  const files = allFiles.filter((_, index) => index % SHARD_COUNT === SHARD_INDEX);

  console.log(`Found ${files.length}/${allFiles.length} markdown files\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const filePath = join(DIR, file);
    try {
      const content = readFileSync(filePath, "utf-8");
      const fm = parseFrontmatter(content);

      const abbr =
        fm.abbreviation || basename(file, ".md").replace("-par-", "").replace(/-\d+$/, "");
      const para = fm.paragraph || "";

      // Generate slug: split files have paragraph → p-{N}, whole files → just {abbr}
      const slug = para
        ? `legal/statutes/${JUR}/${abbr.toLowerCase()}/p-${para.replace(/[^a-z0-9]/gi, "").toLowerCase()}`
        : `legal/statutes/${JUR}/${abbr.toLowerCase()}`;

      const result = await importFromContent(engine, slug, content, {
        noEmbed: NO_EMBED,
        sourceId: SOURCE,
        sourcePath: filePath,
      });

      if (result.status === "skipped") {
        skipped++;
      } else {
        imported++;
        if (imported % 100 === 0) {
          console.log(`  Progress: ${imported} imported, ${skipped} skipped, ${errors} errors`);
        }
      }
    } catch (e) {
      errors++;
      console.error(`  ❌ ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Done: ${imported} imported, ${skipped} skipped, ${errors} errors`);
  console.log(`═══════════════════════════════════════════════════════════`);

  await engine.disconnect?.();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
