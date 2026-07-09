/**
 * Check embedding dimensions in DB vs query embedding
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

async function main() {
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const { PGLiteEngine } = await import("../../core/pglite-engine.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { configureGateway, embedQuery } = await import("../../core/ai/gateway.ts");
  const { loadConfig } = await import("../../core/config.ts");

  const cfg = loadConfig();
  configureGateway({
    embedding_model: "openrouter:openai/text-embedding-3-small",
    embedding_dimensions: 1536,
    env: { ...process.env },
  } as any);

  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  // Import a tiny file
  const content = readFileSync(join(REPO_ROOT, "law-corpus/de/stbvv.md"), "utf-8");
  process.stderr.write("Importing stbvv...\n");
  await importFromContent(engine, "law/de/stbvv", content, { noEmbed: false });

  // Check embedding in DB
  const rows = await engine.executeRaw<{ id: number; embedding: string }>(
    `SELECT id, embedding::text as embedding FROM content_chunks LIMIT 1`
  );
  const embText = rows[0]?.embedding;
  process.stderr.write(`DB embedding (first 200 chars): ${embText?.slice(0, 200)}\n`);
  const dims = embText?.match(/[-\d.e]+/g)?.length;
  process.stderr.write(`DB embedding dimension count: ${dims}\n`);

  // Get query embedding
  const qEmb = await embedQuery("Test query");
  process.stderr.write(`Query embedding length: ${qEmb.length}\n`);
  process.stderr.write(`Query embedding (first 5): ${Array.from(qEmb.slice(0, 5)).join(", ")}\n`);

  // Try direct vector search
  process.stderr.write(`\n--- Direct searchVector test ---\n`);
  try {
    const results = await engine.searchVector(qEmb, { limit: 5 } as any);
    process.stderr.write(`searchVector results: ${results.length}\n`);
    for (const r of results) {
      process.stderr.write(`  slug=${r.slug} score=${r.score}\n`);
    }
  } catch (err: any) {
    process.stderr.write(`searchVector ERROR: ${err?.message}\n${err?.stack}\n`);
  }

  await engine.disconnect();
}

import { join } from "path";
main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
