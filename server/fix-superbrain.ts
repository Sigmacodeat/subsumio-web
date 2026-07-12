/**
 * Superbrain Fix: Unified slug audit + cleanup + import plan
 * 1. Check which laws exist under legal/statutes/ format
 * 2. Check which laws exist under law/ format (old duplicates)
 * 3. Identify truly missing laws
 * 4. Delete old duplicate law/X/Y/N slugs (brain_817d98c8)
 * 5. Report what needs importing
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const CORPUS_ROOT = "/Users/msc/subsumio-web/law-corpus";
const envContent = readFileSync("/Users/msc/subsumio-web/server/.env", "utf-8");
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim() ?? "";

const sql = postgres(dbUrl, { max: 2, idle_timeout: 20, connect_timeout: 10, ssl: false, onnotice: () => {} });

// ── 1. Inventory all source files ────────────────────────────────────────────
interface SourceFile { path: string; baseSlug: string; statSlug: string; size: number; jurisdiction: string; abbr: string; }
function inventoryCorpus(): SourceFile[] {
  const files: SourceFile[] = [];
  for (const jur of ["de", "at", "ch", "eu"]) {
    const dir = join(CORPUS_ROOT, jur);
    try {
      for (const entry of readdirSync(dir)) {
        if (entry === "judikate" || !entry.endsWith(".md")) continue;
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        const abbr = entry.replace(/\.md$/, "");
        files.push({
          path: fullPath,
          baseSlug: `law/${jur}/${abbr}`,
          statSlug: `legal/statutes/${jur}/${abbr}`,
          size: stat.size,
          jurisdiction: jur,
          abbr,
        });
      }
    } catch (e) { console.log(`  [WARN] Could not read ${dir}: ${e}`); }
  }
  return files;
}

async function main() {
  const sourceFiles = inventoryCorpus();
  console.log(`Source files: ${sourceFiles.length}\n`);

  // ── 2. Query DB: distinct base slugs under legal/statutes/ format ─────────
  const statBases = await sql`
    SELECT 
      regexp_replace(slug, '/[a-z]+-[0-9a-z]+$', '') as base_slug,
      COUNT(*) as page_count,
      SUM(LENGTH(compiled_truth)) as total_content,
      MIN(source_id) as source_id
    FROM pages 
    WHERE type = 'law' AND slug LIKE 'legal/statutes/%'
    GROUP BY base_slug ORDER BY base_slug
  `;
  const statBaseMap = new Map<string, any>();
  for (const row of statBases) statBaseMap.set(row.base_slug, row);

  // ── 3. Query DB: distinct base slugs under law/ format (old) ──────────────
  const lawBases = await sql`
    SELECT 
      regexp_replace(slug, '/[0-9a-z]+$', '') as base_slug,
      COUNT(*) as page_count,
      SUM(LENGTH(compiled_truth)) as total_content,
      MIN(source_id) as source_id
    FROM pages 
    WHERE type = 'law' AND slug LIKE 'law/%' AND slug NOT LIKE 'legal/statutes/%'
    GROUP BY base_slug ORDER BY base_slug
  `;
  const lawBaseMap = new Map<string, any>();
  for (const row of lawBases) lawBaseMap.set(row.base_slug, row);

  console.log("=== legal/statutes/ format (new, split import) ===");
  console.log(`Distinct base slugs: ${statBases.length}`);
  for (const [slug, row] of statBaseMap)
    console.log(`  ${slug}: ${row.page_count} pages, ${((Number(row.total_content)||0)/1024).toFixed(1)} KB, source=${row.source_id}`);

  console.log(`\n=== law/ format (old, monolith import) ===`);
  console.log(`Distinct base slugs: ${lawBases.length}`);
  for (const [slug, row] of lawBaseMap)
    console.log(`  ${slug}: ${row.page_count} pages, ${((Number(row.total_content)||0)/1024).toFixed(1)} KB, source=${row.source_id}`);

  // ── 4. Gap analysis: truly missing laws ───────────────────────────────────
  console.log("\n=== Gap Analysis (both formats) ===\n");
  const missing: SourceFile[] = [];
  const inStatFormat: SourceFile[] = [];
  const inLawFormat: SourceFile[] = [];
  const inBoth: SourceFile[] = [];

  for (const sf of sourceFiles) {
    const inStat = statBaseMap.has(sf.statSlug);
    const inLaw = lawBaseMap.has(sf.baseSlug);
    if (inStat && inLaw) inBoth.push(sf);
    else if (inStat) inStatFormat.push(sf);
    else if (inLaw) inLawFormat.push(sf);
    else missing.push(sf);
  }

  console.log(`In legal/statutes/ format: ${inStatFormat.length}`);
  console.log(`In law/ format (old): ${inLawFormat.length}`);
  console.log(`In BOTH formats (duplicate!): ${inBoth.length}`);
  console.log(`TRULY MISSING: ${missing.length}`);

  if (missing.length > 0) {
    console.log("\n--- Truly Missing Laws ---");
    for (const m of missing)
      console.log(`  [${m.jurisdiction.toUpperCase()}] ${m.abbr} (${(m.size/1024).toFixed(1)} KB) — slug: ${m.statSlug}`);
  }

  if (inBoth.length > 0) {
    console.log("\n--- Duplicated Laws (in both formats — old law/ should be deleted) ---");
    for (const d of inBoth)
      console.log(`  [${d.jurisdiction.toUpperCase()}] ${d.abbr} — law/: ${lawBaseMap.get(d.baseSlug)?.page_count} pages, legal/statutes/: ${statBaseMap.get(d.statSlug)?.page_count} pages`);
  }

  // ── 5. Delete old duplicate law/X/Y/N slugs (brain_817d98c8) ──────────────
  console.log("\n=== Cleanup: Delete old law/ format duplicates ===\n");
  const oldCount = await sql`
    SELECT COUNT(*) as cnt FROM pages 
    WHERE type = 'law' AND slug LIKE 'law/%' AND slug NOT LIKE 'legal/statutes/%'
  `;
  console.log(`Old law/ format pages to delete: ${oldCount[0].cnt}`);

  const oldBySource = await sql`
    SELECT source_id, COUNT(*) as cnt FROM pages 
    WHERE type = 'law' AND slug LIKE 'law/%' AND slug NOT LIKE 'legal/statutes/%'
    GROUP BY source_id ORDER BY cnt DESC
  `;
  for (const row of oldBySource)
    console.log(`  source_id="${row.source_id}": ${row.cnt} pages`);

  // Delete old law/ format pages and their chunks
  console.log("\nDeleting old law/ format pages + chunks...");
  const delChunks = await sql`
    DELETE FROM content_chunks 
    WHERE page_id IN (SELECT id FROM pages WHERE type = 'law' AND slug LIKE 'law/%' AND slug NOT LIKE 'legal/statutes/%')
    RETURNING id
  `;
  console.log(`  Deleted ${delChunks.length} chunks`);

  const delPages = await sql`
    DELETE FROM pages 
    WHERE type = 'law' AND slug LIKE 'law/%' AND slug NOT LIKE 'legal/statutes/%'
    RETURNING id
  `;
  console.log(`  Deleted ${delPages.length} pages`);

  // ── 6. Summary ────────────────────────────────────────────────────────────
  const remaining = await sql`SELECT COUNT(*) as cnt FROM pages WHERE type = 'law'`;
  console.log(`\nRemaining law pages: ${remaining[0].cnt}`);
  console.log(`\n=== FINAL SUMMARY ===`);
  console.log(`Source files: ${sourceFiles.length}`);
  console.log(`In legal/statutes/ format: ${inStatFormat.length + inBoth.length}`);
  console.log(`Truly missing: ${missing.length}`);
  console.log(`Old duplicates deleted: ${delPages.length}`);
  console.log(`Remaining law pages: ${remaining[0].cnt}`);

  if (missing.length > 0) {
    console.log(`\n--- LAWS TO IMPORT ---`);
    // Group by jurisdiction
    const byJur: Record<string, SourceFile[]> = {};
    for (const m of missing) {
      if (!byJur[m.jurisdiction]) byJur[m.jurisdiction] = [];
      byJur[m.jurisdiction].push(m);
    }
    for (const [jur, files] of Object.entries(byJur)) {
      console.log(`  ${jur.toUpperCase()}: ${files.length} laws — ${files.map(f => f.abbr).join(", ")}`);
    }
  }

  await sql.end();
}

main().catch(err => { console.error("Failed:", err); process.exit(1); });
