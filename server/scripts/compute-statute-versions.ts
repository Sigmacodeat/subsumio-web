#!/usr/bin/env bun
/**
 * Compute Statute Version Chains — Set is_current + superseded_at.
 *
 * RIS stores every version of a paragraph as a separate NOR (e.g. ASVG Art. 2
 * has 24 versions from 1959 to 1989), all with ausserkraft=null. Without a
 * version chain the AI can't tell which is the currently-in-force version and
 * might cite a 1959 text.
 *
 * This script groups pages by (source_id, abbreviation, paragraph) and for each
 * group:
 *   1. Sorts by effective_date (inkrafttretensdatum)
 *   2. Marks the latest as is_current = true
 *   3. Marks all others as is_current = false
 *   4. Sets superseded_at = effective_date of the NEXT version
 *
 * Pages without abbreviation (gnr-* norms) are skipped — they have no version
 * conflicts because each has a unique NOR-ID in the slug.
 *
 * Usage:
 *   bun run scripts/compute-statute-versions.ts
 *   bun run scripts/compute-statute-versions.ts --source law-at
 *   bun run scripts/compute-statute-versions.ts --dry-run
 */

import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    source: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Compute Statute Version Chains — is_current + superseded_at

Usage:
  bun run scripts/compute-statute-versions.ts [options]

Options:
  --source     Only process this source_id (default: all)
  --dry-run    Show what would change, don't write
  --help       This help
`);
  process.exit(0);
}

const SOURCE_FILTER = values.source as string | undefined;
const DRY_RUN = values["dry-run"] as boolean;

interface VersionRow {
  id: string;
  slug: string;
  frontmatter_id: string | null;
  effective_date: Date | null;
  is_current: boolean | null;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Statute Version Chain Builder");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Source: ${SOURCE_FILTER ?? "all"}`);
  console.log(`Dry-Run: ${DRY_RUN ? "JA" : "Nein"}`);
  console.log("");

  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No config. Set DATABASE_URL or ~/.gbrain/config.json.");
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));

  // 1. Find all (source, abk, para) groups with >1 version
  const sourceFilter = SOURCE_FILTER ? `AND source_id = $1` : "";
  const params = SOURCE_FILTER ? [SOURCE_FILTER] : [];

  const groups = await engine.executeRaw(
    `SELECT 
       source_id,
       frontmatter->>'abbreviation' as abk,
       frontmatter->>'paragraph' as para,
       COUNT(*) as version_count
     FROM pages
     WHERE frontmatter->>'abbreviation' IS NOT NULL
       AND frontmatter->>'paragraph' IS NOT NULL
       ${sourceFilter}
     GROUP BY source_id, abk, para
     HAVING COUNT(*) > 1
     ORDER BY version_count DESC`,
    params
  ) as Array<{ source_id: string; abk: string; para: string; version_count: number }>;

  console.log(`Found ${groups.length} version groups with >1 version`);

  if (groups.length === 0) {
    console.log("No version conflicts. Nothing to do.");
    await engine.disconnect();
    return;
  }

  // 2. For each group, compute the version chain
  let totalCurrent = 0;
  let totalSuperseded = 0;
  let totalSkipped = 0;

  for (const g of groups) {
    // Get all versions of this (source, abk, para), ordered by effective_date
    const versions = await engine.executeRaw(
      `SELECT 
         id, slug, 
         frontmatter->>'id' as frontmatter_id,
         effective_date,
         is_current
       FROM pages
       WHERE source_id = $1
         AND frontmatter->>'abbreviation' = $2
         AND frontmatter->>'paragraph' = $3
       ORDER BY effective_date ASC`,
      [g.source_id, g.abk, g.para]
    ) as VersionRow[];

    if (versions.length <= 1) {
      totalSkipped++;
      continue;
    }

    // The latest version is current; all others are superseded
    // superseded_at = effective_date of the NEXT version in the chain
    if (DRY_RUN) {
      console.log(
        `  ${g.abk} ${g.para}: ${versions.length} versions → ` +
        `current=${versions[versions.length - 1].slug} ` +
        `(${versions[versions.length - 1].effective_date?.toISOString().split("T")[0]})`
      );
      totalCurrent++;
      totalSuperseded += versions.length - 1;
      continue;
    }

    for (let i = 0; i < versions.length; i++) {
      const v = versions[i];
      const isCurrent = i === versions.length - 1;
      const supersededAt = isCurrent ? null : versions[i + 1].effective_date;

      await engine.executeRaw(
        `UPDATE pages 
         SET is_current = $1, superseded_at = $2
         WHERE id = $3`,
        [isCurrent, supersededAt, v.id]
      );

      if (isCurrent) totalCurrent++;
      else totalSuperseded++;
    }
  }

  console.log("");
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  ${DRY_RUN ? "DRY-RUN RESULT" : "VERSION CHAINS BUILT"}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`Version groups:     ${groups.length}`);
  console.log(`Current versions:    ${totalCurrent}`);
  console.log(`Superseded:         ${totalSuperseded}`);
  console.log(`Skipped (single):    ${totalSkipped}`);
  console.log("");

  // 3. Also set is_current = true for all pages WITHOUT version conflicts
  //    (single-version pages are trivially current)
  if (!DRY_RUN) {
    // Find single-version (source, abk, para) groups
    const singleGroups = await engine.executeRaw(
      `SELECT source_id,
              frontmatter->>'abbreviation' as abk,
              frontmatter->>'paragraph' as para
       FROM pages
       WHERE frontmatter->>'abbreviation' IS NOT NULL
         AND frontmatter->>'paragraph' IS NOT NULL
         ${sourceFilter}
       GROUP BY source_id, frontmatter->>'abbreviation', frontmatter->>'paragraph'
       HAVING COUNT(*) = 1`,
      params
    ) as Array<{ source_id: string; abk: string; para: string }>;

    let singleCount = 0;
    for (const g of singleGroups) {
      await engine.executeRaw(
        `UPDATE pages 
         SET is_current = true, superseded_at = null
         WHERE source_id = $1
           AND frontmatter->>'abbreviation' = $2
           AND frontmatter->>'paragraph' = $3
           AND is_current IS NULL`,
        [g.source_id, g.abk, g.para]
      );
      singleCount++;
    }
    console.log(`Single-version pages marked current: ${singleCount}`);
  }

  // 4. Summary
  if (!DRY_RUN) {
    const summary = await engine.executeRaw(
      `SELECT 
         COUNT(*) FILTER (WHERE is_current = true) as current,
         COUNT(*) FILTER (WHERE is_current = false) as superseded,
         COUNT(*) FILTER (WHERE is_current IS NULL) as unmarked,
         COUNT(*) as total
       FROM pages 
       WHERE frontmatter->>'abbreviation' IS NOT NULL ${sourceFilter}`,
      params
    ) as Array<{ current: number; superseded: number; unmarked: number; total: number }>;

    const s = summary[0];
    console.log("");
    console.log(`Final state:`);
    console.log(`  Current:     ${s.current}`);
    console.log(`  Superseded:  ${s.superseded}`);
    console.log(`  Unmarked:    ${s.unmarked}`);
    console.log(`  Total:       ${s.total}`);
  }

  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
