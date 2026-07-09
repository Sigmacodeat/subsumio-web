/**
 * Diagnostic v4: Test searchVector directly vs hybridSearch
 */
import { readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

async function main() {
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

  // Import StGB only
  const content = readFileSync(join(REPO_ROOT, "law-corpus/de/stgb.md"), "utf-8");
  process.stderr.write("Importing stgb...\n");
  await importFromContent(engine, "law/de/stgb", content, { noEmbed: false });

  // Check chunks
  const chunks = await engine.executeRaw<{ slug: string; count: string }>(
    `SELECT p.slug, COUNT(c.id) as count FROM pages p LEFT JOIN content_chunks c ON c.page_id = p.id GROUP BY p.slug`
  );
  for (const c of chunks) process.stderr.write(`  ${c.slug}: ${c.count} chunks\n`);

  const embCount = await engine.executeRaw<{ count: string }>(
    `SELECT COUNT(*) as count FROM content_chunks WHERE embedding IS NOT NULL`
  );
  process.stderr.write(`  Chunks with embedding: ${embCount[0]?.count}\n`);

  // Test 1: Direct embedQuery + searchVector
  const query = "Was bedeutet keine Strafe ohne Gesetz?";
  process.stderr.write(`\n--- Test 1: Direct searchVector ---\n`);
  process.stderr.write(`Query: "${query}"\n`);
  
  const emb = await embedQuery(query);
  process.stderr.write(`Embedding length: ${emb.length}\n`);
  
  const vResults = await engine.searchVector(emb, { limit: 8 } as any);
  process.stderr.write(`searchVector results: ${vResults.length}\n`);
  for (const r of vResults.slice(0, 5)) {
    process.stderr.write(`  slug=${r.slug} score=${r.score} chunk=${r.chunk_text?.slice(0, 80)?.replace(/\n/g, " ")}...\n`);
  }

  // Test 2: hybridSearch
  process.stderr.write(`\n--- Test 2: hybridSearch ---\n`);
  const hResults = await hybridSearch(engine, query, { limit: 8, autocut: false });
  process.stderr.write(`hybridSearch results: ${hResults.length}\n`);
  for (const r of hResults.slice(0, 5)) {
    process.stderr.write(`  slug=${r.slug} score=${r.score} chunk=${r.chunk_text?.slice(0, 80)?.replace(/\n/g, " ")}...\n`);
  }

  // Test 3: hybridSearch with keyword-only query
  process.stderr.write(`\n--- Test 3: hybridSearch "Strafe Gesetz" ---\n`);
  const kResults = await hybridSearch(engine, "Strafe Gesetz", { limit: 8, autocut: false });
  process.stderr.write(`hybridSearch results: ${kResults.length}\n`);
  for (const r of kResults.slice(0, 5)) {
    process.stderr.write(`  slug=${r.slug} score=${r.score} chunk=${r.chunk_text?.slice(0, 80)?.replace(/\n/g, " ")}...\n`);
  }

  // Test 4: Check what searchKeyword returns
  process.stderr.write(`\n--- Test 4: Direct searchKeyword ---\n`);
  try {
    const kResults2 = await engine.searchKeyword(query, { limit: 8 } as any);
    process.stderr.write(`searchKeyword results: ${kResults2.length}\n`);
    for (const r of kResults2.slice(0, 3)) {
      process.stderr.write(`  slug=${r.slug} score=${r.score}\n`);
    }
  } catch (err: any) {
    process.stderr.write(`searchKeyword ERROR: ${err?.message}\n`);
  }

  await engine.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
