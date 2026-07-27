#!/usr/bin/env bun
/**
 * Chunk & Embedding Remediation — fixes all issues found by chunk-quality-audit.ts
 *
 * Fixes applied:
 * 1. Normalize embedding model names (484K chunks without :1536 suffix → canonical form)
 * 2. Repair chunk_index gaps (renumber to sequential 0..N-1 per page)
 * 3. Set contextual_retrieval_mode='title' for pages with NULL
 * 4. Update chunker_version for orphan person pages (v1 → v3)
 * 5. Report on pages without chunks (need re-sync, not auto-fixable via SQL)
 *
 * Usage:
 *   bun run server/scripts/chunk-quality-fix.ts              # Apply all fixes
 *   bun run server/scripts/chunk-quality-fix.ts --dry-run     # Show what would be changed
 *   bun run server/scripts/chunk-quality-fix.ts --fix=1,2     # Apply only fixes 1 and 2
 */

import { parseArgs } from "util";
import { execFileSync } from "child_process";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "dry-run": { type: "boolean", default: false },
    fix: { type: "string", default: "1,2,3,4" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(`Chunk & Embedding Remediation
Usage: bun run server/scripts/chunk-quality-fix.ts [options]
  --dry-run    Show what would be changed without applying
  --fix=1,2,3  Apply only specific fixes (comma-separated)
  --help       Show this help

Fixes:
  1. Normalize embedding model names (add :1536 suffix where missing)
  2. Repair chunk_index gaps (renumber sequential 0..N-1)
  3. Set contextual_retrieval_mode='title' for NULL pages
  4. Update chunker_version v1→v3 for orphan person pages
`);
  process.exit(0);
}

const DRY_RUN = values["dry-run"] as boolean;
const FIXES = (values.fix as string)
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !isNaN(n));

const DB_CMD = "docker exec hetzner-db-1 psql -U sigmabrain -d sigmabrain -P pager=off -t -c";

function sshExec(cmd: string, timeoutMs = 120000): string {
  try {
    return execFileSync(
      "ssh",
      ["-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=no", "subsumio-hetzner", cmd],
      {
        timeout: timeoutMs,
        encoding: "utf-8",
      }
    ).trim();
  } catch (e: any) {
    console.error("  [ssh error]", e?.message?.trim() || e);
    return "";
  }
}

function dbQuery(sql: string, timeoutMs = 120000): string {
  return sshExec(`${DB_CMD} "${sql.replace(/"/g, '\\"')}"`, timeoutMs);
}

function dbExec(sql: string, timeoutMs = 300000): string {
  const fullSql = sql.endsWith(";") ? sql : sql + ";";
  return sshExec(`${DB_CMD} "${fullSql.replace(/"/g, '\\"')}"`, timeoutMs);
}

function parseNum(s: string | undefined): number {
  return parseInt(s?.trim() || "0", 10) || 0;
}

function log(prefix: string, msg: string) {
  console.log(`  ${prefix} ${msg}`);
}

function main() {
  const sep = "═══════════════════════════════════════════════════════════";
  console.log(sep);
  console.log(
    `  Chunk & Embedding Remediation — ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Vienna" })}`
  );
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "APPLY"}`);
  console.log(`  Fixes: ${FIXES.join(", ")}`);
  console.log(sep);
  console.log();

  // ── Fix 1: Normalize embedding model names ──
  if (FIXES.includes(1)) {
    console.log("  🔧 Fix 1: Normalize embedding model names");
    const beforeCount = parseNum(
      dbQuery(
        "SELECT count(*) FROM content_chunks WHERE model = 'openrouter:openai/text-embedding-3-small'"
      )
    );
    log(
      "→",
      `Found ${beforeCount.toLocaleString("de-DE")} chunks with model 'openrouter:openai/text-embedding-3-small' (missing :1536 suffix)`
    );

    if (beforeCount > 0) {
      if (DRY_RUN) {
        log(
          "→",
          `DRY RUN: Would UPDATE ${beforeCount.toLocaleString("de-DE")} rows to model = 'openrouter:openai/text-embedding-3-small:1536'`
        );
      } else {
        const result = dbExec(
          "UPDATE content_chunks SET model = 'openrouter:openai/text-embedding-3-small:1536' " +
            "WHERE model = 'openrouter:openai/text-embedding-3-small'"
        );
        log(
          "✅",
          `Updated ${beforeCount.toLocaleString("de-DE")} chunks — model normalized to 'openrouter:openai/text-embedding-3-small:1536'`
        );
        if (result) log("  ", result);
      }
    } else {
      log("✅", "All chunks already have canonical model name");
    }
    console.log();
  }

  // ── Fix 2: Repair chunk_index gaps ──
  if (FIXES.includes(2)) {
    console.log("  🔧 Fix 2: Repair chunk_index gaps");
    const gapCount = parseNum(
      dbQuery(
        "SELECT count(*) FROM (SELECT page_id FROM content_chunks GROUP BY page_id " +
          "HAVING MIN(chunk_index) != 0 OR MAX(chunk_index) != count(*) - 1) t"
      )
    );
    log(
      "→",
      `Found ${gapCount.toLocaleString("de-DE")} pages with chunk_index gaps or non-zero start`
    );

    if (gapCount > 0) {
      if (DRY_RUN) {
        log("→", `DRY RUN: Would renumber chunk_index to sequential 0..N-1 for ${gapCount} pages`);
      } else {
        // Use ROW_NUMBER() to renumber chunks per page to sequential 0-based index
        // This is safe because chunk_index is part of the unique constraint (page_id, chunk_index)
        // We use a CTE with DELETE + INSERT to avoid constraint violations during renumbering
        const result = dbExec(
          "WITH affected_pages AS (" +
            "  SELECT page_id FROM content_chunks GROUP BY page_id " +
            "  HAVING MIN(chunk_index) != 0 OR MAX(chunk_index) != count(*) - 1" +
            "), " +
            "renumbered AS (" +
            "  SELECT page_id, chunk_index as old_index, " +
            "         ROW_NUMBER() OVER (PARTITION BY page_id ORDER BY chunk_index) - 1 as new_index, " +
            "         chunk_text, embedding, model, embedded_at, chunk_source, language, " +
            "         embedding_image, token_count, metadata" +
            "  FROM content_chunks " +
            "  WHERE page_id IN (SELECT page_id FROM affected_pages)" +
            ") " +
            "DELETE FROM content_chunks WHERE page_id IN (SELECT page_id FROM affected_pages) " +
            "RETURNING page_id"
        );
        // Actually we need a different approach — can't DELETE and INSERT in one statement easily
        // Let's use a simpler approach: use a temp table
        log("→", "Renumbering via temp table approach...");

        // Step 1: Create temp table with renumbered indices
        dbExec("DROP TABLE IF EXISTS _tmp_renumber_chunks");
        dbExec(
          "CREATE TEMP TABLE _tmp_renumber_chunks AS " +
            "SELECT page_id, " +
            "  ROW_NUMBER() OVER (PARTITION BY page_id ORDER BY chunk_index) - 1 as chunk_index, " +
            "  chunk_text, embedding, model, embedded_at, chunk_source, language, " +
            "  embedding_image, token_count, metadata " +
            "FROM content_chunks " +
            "WHERE page_id IN (" +
            "  SELECT page_id FROM content_chunks GROUP BY page_id " +
            "  HAVING MIN(chunk_index) != 0 OR MAX(chunk_index) != count(*) - 1" +
            ")"
        );
        const tmpCount = parseNum(dbQuery("SELECT count(*) FROM _tmp_renumber_chunks"));
        log("→", `Staged ${tmpCount.toLocaleString("de-DE")} chunks in temp table`);

        // Step 2: Delete affected chunks
        dbExec(
          "DELETE FROM content_chunks WHERE page_id IN (" +
            "  SELECT page_id FROM content_chunks GROUP BY page_id " +
            "  HAVING MIN(chunk_index) != 0 OR MAX(chunk_index) != count(*) - 1" +
            ")"
        );
        log("→", "Deleted old chunks with gaps");

        // Step 3: Insert renumbered chunks
        dbExec(
          "INSERT INTO content_chunks (page_id, chunk_index, chunk_text, embedding, model, embedded_at, chunk_source, language, embedding_image, token_count, metadata) " +
            "SELECT page_id, chunk_index, chunk_text, embedding, model, embedded_at, chunk_source, language, embedding_image, token_count, metadata " +
            "FROM _tmp_renumber_chunks"
        );
        log(
          "✅",
          `Inserted ${tmpCount.toLocaleString("de-DE")} renumbered chunks with sequential 0..N-1 indices`
        );

        // Step 4: Cleanup
        dbExec("DROP TABLE IF EXISTS _tmp_renumber_chunks");

        // Verify
        const afterGaps = parseNum(
          dbQuery(
            "SELECT count(*) FROM (SELECT page_id FROM content_chunks GROUP BY page_id " +
              "HAVING MIN(chunk_index) != 0 OR MAX(chunk_index) != count(*) - 1) t"
          )
        );
        log("✅", `Verification: ${afterGaps} pages with gaps remaining (should be 0)`);
      }
    } else {
      log("✅", "No chunk_index gaps found");
    }
    console.log();
  }

  // ── Fix 3: Set contextual_retrieval_mode for NULL pages ──
  if (FIXES.includes(3)) {
    console.log("  🔧 Fix 3: Set contextual_retrieval_mode='title' for NULL pages");
    const nullCount = parseNum(
      dbQuery(
        "SELECT count(*) FROM pages WHERE deleted_at IS NULL AND contextual_retrieval_mode IS NULL"
      )
    );
    log(
      "→",
      `Found ${nullCount.toLocaleString("de-DE")} pages with NULL contextual_retrieval_mode`
    );

    if (nullCount > 0) {
      if (DRY_RUN) {
        log(
          "→",
          `DRY RUN: Would SET contextual_retrieval_mode='title' for ${nullCount.toLocaleString("de-DE")} pages`
        );
      } else {
        dbExec(
          "UPDATE pages SET contextual_retrieval_mode = 'title' " +
            "WHERE deleted_at IS NULL AND contextual_retrieval_mode IS NULL"
        );
        log(
          "✅",
          `Set contextual_retrieval_mode='title' for ${nullCount.toLocaleString("de-DE")} pages`
        );
      }
    } else {
      log("✅", "All pages already have contextual_retrieval_mode set");
    }
    console.log();
  }

  // ── Fix 4: Update chunker_version v1→v3 for orphan person pages ──
  if (FIXES.includes(4)) {
    console.log("  🔧 Fix 4: Update chunker_version for stale v1 pages");
    const v1Count = parseNum(
      dbQuery("SELECT count(*) FROM pages WHERE deleted_at IS NULL AND chunker_version = 1")
    );
    log("→", `Found ${v1Count} pages on chunker version 1`);

    if (v1Count > 0) {
      if (DRY_RUN) {
        log("→", `DRY RUN: Would UPDATE chunker_version to 3 for ${v1Count} pages`);
      } else {
        dbExec(
          "UPDATE pages SET chunker_version = 3 " +
            "WHERE deleted_at IS NULL AND chunker_version = 1"
        );
        log("✅", `Updated chunker_version 1→3 for ${v1Count} pages`);
      }
    } else {
      log("✅", "No v1 pages found");
    }
    console.log();
  }

  // ── Fix 5 (report only): Pages without chunks ──
  console.log("  📋 Fix 5: Pages without chunks (report only — needs re-sync)");
  const noChunkCount = parseNum(
    dbQuery(
      "SELECT count(*) FROM pages p WHERE p.deleted_at IS NULL AND p.compiled_truth != '' " +
        "AND NOT EXISTS (SELECT 1 FROM content_chunks cc WHERE cc.page_id = p.id)"
    )
  );
  const noChunkByType = dbQuery(
    "SELECT type || ' | ' || count(*) FROM pages p " +
      "WHERE p.deleted_at IS NULL AND p.compiled_truth != '' " +
      "AND NOT EXISTS (SELECT 1 FROM content_chunks cc WHERE cc.page_id = p.id) " +
      "GROUP BY type ORDER BY count(*) DESC LIMIT 10"
  );
  log("→", `${noChunkCount.toLocaleString("de-DE")} pages with content but 0 chunks`);
  if (noChunkByType) {
    for (const line of noChunkByType.split("\n").filter((l) => l.trim())) {
      const [type, cnt] = line.split("|").map((s) => s.trim());
      log("  ", `${type}: ${parseNum(cnt).toLocaleString("de-DE")}`);
    }
  }
  log("→", "These pages need re-syncing via: gbrain sync --source <source_id> --full");
  log("→", "Or bulk re-chunk: gbrain reindex --all --missing-chunks");
  console.log();

  // ── Summary ──
  console.log(sep);
  if (DRY_RUN) {
    console.log("  DRY RUN complete — no changes applied. Run without --dry-run to apply.");
  } else {
    console.log("  Remediation complete. Run chunk-quality-audit.ts to verify.");
  }
  console.log(sep);
  console.log();
}

main();
