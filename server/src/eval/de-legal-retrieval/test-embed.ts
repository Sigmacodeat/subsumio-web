/**
 * Quick test: is query embedding working via OpenRouter?
 */
async function main() {
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

  process.stderr.write("Testing embedQuery...\n");
  try {
    const emb = await embedQuery("Was bedeutet keine Strafe ohne Gesetz?");
    process.stderr.write(`Success! Embedding length: ${emb.length}\n`);
    process.stderr.write(`First 5 values: ${Array.from(emb.slice(0, 5)).join(", ")}\n`);
  } catch (err: any) {
    process.stderr.write(`FAILED: ${err?.message}\n`);
    process.stderr.write(`${err?.stack}\n`);
  }
}

main().catch(console.error);
