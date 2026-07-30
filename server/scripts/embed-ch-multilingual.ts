#!/usr/bin/env bun
/**
 * Embed pending FR/IT chunks in the Postgres DB.
 *
 * Uses the same runEmbedCore as `gbrain embed --stale --source law-ch-fr`,
 * but as a standalone script for convenience.
 *
 * Usage:
 *   bun run scripts/embed-ch-multilingual.ts [--lang fr|it|both] [--dry-run]
 */

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const langIdx = args.indexOf("--lang");
const LANG = langIdx !== -1 ? args[langIdx + 1] : "both";

async function main() {
  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const { runEmbedCore } = await import("../src/commands/embed.ts");
  const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
  const { configureGateway } = await import("../src/core/ai/gateway.ts");

  const config = loadConfig();
  if (!config?.database_url) {
    console.error("FATAL: No DATABASE_URL in config or env");
    process.exit(1);
  }

  configureGateway(buildGatewayConfig(config));
  const engine = await createEngine(toEngineConfig(config));
  await engine.connect(toEngineConfig(config));

  try {
    const { reconfigureGatewayWithEngine } = await import("../src/core/ai/gateway.ts");
    await reconfigureGatewayWithEngine(engine);
  } catch {
    // Non-fatal
  }

  const langs = LANG === "both" ? ["fr", "it"] : [LANG];

  for (const lang of langs) {
    const sourceId = `law-ch-${lang}`;
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`  Embedding stale chunks for ${sourceId}`);
    console.log(`═══════════════════════════════════════════════════════════`);

    const result = await runEmbedCore(engine, {
      stale: true,
      sourceId,
      dryRun: DRY_RUN,
      catchUp: true,
    });

    console.log(
      `  Result: ${result.embedded} embedded, ${result.would_embed} would-embed, ${result.skipped} skipped`
    );
  }

  await engine.disconnect?.();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
