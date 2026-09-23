/**
 * Pre-test setup: opt the gateway into legacy 1536-d / OpenAI defaults
 * so tests written before v0.37 (with hardcoded `new Float32Array(1536)`
 * fixtures) keep working without per-file edits.
 *
 * v0.37 fix wave changed the canonical gateway defaults to
 * `zeroentropyai:zembed-1` / 1280-d (matching the system default chosen
 * in v0.36.0). Tests that don't explicitly configure the gateway
 * previously got 1536-d schemas via the stale `getPGLiteSchema()`
 * default; v0.37 fixed that so the schema tracks the gateway default
 * (1280 out of the box). Tests with 1536-d fixtures need the schema to
 * stay at 1536 — this preload pins it.
 *
 * Imported by `bunfig.toml` via `preload = ["./test/helpers/legacy-embedding-preload.ts"]`.
 *
 * Tests that need a different embedding shape (the new v0.37 tests,
 * future ZE-1280 tests, or specific-provider tests) should call
 * `configureGateway()` explicitly in their own beforeAll, which
 * overwrites this preload.
 */
import {
  configureGateway,
  getEmbeddingDimensions,
  resetGateway,
} from "../../src/core/ai/gateway.ts";
import { beforeEach, afterAll } from "bun:test";

const LEGACY_CONFIG = {
  embedding_model: "openai:text-embedding-3-large",
  embedding_dimensions: 1536,
} as const;

function applyLegacy() {
  configureGateway({
    embedding_model: LEGACY_CONFIG.embedding_model,
    embedding_dimensions: LEGACY_CONFIG.embedding_dimensions,
    env: { ...process.env },
  });
}

if (process.env.GBRAIN_DEBUG_PRELOAD === "1") {
  console.error("[legacy-embedding-preload] applying OpenAI/1536");
}

// Initial application — covers tests that don't reset the gateway.
applyLegacy();

// Per-test re-application — handles tests that call `resetGateway()`
// in their setup/teardown. Bun's preload allows registering global
// hooks; this fires before every test in every file in the shard.
//
// Tests that need a different gateway config (the new v0.37 tests,
// future ZE-1280 tests) call `configureGateway()` in their own
// beforeAll AFTER this beforeEach runs. Order is:
//   1. legacy preload beforeEach → applyLegacy (1536)
//   2. file-local beforeAll → may overwrite to ZE/1280
// Since beforeAll runs once per file BEFORE the first beforeEach,
// file-local beforeAll wins for that file's tests. ✓
beforeEach(() => {
  try {
    // Only re-apply if the gateway was reset (or never configured).
    // Tests that explicitly configured a different model in their
    // own beforeAll get to keep it — we only restore the legacy
    // default when the slot is empty.
    getEmbeddingDimensions();
  } catch {
    applyLegacy();
  }
});

// Per-file cleanup — a file that configures a non-legacy gateway model
// (e.g. via configureGateway in its own beforeAll) would otherwise leak
// that config into the NEXT file in the same shard process: the empty-slot
// check above only re-applies when the slot is empty, not when it holds a
// foreign model. Resetting after each file guarantees the next file starts
// from a clean slate and gets the legacy pin from the beforeEach above.
// Observed failure: sync-cost-preview's unconfigured-fallback test saw the
// 0.02/MTok default instead of the 0.13 fallback because a prior shard file
// had configured the gateway.
afterAll(() => {
  try {
    resetGateway();
  } catch {
    // ignore — cleanup must never fail a file that already passed
  }
});
