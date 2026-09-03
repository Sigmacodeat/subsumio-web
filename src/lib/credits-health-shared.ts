/**
 * Shared credits-health module for the Next.js web app.
 *
 * This is a thin wrapper that imports the engine's credits-preflight module
 * so the HTTP endpoint and the engine's pipeline pre-flight check use the
 * same code path (same cache, same alert logic).
 *
 * The engine module lives at server/src/core/ai/credits-preflight.ts.
 */

export {
  getCreditsHealth,
  assertProviderCredits,
} from "../../server/src/core/ai/credits-preflight";
export type {
  CreditsHealthResult,
  ProviderHealth,
} from "../../server/src/core/ai/credits-preflight";
