#!/usr/bin/env bun
/**
 * Embedding Signature Audit — reports the distribution of embedding models
 * stamped on pages in the brain, and flags any mismatch with the current
 * gateway configuration.
 *
 * Usage:
 *   bun scripts/audit-embedding-signatures.ts
 *
 * Exit codes:
 *   0 — consistent (or no pages with signatures yet)
 *   1 — mismatch detected (existing chunks need re-embedding)
 *   2 — error (couldn't connect to engine)
 */

import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway, reconfigureGatewayWithEngine } from "../src/core/ai/gateway.ts";
import {
  auditEmbeddingSignatures,
  formatSignatureWarning,
} from "../src/core/embedding-consistency-guard.ts";

async function main() {
  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  configureGateway(buildGatewayConfig(cfg));
  const engine = await createEngine(toEngineConfig(cfg));
  await reconfigureGatewayWithEngine(engine);

  try {
    const audit = await auditEmbeddingSignatures(engine);

    console.log("═".repeat(60));
    console.log("  Embedding Signature Audit");
    console.log("═".repeat(60));
    console.log();
    console.log(`  Current gateway signature: ${audit.currentSignature}`);
    console.log(`  Pages with signature:      ${audit.totalPagesWithSignature}`);
    console.log(`  Pages with NULL signature: ${audit.totalPagesNull}`);
    console.log();

    if (audit.distinctSignatures.length > 0) {
      console.log("  Signatures in DB:");
      for (const s of audit.distinctSignatures) {
        const marker = s.signature === audit.currentSignature ? " ← current" : "";
        const pct = (
          (s.page_count / (audit.totalPagesWithSignature + audit.totalPagesNull)) *
          100
        ).toFixed(1);
        console.log(`    ${s.signature}: ${s.page_count} pages (${pct}%)${marker}`);
      }
    } else {
      console.log("  No pages with embedding signature found.");
      console.log("  (Either a fresh brain or pre-v108 schema.)");
    }

    console.log();

    if (audit.isConsistent) {
      console.log("  ✅ Consistent — no model mixing detected.");
    } else {
      const warning = formatSignatureWarning(audit);
      if (warning) {
        console.log(warning);
      }
      console.log("  ❌ MISMATCH — re-embed needed: gbrain embed --stale");
    }

    console.log();
    console.log("═".repeat(60));

    process.exit(audit.isConsistent ? 0 : 1);
  } catch (err) {
    console.error("Audit failed:", err);
    process.exit(2);
  } finally {
    await engine.disconnect();
  }
}

main();
