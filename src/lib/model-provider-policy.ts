/**
 * T7.3 / WP7.3.2 — Zero Data Retention / No-Training Policy Enforcement
 *
 * Enforces that AI providers do not retain or train on user data.
 * Each provider has a documented data policy that is checked before
 * every API call. If a provider's policy does not meet the org's
 * requirements, the call is blocked.
 *
 * Provider Data Policies:
 *   - "zdr":      Zero Data Retention — no storage, no training, no logging
 *   - "no_train": No Training — provider may store transiently but does not train
 *   - "standard": Standard — provider may store and use data per their T&Cs
 *
 * Org Requirements:
 *   - "zdr":      Requires zero data retention (strictest)
 *   - "no_train": Requires no training (allows transient storage)
 *   - "any":      No requirement (permissive)
 */

import type { ModelProvider } from "@/lib/model-config";

export type ProviderDataPolicy = "zdr" | "no_train" | "standard";
export type OrgDataRequirement = "zdr" | "no_train" | "any";

export interface ProviderPolicyConfig {
  provider: ModelProvider;
  dataPolicy: ProviderDataPolicy;
  /** Documented evidence URL or internal reference */
  evidence?: string;
  /** Whether the provider offers a ZDR addendum/enterprise agreement */
  zdrAvailable: boolean;
  /** Last verified date (ISO) */
  lastVerified?: string;
}

/**
 * Known provider data policies.
 * These must be verified against the provider's current DPA/terms.
 * Last review: 2026-07-14
 */
export const PROVIDER_POLICIES: Record<ModelProvider, ProviderPolicyConfig> = {
  anthropic: {
    provider: "anthropic",
    dataPolicy: "no_train",
    evidence: "Anthropic Commercial Terms §4 — no training on customer data",
    zdrAvailable: true,
    lastVerified: "2026-07-14",
  },
  openai: {
    provider: "openai",
    dataPolicy: "no_train",
    evidence: "OpenAI Enterprise — no training on business data",
    zdrAvailable: true,
    lastVerified: "2026-07-14",
  },
  google: {
    provider: "google",
    dataPolicy: "no_train",
    evidence: "Google Cloud AI — no training on customer data (Gemini API)",
    zdrAvailable: true,
    lastVerified: "2026-07-14",
  },
  mistral: {
    provider: "mistral",
    dataPolicy: "no_train",
    evidence: "Mistral AI — no training on customer data (EU-hosted)",
    zdrAvailable: true,
    lastVerified: "2026-07-14",
  },
  meta: {
    provider: "meta",
    dataPolicy: "standard",
    evidence: "Meta Llama — check hosting provider terms",
    zdrAvailable: false,
    lastVerified: "2026-07-14",
  },
  "zero-entropy": {
    provider: "zero-entropy",
    dataPolicy: "zdr",
    evidence: "ZeroEntropy — zero retention by design",
    zdrAvailable: true,
    lastVerified: "2026-07-14",
  },
  deepseek: {
    provider: "deepseek",
    dataPolicy: "no_train",
    evidence: "DeepSeek API — no training on API data (per ToS)",
    zdrAvailable: false,
    lastVerified: "2026-07-14",
  },
};

/**
 * Check if a provider's data policy satisfies the org's requirement.
 *
 * Hierarchy: zdr > no_train > standard
 *   - Org requires "zdr" → only "zdr" providers pass
 *   - Org requires "no_train" → "zdr" and "no_train" providers pass
 *   - Org requires "any" → all providers pass
 */
export function isProviderAllowedForOrg(
  provider: ModelProvider,
  orgRequirement: OrgDataRequirement
): boolean {
  if (orgRequirement === "any") return true;

  const policy = PROVIDER_POLICIES[provider];
  if (!policy) return false; // Unknown provider → fail-closed

  if (orgRequirement === "zdr") {
    return policy.dataPolicy === "zdr";
  }

  if (orgRequirement === "no_train") {
    return policy.dataPolicy === "zdr" || policy.dataPolicy === "no_train";
  }

  return true;
}

/**
 * Check if a specific model is allowed, combining data policy + data residency.
 */
export function isModelAllowedForOrg(
  provider: ModelProvider,
  dataResidency: "eu" | "non_eu",
  orgRequirement: OrgDataRequirement,
  orgModelPolicy: "any" | "eu_only" | undefined
): boolean {
  // Check data residency first
  if (orgModelPolicy === "eu_only" && dataResidency !== "eu") {
    return false;
  }

  // Check data policy
  return isProviderAllowedForOrg(provider, orgRequirement);
}

/**
 * Get all providers that satisfy the org's data requirement.
 */
export function getAllowedProviders(orgRequirement: OrgDataRequirement): ModelProvider[] {
  return (Object.keys(PROVIDER_POLICIES) as ModelProvider[]).filter((p) =>
    isProviderAllowedForOrg(p, orgRequirement)
  );
}

/**
 * Runtime enforcement check — called before every AI API call.
 * Throws if the provider is not allowed for the org.
 */
export function enforceProviderPolicy(
  provider: ModelProvider,
  orgRequirement: OrgDataRequirement
): void {
  if (!isProviderAllowedForOrg(provider, orgRequirement)) {
    throw new Error(
      `Provider '${provider}' does not satisfy org data requirement '${orgRequirement}'. ` +
        `Provider policy: ${PROVIDER_POLICIES[provider]?.dataPolicy ?? "unknown"}. ` +
        `Call blocked by data governance policy.`
    );
  }
}

/**
 * Get a human-readable summary of the provider's data policy.
 */
export function getProviderPolicySummary(provider: ModelProvider): string {
  const policy = PROVIDER_POLICIES[provider];
  if (!policy) return "Unknown provider";
  const labels: Record<ProviderDataPolicy, string> = {
    zdr: "Zero Data Retention",
    no_train: "No Training",
    standard: "Standard",
  };
  return `${labels[policy.dataPolicy]}${policy.zdrAvailable ? " (ZDR available)" : ""}`;
}
