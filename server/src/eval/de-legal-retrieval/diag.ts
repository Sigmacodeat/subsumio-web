/**
 * Quick diagnostic: import 3 small law files and test search
 */
import { readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

async function main() {
  const { PGLiteEngine } = await import("../../core/pglite-engine.ts");
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { configureGateway } = await import("../../core/ai/gateway.ts");
  const { loadConfig } = await import("../../core/config.ts");

  const cfg = loadConfig();
  configureGateway({
    embedding_model: "openrouter:openai/text-embedding-3-small",
    embedding_dimensions: 1536,
    expansion_model: cfg?.expansion_model ?? "openrouter:deepseek/deepseek-chat",
    chat_model: cfg?.chat_model ?? "openrouter:deepseek/deepseek-chat",
    env: { ...process.env },
  } as any);

  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  // Import 3 small files
  const files = ["stbvv.md", "lstdv.md", "gewstg.md"];
  for (const f of files) {
    const content = readFileSync(join(REPO_ROOT, "law-corpus/de", f), "utf-8");
    const slug = `law/de/${f.replace(/\.md$/, "")}`;
    process.stderr.write(`Importing ${slug}...\n`);
    await importFromContent(engine, slug, content, { noEmbed: false });
  }

  // Test queries
  const queries = [
    "Was bedeutet keine Strafe ohne Gesetz?",
    "Was ist Notwehr und wann ist sie gerechtfertigt?",
    "Was ist ein Kaufmann im Sinne des Handelsgesetzbuchs?",
    "Steuer",
    "Abgaben",
    "Gewerbesteuer",
  ];

  for (const q of queries) {
    process.stderr.write(`\nQuery: "${q}"\n`);
    try {
      const results = await hybridSearch(engine, q, { limit: 8, autocut: false });
      process.stderr.write(`  Results: ${results.length}\n`);
      for (const r of results.slice(0, 5)) {
        process.stderr.write(`    slug=${r.slug} score=${r.score.toFixed(4)} chunk=${r.chunk_text.slice(0, 80).replace(/\n/g, " ")}...\n`);
      }
    } catch (err: any) {
      process.stderr.write(`  ERROR: ${err?.message}\n`);
    }
  }

  // Also test keyword-only search (no vector)
  process.stderr.write(`\n--- Keyword-only search ---\n`);
  for (const q of queries.slice(0, 3)) {
    process.stderr.write(`\nQuery: "${q}"\n`);
    try {
      const results = await hybridSearch(engine, q, { limit: 8, autocut: false } as any);
      process.stderr.write(`  Results: ${results.length}\n`);
      for (const r of results.slice(0, 3)) {
        process.stderr.write(`    slug=${r.slug} score=${r.score.toFixed(4)}\n`);
      }
    } catch (err: any) {
      process.stderr.write(`  ERROR: ${err?.message}\n`);
    }
  }

  // Check what pages exist
  process.stderr.write(`\n--- Pages in DB ---\n`);
  const pages = await engine.executeRaw<{ slug: string; title: string }>(
    `SELECT slug, title FROM pages ORDER BY slug`
  );
  for (const p of pages) {
    process.stderr.write(`  ${p.slug}: ${p.title}\n`);
  }

  // Check chunks count per page
  process.stderr.write(`\n--- Chunks per page ---\n`);
  const chunks = await engine.executeRaw<{ slug: string; count: string }>(
    `SELECT p.slug, COUNT(c.id) as count FROM pages p LEFT JOIN content_chunks c ON c.page_id = p.id GROUP BY p.slug ORDER BY p.slug`
  );
  for (const c of chunks) {
    process.stderr.write(`  ${c.slug}: ${c.count} chunks\n`);
  }

  // Check if embeddings exist
  process.stderr.write(`\n--- Embedding check ---\n`);
  const embCount = await engine.executeRaw<{ count: string }>(
    `SELECT COUNT(*) as count FROM content_chunks WHERE embedding IS NOT NULL`
  );
  process.stderr.write(`  Chunks with embedding: ${embCount[0]?.count}\n`);

  const nullEmb = await engine.executeRaw<{ count: string }>(
    `SELECT COUNT(*) as count FROM content_chunks WHERE embedding IS NULL`
  );
  process.stderr.write(`  Chunks without embedding: ${nullEmb[0]?.count}\n`);

  await engine.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
