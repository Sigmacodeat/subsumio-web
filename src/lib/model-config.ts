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

export type ModelProvider = "anthropic" | "openai" | "google" | "mistral" | "meta" | "zero-entropy";

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
}

export const AI_MODELS: ModelEntry[] = [
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    contextWindow: 200_000,
    costPer1MInput: 3.0,
    costPer1MOutput: 15.0,
    speedRating: 4,
    description: "Best balance of intelligence and speed. Ideal for legal drafting, analysis, and complex queries.",
    capabilities: ["tool-use", "vision", "extended-thinking"],
    brainScoped: true,
  },
  {
    id: "claude-opus-4-20250514",
    name: "Claude Opus 4",
    provider: "anthropic",
    contextWindow: 200_000,
    costPer1MInput: 15.0,
    costPer1MOutput: 75.0,
    speedRating: 2,
    description: "Highest intelligence for the most complex legal reasoning and multi-document synthesis.",
    capabilities: ["tool-use", "vision", "extended-thinking"],
    brainScoped: true,
  },
  {
    id: "claude-haiku-3-5-20241022",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    contextWindow: 200_000,
    costPer1MInput: 0.8,
    costPer1MOutput: 4.0,
    speedRating: 5,
    description: "Fastest and most cost-effective. Great for quick lookups, summaries, and high-volume tasks.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
  },
  {
    id: "gpt-4o-2024-11-20",
    name: "GPT-4o",
    provider: "openai",
    contextWindow: 128_000,
    costPer1MInput: 2.5,
    costPer1MOutput: 10.0,
    speedRating: 4,
    description: "Versatile multimodal model with strong general reasoning and code capabilities.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
  },
  {
    id: "gpt-4o-mini-2024-07-18",
    name: "GPT-4o mini",
    provider: "openai",
    contextWindow: 128_000,
    costPer1MInput: 0.15,
    costPer1MOutput: 0.6,
    speedRating: 5,
    description: "Ultra-low-cost model for high-volume, low-latency workloads. Good for classification and extraction.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
  },
  {
    id: "gemini-2-0-flash-001",
    name: "Gemini 2.0 Flash",
    provider: "google",
    contextWindow: 1_000_000,
    costPer1MInput: 0.1,
    costPer1MOutput: 0.4,
    speedRating: 5,
    description: "1M-token context window at breakthrough pricing. Ideal for whole-brain ingestion and large-document review.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
  },
  {
    id: "gemini-2-5-pro-preview-06-05",
    name: "Gemini 2.5 Pro",
    provider: "google",
    contextWindow: 1_000_000,
    costPer1MInput: 1.25,
    costPer1MOutput: 10.0,
    speedRating: 3,
    description: "Advanced reasoning with 1M-token context. Strong for complex multi-document legal analysis.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
  },
  {
    id: "mistral-large-2411",
    name: "Mistral Large 2",
    provider: "mistral",
    contextWindow: 128_000,
    costPer1MInput: 2.0,
    costPer1MOutput: 6.0,
    speedRating: 4,
    description: "European-hosted option with strong multilingual support. GDPR-friendly data residency.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
  },
  {
    id: "zero-entropy-legal-v1",
    name: "ZeroEntropy Legal v1",
    provider: "zero-entropy",
    contextWindow: 64_000,
    costPer1MInput: 0.5,
    costPer1MOutput: 1.5,
    speedRating: 4,
    description: "Specialized legal-domain model with built-in citation grounding. Optimized for German/EU law.",
    capabilities: ["citation-grounding", "legal-entities"],
    brainScoped: true,
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
