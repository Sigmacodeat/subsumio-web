/**
 * Re-chunk pages that have content but 0 chunks.
 * Runs directly on the Hetzner server inside the docker container.
 *
 * Uses cursor-based batch processing to avoid loading all pages into memory.
 * Skips placeholder pages (content < 200 chars) that have no real text.
 * Sets chunker_version = 4 for legal pages (v4 legal chunker).
 *
 * Uses pg_advisory_lock to prevent concurrent rechunk processes from
 * running simultaneously (shared lock key with rechunk-orphans.ts and
 * simple-rechunk.ts). If another rechunk process is already running,
 * this script exits immediately with a clear message.
 *
 * Usage (on server):
 *   docker exec hetzner-web-1 bun /app/server/scripts/rechunk-missing.ts
 *   docker exec hetzner-web-1 bun /app/server/scripts/rechunk-missing.ts --dry-run
 *   docker exec hetzner-web-1 bun /app/server/scripts/rechunk-missing.ts --batch-size 500
 */
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "dry-run": { type: "boolean", default: false },
    "batch-size": { type: "string", default: "500" },
    "min-content-length": { type: "string", default: "200" },
  },
});

const DRY_RUN = values["dry-run"] as boolean;
const BATCH_SIZE = parseInt((values["batch-size"] as string) || "500", 10) || 500;
const MIN_CONTENT_LENGTH = parseInt((values["min-content-length"] as string) || "200", 10) || 200;

const DB_URL =
  process.env.DATABASE_URL || "postgres://sigmabrain:sigmabrain@localhost:5432/sigmabrain";

const LEGAL_CHUNKER_VERSION = 4;
const GENERIC_CHUNKER_VERSION = 3;

/** Shared advisory lock key for all rechunk scripts. Prevents concurrent execution. */
const RECHUNK_LOCK_KEY = 84001;

function ts(): string {
  return new Date().toISOString().split("T")[1].split(".")[0];
}

async function main() {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  await client.query("SET statement_timeout = 0");

  // Acquire advisory lock — prevents concurrent rechunk processes
  const { rows: lockRows } = await client.query(`SELECT pg_try_advisory_lock($1) AS acquired`, [
    RECHUNK_LOCK_KEY,
  ]);
  if (!lockRows[0]?.acquired) {
    console.error(
      `[${ts()}] ⚠️  Another rechunk process is already running (advisory lock ${RECHUNK_LOCK_KEY} held). Exiting.`
    );
    await client.end();
    process.exit(1);
  }
  console.log(`[${ts()}] Advisory lock acquired (${RECHUNK_LOCK_KEY})`);

  console.log(
    `[${ts()}] Re-chunk missing pages — mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}, batch: ${BATCH_SIZE}, min-content: ${MIN_CONTENT_LENGTH} chars`
  );

  // Import chunkers
  const { chunkText } = await import("../src/core/chunkers/recursive.ts");
  let chunkLegalSection:
    | typeof import("../src/core/chunkers/legal-statute.ts").chunkLegalSection
    | null = null;
  let chunkLegalDecision:
    | typeof import("../src/core/chunkers/legal-decision.ts").chunkLegalDecision
    | null = null;
  try {
    const legalMod = await import("../src/core/chunkers/legal-statute.ts");
    chunkLegalSection = legalMod.chunkLegalSection;
  } catch {}
  try {
    const decisionMod = await import("../src/core/chunkers/legal-decision.ts");
    chunkLegalDecision = decisionMod.chunkLegalDecision;
  } catch {}

  const isLegalPageCompat = (fm: Record<string, unknown>, pageType: string): boolean => {
    const fmType = fm?.type as string | undefined;
    return fmType === "law" || fmType === "statute" || pageType === "law" || pageType === "statute";
  };
  const isCourtDecisionPageCompat = (fm: Record<string, unknown>, pageType: string): boolean => {
    const fmType = fm?.type as string | undefined;
    return (
      fmType === "court_decision" ||
      fmType === "judgement" ||
      pageType === "court_decision" ||
      pageType === "judgement"
    );
  };

  // Count total work
  const { rows: countRows } = await client.query(
    `SELECT count(*) AS total FROM pages p
     WHERE p.deleted_at IS NULL
       AND length(COALESCE(p.compiled_truth, '')) >= $1
       AND NOT EXISTS (SELECT 1 FROM content_chunks cc WHERE cc.page_id = p.id)`,
    [MIN_CONTENT_LENGTH]
  );
  const totalToProcess = parseInt(countRows[0].total, 10);
  console.log(
    `[${ts()}] Found ${totalToProcess} pages with real content (>= ${MIN_CONTENT_LENGTH} chars) but 0 chunks`
  );

  if (totalToProcess === 0) {
    await client.end();
    return;
  }

  let processed = 0;
  let chunked = 0;
  let skipped = 0;
  let totalChunksCreated = 0;
  let errors = 0;
  let lastId = 0;

  while (true) {
    // Fetch next batch — cursor-based pagination by page.id (avoids OFFSET scan)
    const { rows: batch } = await client.query(
      `SELECT p.id, p.slug, p.type, p.compiled_truth, p.frontmatter, p.chunker_version,
              p.source_id
       FROM pages p
       WHERE p.deleted_at IS NULL
         AND p.id > $1
         AND length(COALESCE(p.compiled_truth, '')) >= $2
         AND NOT EXISTS (SELECT 1 FROM content_chunks cc WHERE cc.page_id = p.id)
       ORDER BY p.id
       LIMIT $3`,
      [lastId, MIN_CONTENT_LENGTH, BATCH_SIZE]
    );

    if (batch.length === 0) break;

    for (const page of batch) {
      processed++;
      lastId = page.id as number;

      try {
        const body = page.compiled_truth as string;
        const frontmatter = (page.frontmatter as Record<string, unknown>) || {};
        const type = page.type as string;

        let chunks: { text: string; chunk_source: string }[] = [];
        let chunkerVersion = GENERIC_CHUNKER_VERSION;

        const courtDecision = isCourtDecisionPageCompat(frontmatter, type);
        const legalPage = isLegalPageCompat(frontmatter, type);

        if (courtDecision && chunkLegalDecision) {
          chunkerVersion = LEGAL_CHUNKER_VERSION;
          const metadata = {
            jurisdiction: (frontmatter.jurisdiction as string) || "at",
            court: (frontmatter.court as string) || "",
            case_number: (frontmatter.case_number as string) || "",
            decision_date:
              (frontmatter.effective_date as string) || (frontmatter.date as string) || "",
            ecli: (frontmatter.ecli as string) || "",
            legal_area: (frontmatter.legal_area as string) || "",
          };
          const decisionChunks = chunkLegalDecision(body, metadata);
          for (const c of decisionChunks) {
            chunks.push({ text: c.text, chunk_source: "compiled_truth" });
          }
        } else if (legalPage && chunkLegalSection) {
          chunkerVersion = LEGAL_CHUNKER_VERSION;
          const metadata = {
            paragraph_ref: (frontmatter.paragraph as string) || "",
            statute_abbr: (frontmatter.abbreviation as string) || "",
            jurisdiction: (frontmatter.jurisdiction as string) || "at",
          };
          const legalChunks = chunkLegalSection(body, metadata);
          for (const c of legalChunks) {
            chunks.push({ text: c.text, chunk_source: "compiled_truth" });
          }
        } else {
          const genericChunks = chunkText(body);
          for (const c of genericChunks) {
            chunks.push({ text: c.text, chunk_source: "compiled_truth" });
          }
        }

        if (chunks.length === 0) {
          skipped++;
          continue;
        }

        if (DRY_RUN) {
          totalChunksCreated += chunks.length;
          chunked++;
          continue;
        }

        // Insert chunks + update chunker_version in a single transaction
        await client.query("BEGIN");

        const values: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i];
          values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3})`);
          params.push(page.id, i, c.text, c.chunk_source);
          paramIdx += 4;
        }

        await client.query(
          `INSERT INTO content_chunks (page_id, chunk_index, chunk_text, chunk_source)
           VALUES ${values.join(", ")}
           ON CONFLICT (page_id, chunk_index) DO NOTHING`,
          params
        );

        // Update chunker_version on the page
        await client.query(`UPDATE pages SET chunker_version = $1 WHERE id = $2`, [
          chunkerVersion,
          page.id,
        ]);

        await client.query("COMMIT");

        totalChunksCreated += chunks.length;
        chunked++;
      } catch (e) {
        errors++;
        try {
          await client.query("ROLLBACK");
        } catch {}
        if (errors <= 20) {
          console.error(
            `[${ts()}] Error on page ${page.id} (${page.slug}): ${(e as Error).message}`
          );
        }
      }
    }

    console.log(
      `[${ts()}] Progress: ${processed}/${totalToProcess} (${chunked} chunked, ${skipped} skipped, ${totalChunksCreated} chunks created, ${errors} errors) — lastId=${lastId}`
    );

    if (DRY_RUN && processed >= 1000) {
      console.log(`[${ts()}] DRY RUN — stopping after 1000 samples`);
      break;
    }
  }

  console.log(
    `\n[${ts()}] Done: ${processed} pages processed, ${chunked} chunked, ${skipped} skipped (empty), ${totalChunksCreated} chunks created, ${errors} errors`
  );

  if (DRY_RUN) {
    console.log("DRY RUN — no changes applied");
  }

  // Release advisory lock
  await client.query(`SELECT pg_advisory_unlock($1)`, [RECHUNK_LOCK_KEY]);
  console.log(`[${ts()}] Advisory lock released`);
  await client.end();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
