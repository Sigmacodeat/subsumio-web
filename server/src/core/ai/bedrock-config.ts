/**
 * Amazon Bedrock constants shared by the `bedrock` recipe, the gateway factory,
 * the provider-mode tier defaults (model-config.ts) and the residency
 * classification in model-registry.ts. Leaf module: no imports, so the
 * registry can read it without pulling provider SDKs.
 *
 * Model ids are Bedrock EU cross-region (geo) inference profiles, verified
 * 2026-09-23 against the Bedrock model cards
 * (docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-*.html).
 * On `bedrock-runtime` these three models accept ONLY a geo or global
 * inference profile id (the bare `anthropic.…` id is not offered on-demand),
 * so the `eu.` profile is the EU-resident route. Called from eu-central-1 the
 * `eu.` profiles route to eu-central-1, eu-north-1, eu-south-1, eu-south-2,
 * eu-west-1 and eu-west-3 — all EU member states.
 */

/** Default region when AWS_REGION is unset (Frankfurt). */
export const BEDROCK_DEFAULT_REGION = "eu-central-1";

/**
 * Regions whose `eu.` geo profile routes only to EU member states. Excluded on
 * purpose although AWS labels them "EU geo": eu-west-2 (London) adds the UK
 * and eu-central-2 (Zurich) adds Switzerland to the destination set — both
 * outside EU/EEA, which the Austrian bar rules require.
 */
export const BEDROCK_EU_SOURCE_REGIONS: ReadonlySet<string> = new Set([
  "eu-central-1",
  "eu-west-1",
  "eu-west-3",
  "eu-north-1",
  "eu-south-1",
  "eu-south-2",
]);

/** Verified EU inference profile ids (Bedrock model cards, 2026-09-23). */
export const BEDROCK_EU_MODELS = {
  haiku45: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
  sonnet5: "eu.anthropic.claude-sonnet-5",
  opus5: "eu.anthropic.claude-opus-5",
} as const;

/** Region the gateway signs for and calls. Reads the gateway env snapshot. */
export function resolveBedrockRegion(env: Record<string, string | undefined>): string {
  const raw = env.AWS_REGION?.trim() || env.AWS_DEFAULT_REGION?.trim();
  return raw || BEDROCK_DEFAULT_REGION;
}

/**
 * The runtime endpoint for a region. Always passed explicitly to the SDK so
 * AWS_ENDPOINT_URL / AWS_ENDPOINT_URL_BEDROCK_RUNTIME in the process
 * environment cannot silently redirect traffic past the residency check.
 */
export function bedrockRuntimeBaseUrl(region: string): string {
  return `https://bedrock-runtime.${region}.amazonaws.com`;
}

/** Vendor prefixes of bare Bedrock foundation-model ids (`anthropic.claude-…`). */
const BEDROCK_VENDORS: ReadonlySet<string> = new Set([
  "anthropic",
  "amazon",
  "meta",
  "mistral",
  "cohere",
  "ai21",
  "deepseek",
  "openai",
  "qwen",
  "writer",
  "twelvelabs",
  "stability",
  "google",
  "minimax",
  "moonshot",
  "nvidia",
  "zai",
  "xai",
]);

/**
 * Routing scope of a Bedrock model id:
 *   - `{ kind: "in_region" }` — bare foundation-model id (`anthropic.claude-…`),
 *     processed in the calling region only.
 *   - `{ kind: "geo", geo }`  — system inference profile (`eu.…`, `us.…`,
 *     `global.…`), routed across that geography.
 *   - `{ kind: "unknown" }`   — anything else (ARNs of application inference
 *     profiles, typos). Residency cannot be derived from the id.
 */
export function bedrockRoutingScope(
  modelId: string
): { kind: "in_region" } | { kind: "geo"; geo: string } | { kind: "unknown" } {
  const id = modelId.trim().toLowerCase();
  if (!id || id.startsWith("arn:")) return { kind: "unknown" };
  const dot = id.indexOf(".");
  if (dot <= 0) return { kind: "unknown" };
  const prefix = id.slice(0, dot);
  if (BEDROCK_VENDORS.has(prefix)) return { kind: "in_region" };
  if (/^[a-z][a-z-]{1,9}$/.test(prefix)) {
    const rest = id.slice(dot + 1);
    const vendor = rest.slice(0, Math.max(0, rest.indexOf(".")));
    if (BEDROCK_VENDORS.has(vendor)) return { kind: "geo", geo: prefix };
  }
  return { kind: "unknown" };
}

/** True when the Bedrock credentials needed for a request are present. */
export function hasBedrockCredentials(env: Record<string, string | undefined>): boolean {
  if (env.AWS_BEARER_TOKEN_BEDROCK?.trim()) return true;
  return Boolean(env.AWS_ACCESS_KEY_ID?.trim() && env.AWS_SECRET_ACCESS_KEY?.trim());
}
