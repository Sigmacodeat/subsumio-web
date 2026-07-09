/**
 * Quick diagnostic v2: test with increased timeout and 3 files including StGB
 */
import { readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

async function main() {
  // Set timeout before importing hybrid.ts
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const { PGLiteEngine } = await import("../../core/pglite-engine.ts");
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { configureGateway, embedQuery } = await import("../../core/ai/gateway.ts");
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

  // Import StGB (criminal code) — the file with the most misses
  const files = ["stgb.md", "bgb.md", "zpo.md"];
  for (const f of files) {
    const content = readFileSync(join(REPO_ROOT, "law-corpus/de", f), "utf-8");
    const slug = `law/de/${f.replace(/\.md$/, "")}`;
    process.stderr.write(`Importing ${slug}...\n`);
    await importFromContent(engine, slug, content, { noEmbed: false });
  }

  // Check chunks
  const chunks = await engine.executeRaw<{ slug: string; count: string }>(
    `SELECT p.slug, COUNT(c.id) as count FROM pages p LEFT JOIN content_chunks c ON c.page_id = p.id GROUP BY p.slug ORDER BY p.slug`
  );
  for (const c of chunks) {
    process.stderr.write(`  ${c.slug}: ${c.count} chunks\n`);
  }

  // Test query embedding directly
  process.stderr.write(`\n--- Direct embedQuery test ---\n`);
  try {
    const emb = await embedQuery("Was bedeutet keine Strafe ohne Gesetz?");
    process.stderr.write(`  Success! Length: ${emb.length}\n`);
  } catch (err: any) {
    process.stderr.write(`  FAILED: ${err?.message}\n`);
  }

  // Test search queries
  const queries = [
    "Was bedeutet keine Strafe ohne Gesetz?",
    "Was ist Notwehr und wann ist sie gerechtfertigt?",
    "Was ist der Unterschied zwischen Verbrechen und Vergehen?",
    "Strafe Gesetz",
    "Notwehr",
    "Verbrechen Vergehen",
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

  await engine.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
