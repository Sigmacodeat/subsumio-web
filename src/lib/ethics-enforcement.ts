/**
 * Ethics Enforcement — P0-ETHICS-002.
 *
 * Bindet Ethical-Wall- und AI-Provider-Policy Enforcement an
 * permissions.ts und model-config.ts.
 *
 * - Ethical Wall: Blockiert User-Zugriff auf Matters mit ethical_wall_active
 * - AI-Provider-Policy: Bestimmt erlaubte AI-Modelle basierend auf
 *   Privilege-Level, Confidentiality und Data Residency Requirements
 * - Enforcement-Punkte: API-Routes, AI-Prompt-Erstellung, Export
 */

import type { RouteAction } from "@/lib/permissions";
import type { ModelEntry, ModelProvider } from "@/lib/model-config";
import { AI_MODELS } from "@/lib/model-config";
import type { PermissionInfo } from "@/lib/legal-types";
import type { PrivilegeLevel, ConfidentialityLevel } from "@/lib/privilege-labels";

// ── Ethical Wall Enforcement ──────────────────────────────────────────

export interface EthicalWallContext {
  user_id: string;
  user_role: string;
  case_slug: string;
  permissions: PermissionInfo;
}

export interface EthicalWallResult {
  allowed: boolean;
  reason: string;
  blocked_by: "ethical_wall" | "not_in_allowed" | "confidential" | "none";
}

export function enforceEthicalWall(ctx: EthicalWallContext): EthicalWallResult {
  const { user_id, permissions } = ctx;
  const allowedUsers = permissions.allowed_users ?? [];
  const blockedUsers = permissions.blocked_users ?? [];
  const ethicalWallActive = blockedUsers.length > 0;

  if (!ethicalWallActive) {
    if (permissions.visibility === "restricted" && allowedUsers.length > 0) {
      if (!allowedUsers.includes(user_id)) {
        return {
          allowed: false,
          reason: "User not in allowed_users list for restricted matter",
          blocked_by: "not_in_allowed",
        };
      }
    }
    return { allowed: true, reason: "No ethical wall active", blocked_by: "none" };
  }

  if (blockedUsers.includes(user_id)) {
    return {
      allowed: false,
      reason: `User ${user_id} is blocked by ethical wall on case ${ctx.case_slug}`,
      blocked_by: "ethical_wall",
    };
  }

  if (permissions.visibility === "confidential" && !allowedUsers.includes(user_id)) {
    return {
      allowed: false,
      reason: `Confidential matter — user ${user_id} not explicitly allowed`,
      blocked_by: "confidential",
    };
  }

  if (allowedUsers.length > 0 && !allowedUsers.includes(user_id)) {
    return {
      allowed: false,
      reason: `User ${user_id} not in allowed_users for ethical-wall case ${ctx.case_slug}`,
      blocked_by: "not_in_allowed",
    };
  }

  return { allowed: true, reason: "Ethical wall passed", blocked_by: "none" };
}

// ── AI Provider Policy ────────────────────────────────────────────────

export type DataResidencyRequirement = "eu_only" | "gdpr_compliant" | "any";

export interface AiProviderPolicyContext {
  privilege: PrivilegeLevel;
  confidentiality: ConfidentialityLevel;
  data_residency: DataResidencyRequirement;
  case_slug?: string;
  includes_pii: boolean;
}

export interface AiProviderPolicyResult {
  allowed_models: ModelEntry[];
  blocked_models: ModelEntry[];
  blocked_providers: ModelProvider[];
  reason: string;
}

const EU_PROVIDERS: ModelProvider[] = ["mistral"];
const GDPR_COMPLIANT_PROVIDERS: ModelProvider[] = [
  "anthropic",
  "openai",
  "google",
  "mistral",
  "zero-entropy",
];

export function enforceAiProviderPolicy(ctx: AiProviderPolicyContext): AiProviderPolicyResult {
  const blockedProviders = new Set<ModelProvider>();
  const reasons: string[] = [];

  // Data residency enforcement
  if (ctx.data_residency === "eu_only") {
    for (const provider of [
      "anthropic",
      "openai",
      "google",
      "meta",
      "zero-entropy",
    ] as ModelProvider[]) {
      if (!EU_PROVIDERS.includes(provider)) {
        blockedProviders.add(provider);
      }
    }
    reasons.push("EU-only data residency requires EU-hosted provider");
  } else if (ctx.data_residency === "gdpr_compliant") {
    for (const model of AI_MODELS) {
      if (!GDPR_COMPLIANT_PROVIDERS.includes(model.provider)) {
        blockedProviders.add(model.provider);
      }
    }
    reasons.push("GDPR-compliant data residency required");
  }

  // Privilege enforcement: attorney_client data must not use external providers
  // unless data residency is ensured
  if (ctx.privilege === "attorney_client" && ctx.data_residency === "any") {
    reasons.push("attorney_client privilege requires GDPR-compliant data residency");
    for (const provider of [
      "anthropic",
      "openai",
      "google",
      "mistral",
      "meta",
      "zero-entropy",
    ] as ModelProvider[]) {
      if (!GDPR_COMPLIANT_PROVIDERS.includes(provider)) {
        blockedProviders.add(provider);
      }
    }
  }

  // Confidentiality enforcement: restricted data requires EU-only
  if (ctx.confidentiality === "restricted") {
    if (ctx.data_residency !== "eu_only") {
      reasons.push("restricted confidentiality requires EU-only data residency");
    }
    for (const provider of [
      "anthropic",
      "openai",
      "google",
      "meta",
      "zero-entropy",
    ] as ModelProvider[]) {
      if (!EU_PROVIDERS.includes(provider)) {
        blockedProviders.add(provider);
      }
    }
  }

  // PII with no data residency → block all non-GDPR
  if (ctx.includes_pii && ctx.data_residency === "any") {
    reasons.push("PII data requires GDPR-compliant provider");
    for (const provider of [
      "anthropic",
      "openai",
      "google",
      "mistral",
      "meta",
      "zero-entropy",
    ] as ModelProvider[]) {
      if (!GDPR_COMPLIANT_PROVIDERS.includes(provider)) {
        blockedProviders.add(provider);
      }
    }
  }

  const allowedModels = AI_MODELS.filter((m) => !blockedProviders.has(m.provider));
  const blockedModels = AI_MODELS.filter((m) => blockedProviders.has(m.provider));

  return {
    allowed_models: allowedModels,
    blocked_models: blockedModels,
    blocked_providers: Array.from(blockedProviders),
    reason: reasons.join("; ") || "All models allowed",
  };
}

// ── Route-Level Enforcement Integration ───────────────────────────────

export interface EnforcementContext {
  user_id: string;
  user_role: string;
  action: RouteAction;
  case_slug?: string;
  permissions?: PermissionInfo;
  privilege?: PrivilegeLevel;
  confidentiality?: ConfidentialityLevel;
}

export interface EnforcementResult {
  allowed: boolean;
  reasons: string[];
  ethical_wall?: EthicalWallResult;
  ai_policy?: AiProviderPolicyResult;
}

export function enforceAll(ctx: EnforcementContext): EnforcementResult {
  const reasons: string[] = [];
  let ethicalWall: EthicalWallResult | undefined;
  let aiPolicy: AiProviderPolicyResult | undefined;

  // Ethical wall check
  if (ctx.permissions && ctx.case_slug) {
    ethicalWall = enforceEthicalWall({
      user_id: ctx.user_id,
      user_role: ctx.user_role,
      case_slug: ctx.case_slug,
      permissions: ctx.permissions,
    });
    if (!ethicalWall.allowed) {
      reasons.push(ethicalWall.reason);
    }
  }

  // AI provider policy check (for AI-related actions)
  if (ctx.privilege && ctx.confidentiality) {
    const isAiAction =
      ctx.action.startsWith("query.") ||
      ctx.action.startsWith("legal.") ||
      ctx.action === "brain.write";
    if (isAiAction) {
      aiPolicy = enforceAiProviderPolicy({
        privilege: ctx.privilege,
        confidentiality: ctx.confidentiality,
        data_residency: "any",
        case_slug: ctx.case_slug,
        includes_pii: true,
      });
      if (aiPolicy.allowed_models.length === 0) {
        reasons.push("No AI models available after provider policy enforcement");
      }
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    ethical_wall: ethicalWall,
    ai_policy: aiPolicy,
  };
}

// ── Model Selection Helper ────────────────────────────────────────────

export function selectModelForContext(
  policy: AiProviderPolicyResult,
  preferredModelId?: string
): ModelEntry | null {
  if (policy.allowed_models.length === 0) return null;

  if (preferredModelId) {
    const preferred = policy.allowed_models.find((m) => m.id === preferredModelId);
    if (preferred) return preferred;
  }

  // Default to first allowed model
  return policy.allowed_models[0] ?? null;
}

// ── Audit Helpers ─────────────────────────────────────────────────────

export interface EthicsAuditEntry {
  timestamp: string;
  user_id: string;
  action: string;
  case_slug?: string;
  result: "allowed" | "denied";
  reason: string;
  enforcement_type: "ethical_wall" | "ai_provider_policy" | "combined";
}

export function createEthicsAuditEntry(
  ctx: EnforcementContext,
  result: EnforcementResult
): EthicsAuditEntry {
  return {
    timestamp: new Date().toISOString(),
    user_id: ctx.user_id,
    action: ctx.action,
    case_slug: ctx.case_slug,
    result: result.allowed ? "allowed" : "denied",
    reason: result.reasons.join("; ") || "allowed",
    enforcement_type:
      result.ethical_wall && result.ai_policy
        ? "combined"
        : result.ethical_wall
          ? "ethical_wall"
          : "ai_provider_policy",
  };
}
