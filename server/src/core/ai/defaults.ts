/**
 * Leaf module holding the default embedding model + dimensions.
 *
 * Extracted so schema helpers (pglite-schema.ts, postgres-engine.ts) +
 * registry helpers (search/embedding-column.ts) can import the constants
 * without pulling the full AI gateway (which loads every provider SDK).
 *
 * gateway.ts re-exports these so existing import sites keep working.
 *
 * Single source of truth for "what does a fresh brain look like when the
 * user passes zero flags?" Touching these defaults touches every fresh
 * install AND every doctor consistency check.
 */

// v0.36.0 made ZeroEntropy (zembed-1 @ 1280d) the system default after evals
// showed 11/20 wins vs OpenAI (6) and Voyage (4) on real-corpus benchmarks.
//
// Subsumio moved the default back to OpenAI text-embedding-3-small @ 1536d:
// the deployed corpus is embedded at 1536d and SUBSUMIO_EMBEDDING_MODEL is
// authoritative over any DB config value (see server/.env.example), so a
// 1280d default only ever produced dim-mismatch failures on fresh installs.
// 1536 is NOT a ZeroEntropy Matryoshka step — those are
// {2560, 1280, 640, 320, 160, 80, 40}, see ZEROENTROPY_VALID_DIMS in
// ai/dims.ts. Switching this back to a ZE model means switching the
// dimension to a valid ZE step too, and re-embedding every chunk.
export const DEFAULT_EMBEDDING_MODEL = "openrouter:openai/text-embedding-3-small";
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
