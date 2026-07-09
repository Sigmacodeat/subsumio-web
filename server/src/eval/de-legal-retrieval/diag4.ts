/**
 * Check if isAvailable("embedding") returns true with our config
 */
async function main() {
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const { configureGateway, isAvailable, diagnoseEmbedding } = await import("../../core/ai/gateway.ts");
  const { loadConfig } = await import("../../core/config.ts");

  const cfg = loadConfig();
  configureGateway({
    embedding_model: "openrouter:openai/text-embedding-3-small",
    embedding_dimensions: 1536,
    expansion_model: cfg?.expansion_model ?? "openrouter:deepseek/deepseek-chat",
    chat_model: cfg?.chat_model ?? "openrouter:deepseek/deepseek-chat",
    env: { ...process.env },
  } as any);

  process.stderr.write(`OPENROUTER_API_KEY in process.env: ${!!process.env.OPENROUTER_API_KEY}\n`);
  
  const diag = diagnoseEmbedding();
  process.stderr.write(`diagnoseEmbedding: ${JSON.stringify(diag)}\n`);

  const available = isAvailable("embedding");
  process.stderr.write(`isAvailable("embedding"): ${available}\n`);

  // Also check with the resolved column's model
  const available2 = isAvailable("embedding", "openrouter:openai/text-embedding-3-small");
  process.stderr.write(`isAvailable("embedding", "openrouter:openai/text-embedding-3-small"): ${available2}\n`);
}

main().catch(console.error);
