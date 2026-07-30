/**
 * CI Corpus Seed Script
 *
 * Imports a subset of the law-corpus into a Postgres engine for CI benchmarks.
 * This is the minimal seed needed by the DACH retrieval benchmark:
 * - All DE laws (BGB, StGB, ZPO, AO, HGB, etc.)
 * - All AT laws (ABGB, ZPO, StGB, etc.)
 * - All CH laws (OR, ZGB, StGB, etc.)
 * - EU laws (DSGVO, etc.)
 *
 * Usage:
 *   bun run src/eval/seed-ci-corpus.ts [--jurisdiction de|at|ch|eu|all]
 *
 * Environment:
 *   DATABASE_URL — Postgres connection string (e.g. postgresql://postgres:postgres@localhost:5432/gbrain_test)
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

interface CorpusFile {
  slug: string;
  abbreviation: string;
  content: string;
}

function loadLawCorpus(jurisdiction: string): CorpusFile[] {
  const corpusDir = join(REPO_ROOT, "law-corpus", jurisdiction);
  if (!existsSync(corpusDir)) {
    process.stderr.write(`[seed] no corpus directory for ${jurisdiction} at ${corpusDir}\n`);
    return [];
  }
  const files = readdirSync(corpusDir).filter((f) => f.endsWith(".md"));
  const out: CorpusFile[] = [];
  for (const file of files) {
    const content = readFileSync(join(corpusDir, file), "utf-8");
    const slug = file.replace(/\.md$/, "");
    const abbreviation = slug.toUpperCase();
    out.push({ slug, abbreviation, content });
  }
  return out;
}

function parseArgs(argv: string[]): { jurisdiction: string } {
  let jurisdiction = "all";
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--jurisdiction" && i + 1 < args.length) {
      jurisdiction = args[++i];
    }
  }
  return { jurisdiction };
}

async function main() {
  const opts = parseArgs(process.argv);

  if (!process.env.DATABASE_URL) {
    process.stderr.write("[seed] ERROR: DATABASE_URL not set\n");
    process.exit(1);
  }

  const { createEngine } = await import("../core/engine-factory.ts");
  const { loadConfig, toEngineConfig } = await import("../core/config.ts");
  const { importFromContent } = await import("../core/import-file.ts");
  const { configureGateway } = await import("../core/ai/gateway.ts");
  const { buildGatewayConfig } = await import("../core/ai/build-gateway-config.ts");

  const cfg = loadConfig();
  if (!cfg) {
    process.stderr.write("[seed] ERROR: No engine configured\n");
    process.exit(1);
  }
  configureGateway(buildGatewayConfig(cfg));

  // In CI (nightly), no embedding API key may be available.
  // Fall back to keyword-only import (noEmbed=true) so the corpus is at least
  // searchable via keyword/TS vector search. Vector search won't work, but
  // the benchmark guard (empty-DB check) will pass and keyword hits are measured.
  const hasEmbeddingKey = !!(
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_API_KEY_FALLBACK ||
    process.env.OPENAI_API_KEY
  );
  const noEmbed = !hasEmbeddingKey;
  if (noEmbed) {
    process.stderr.write(
      `[seed] WARNING: No embedding API key found — importing with noEmbed=true (keyword-only)\n`
    );
  } else {
    process.stderr.write(`[seed] embedding API key found — importing with embeddings\n`);
  }

  process.stderr.write(`[seed] connecting to engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  await engine.initSchema();

  const jurisdictions =
    opts.jurisdiction === "all" ? ["de", "at", "ch", "ch-fr", "ch-it", "eu"] : [opts.jurisdiction];

  let totalImported = 0;
  for (const jur of jurisdictions) {
    const files = loadLawCorpus(jur);
    process.stderr.write(`[seed] ${jur}: ${files.length} corpus files\n`);

    for (const cf of files) {
      const slug = `legal/statutes/${jur}/${cf.slug}`;
      try {
        await importFromContent(engine, slug, cf.content, { noEmbed });
        totalImported++;
      } catch (err) {
        process.stderr.write(`[seed] ERROR importing ${slug}: ${(err as Error)?.message}\n`);
      }
    }
  }

  process.stderr.write(`[seed] imported ${totalImported} files total\n`);

  // Verify
  const allSlugs = await engine.getAllSlugs();
  let legalCount = 0;
  for (const slug of allSlugs) {
    if (slug.startsWith("legal/statutes/")) legalCount++;
  }
  process.stderr.write(`[seed] verification: ${legalCount} legal/statutes/ pages in DB\n`);

  if (legalCount === 0) {
    process.stderr.write(`[seed] WARNING: 0 legal pages after seed — benchmark will abort\n`);
    process.exit(1);
  }

  await engine.disconnect();
  process.stderr.write(`[seed] done\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
