/**
 * Shared, public, READ-ONLY reference sources (the statute/case-law corpus,
 * `law-*`) that every firm may read alongside its own source. Configured by
 * the operator via `SUBSUMIO_SHARED_READ_SOURCES` (legacy
 * `GBRAIN_SHARED_READ_SOURCES`), comma-separated. Empty by default.
 *
 * Single parser for the web API's federated read scope and for firm MCP
 * tokens, so both honour exactly the same operator-granted list.
 */
const SOURCE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function sharedReadSourcesFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.SUBSUMIO_SHARED_READ_SOURCES ?? env.GBRAIN_SHARED_READ_SOURCES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && SOURCE_ID_RE.test(s));
}
