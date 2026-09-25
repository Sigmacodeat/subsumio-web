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

/**
 * Models a user can pick for answers (chat, research, Copilot). Only models the
 * engine actually routes: the engine maps these ids in
 * `server/src/core/model-config.ts` (USER_MODEL_CHOICES). "auto" is not listed
 * here — it means "no pick", and the engine routes by question complexity
 * (Sonnet 5, Opus 5 for complex questions). Prices are the provider's list
 * prices per 1M tokens; they drive the cost hints in the picker.
 */
export const AI_MODELS: ModelEntry[] = [
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    contextWindow: 1_000_000,
    costPer1MInput: 2.0,
    costPer1MOutput: 10.0,
    speedRating: 4,
    description:
      "Standard für Rechtsfragen, Entwürfe und Aktenfragen. Gutes Verhältnis von Qualität, Tempo und Kosten.",
    capabilities: ["tool-use", "vision", "extended-thinking"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
  {
    id: "claude-opus-5",
    name: "Claude Opus 5",
    provider: "anthropic",
    contextWindow: 1_000_000,
    costPer1MInput: 5.0,
    costPer1MOutput: 25.0,
    speedRating: 3,
    description:
      "Gründlich: Subsumtion, mehrere Gesetze, lange Schriftsätze. Etwa doppelt so teuer wie Sonnet 5.",
    capabilities: ["tool-use", "vision", "extended-thinking"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
  {
    id: "claude-fable-5-1",
    name: "Claude Fable 5.1",
    provider: "anthropic",
    contextWindow: 1_000_000,
    costPer1MInput: 10.0,
    costPer1MOutput: 50.0,
    speedRating: 1,
    description:
      "Tiefenanalyse für die schwierigsten Fälle. Stärkstes Modell, langsam und etwa fünfmal so teuer wie Sonnet 5.",
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
    description: "Schnell und günstig für einfache Fragen, Zusammenfassungen und Nachschlagen.",
    capabilities: ["tool-use", "vision"],
    brainScoped: true,
    dataResidency: "non_eu",
  },
  {
    id: "mistral-large-3",
    name: "Mistral Large",
    provider: "mistral",
    contextWindow: 128_000,
    costPer1MInput: 2.0,
    costPer1MOutput: 6.0,
    speedRating: 4,
    description:
      "Europäischer Anbieter. Einzige Wahl, wenn die Kanzlei nur EU-Modelle zulässt; bei komplexer Subsumtion schwächer als Claude.",
    capabilities: ["tool-use"],
    brainScoped: true,
    dataResidency: "eu",
  },
];

const MODEL_MAP = new Map(AI_MODELS.map((m) => [m.id, m]));

export function getModelById(id: string): ModelEntry | undefined {
  return MODEL_MAP.get(id);
}

export function isValidModelId(id: string): boolean {
  return MODEL_MAP.has(id);
}

/** "No pick": the engine chooses by question complexity. */
export const AUTO_MODEL_ID = "auto";

/** The model the engine's automatic routing uses for normal questions. */
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

/** Model prices are in US dollars; shown in Austrian number format ("0,12 US$"). */
export function formatCost(usd: number, lang: "de" | "en" = "de"): string {
  const digits = usd < 0.01 ? 3 : usd < 1 ? 2 : 1;
  if (lang === "en") return `$${usd.toFixed(digits)}`;
  const n = new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(usd);
  return `${n} US$`;
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

export function getSpeedLabel(rating: ModelEntry["speedRating"]): string {
  const labels: Record<number, string> = {
    1: "Sehr langsam",
    2: "Langsam",
    3: "Mittel",
    4: "Schnell",
    5: "Sehr schnell",
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
