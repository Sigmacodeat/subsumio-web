/**
 * AI Model catalog — single source of truth for all selectable models.
 *
 * Each model entry provides the metadata the UI needs to render selection
 * cards and the API needs to validate user preferences:
 *   - id:          stable identifier persisted in the user record
 *   - name:        display name
 *   - provider:    upstream provider (anthropic, openai, google, …)
 *   - contextWindow: max input+output tokens
 *   - costPer1MInput / costPer1MOutput: USD per 1M tokens
 *   - speedRating: 1 (slowest) – 5 (fastest)
 *   - description: short human-readable summary
 *   - capabilities: tags for feature gating (vision, tool-use, etc.)
 *   - brainScoped:  whether this model is available per-brain or globally
 */

export type ModelProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "mistral"
  | "meta"
  | "zero-entropy"
  | "deepseek";

export interface ModelEntry {
  id: string;
  name: string;
  provider: ModelProvider;
  contextWindow: number;
  costPer1MInput: number;
  costPer1MOutput: number;
  speedRating: 1 | 2 | 3 | 4 | 5;
  description: string;
  capabilities: string[];
  brainScoped: boolean;
  /**
   * Where the provider's standard API endpoint processes requests.
   * "eu" is asserted only for providers with documented EU-hosted
   * infrastructure (Mistral). Everything else is "non_eu" by default,
   * INCLUDING models whose training/domain focus is EU/German law
   * (zero-entropy) — domain specialization is not the same claim as
   * infrastructure residency, and we don't assert residency without
   * documentation. This field is what `org.modelPolicy: "eu_only"`
   * filters against (see isModelAllowedForPolicy) — the technical
   * enforcement behind the "Keine US-Cloud, kein US-Modell" / EU-hosted
   * marketing claim in src/content/solutions.ts.
   */
  dataResidency: "eu" | "non_eu";
}

export const AI_MODELS: ModelEntry[] = [
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    provider: "anthropic",
    contextWindow: 200_000,
    costPer1MInput: 5.0,
    costPer1MOutput: 25.0,
    speedRating: 2,
    description:
      "Highest intelligence for the most complex legal reasoning and multi-document synthesis. Harvey's deep-reasoning model.",
    capabilities: ["tool-use", "vision", "extended-thinking"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    contextWindow: 200_000,
    costPer1MInput: 3.0,
    costPer1MOutput: 15.0,
    speedRating: 4,
    description:
      "Best balance of intelligence and speed. Default workhorse for legal drafting, analysis, and complex queries.",
    capabilities: ["tool-use", "vision", "extended-thinking"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    contextWindow: 200_000,
    costPer1MInput: 1.0,
    costPer1MOutput: 5.0,
    speedRating: 5,
    description:
      "Fast and cost-effective. Great for classification, summaries, and high-volume utility tasks.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    provider: "openai",
    contextWindow: 200_000,
    costPer1MInput: 4.0,
    costPer1MOutput: 16.0,
    speedRating: 3,
    description:
      "Strong structured output and citation grounding. Harvey uses it for regulated industries and research-heavy retrieval.",
    capabilities: ["tool-use", "vision", "structured-output"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
  {
    id: "gpt-5",
    name: "GPT-5",
    provider: "openai",
    contextWindow: 200_000,
    costPer1MInput: 5.0,
    costPer1MOutput: 20.0,
    speedRating: 3,
    description:
      "Versatile flagship model with strong general reasoning. Good for drafting-intensive work and complex analysis.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "openai",
    contextWindow: 128_000,
    costPer1MInput: 0.15,
    costPer1MOutput: 0.6,
    speedRating: 5,
    description:
      "Ultra-low-cost model for high-volume, low-latency workloads. Good for classification and extraction.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "google",
    contextWindow: 1_000_000,
    costPer1MInput: 2.0,
    costPer1MOutput: 12.0,
    speedRating: 3,
    description:
      "1M-token context with advanced reasoning. Strong for complex multi-document legal analysis and long-context review.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    contextWindow: 1_000_000,
    costPer1MInput: 0.1,
    costPer1MOutput: 0.4,
    speedRating: 5,
    description:
      "1M-token context at breakthrough pricing. Ideal for whole-brain ingestion and large-document review.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
  {
    id: "mistral-large-3",
    name: "Mistral Large 3",
    provider: "mistral",
    contextWindow: 256_000,
    costPer1MInput: 0.5,
    costPer1MOutput: 1.5,
    speedRating: 4,
    description:
      "EU-hosted flagship (Paris). Apache 2.0, ISO 27001/27701, EU AI Act Code of Practice. Ideal for EU-only Kanzleien and utility-tier tasks.",
    capabilities: ["tool-use", "structured-output", "vision"],
    brainScoped: true,
    dataResidency: "eu",
  },
  {
    id: "zero-entropy-legal-v1",
    name: "ZeroEntropy Legal v1",
    provider: "zero-entropy",
    contextWindow: 64_000,
    costPer1MInput: 0.5,
    costPer1MOutput: 1.5,
    speedRating: 4,
    description:
      "Specialized legal-domain model with built-in citation grounding. Optimized for German/EU law.",
    capabilities: ["citation-grounding", "legal-entities"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
];

const MODEL_MAP = new Map(AI_MODELS.map((m) => [m.id, m]));

export function getModelById(id: string): ModelEntry | undefined {
  return MODEL_MAP.get(id);
}

export function isValidModelId(id: string): boolean {
  return MODEL_MAP.has(id);
}

export const DEFAULT_MODEL_ID = AI_MODELS[0].id;

export function getProviderLabel(provider: ModelProvider): string {
  const labels: Record<ModelProvider, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    mistral: "Mistral AI",
    meta: "Meta",
    "zero-entropy": "ZeroEntropy",
    deepseek: "DeepSeek",
  };
  return labels[provider];
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(1)}`;
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

export function getSpeedLabel(rating: ModelEntry["speedRating"]): string {
  const labels: Record<number, string> = {
    1: "Very Slow",
    2: "Slow",
    3: "Medium",
    4: "Fast",
    5: "Very Fast",
  };
  return labels[rating] ?? "Unknown";
}

/**
 * Org-level model policy. "eu_only" technically enforces the "Keine
 * US-Cloud, kein US-Modell" claim in src/content/solutions.ts — without
 * this, that line was a description with nothing behind it (any user could
 * select an Anthropic/OpenAI/Google model regardless of the org's plan).
 * Undefined/"any" preserves prior behavior (no restriction) for every
 * existing org.
 */
export type ModelPolicy = "any" | "eu_only";

export function isModelAllowedForPolicy(
  model: Pick<ModelEntry, "dataResidency">,
  policy: ModelPolicy | undefined
): boolean {
  if (policy !== "eu_only") return true;
  return model.dataResidency === "eu";
}

/** Models selectable under the given policy — drives the settings UI's available list. */
export function modelsForPolicy(policy: ModelPolicy | undefined): ModelEntry[] {
  return AI_MODELS.filter((m) => isModelAllowedForPolicy(m, policy));
}
