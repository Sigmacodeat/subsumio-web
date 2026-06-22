/**
 * Ethical-Wall & AI-Provider-Policy Enforcement — P0-ETHICS-002.
 *
 * Bindet Ethical-Wall- und AI-Provider-Policy an permissions.ts und model-config.ts.
 *
 * Ethical Wall:
 *   - Prüft ob ein User durch blocked_users einer Akte ausgeschlossen ist
 *   - Prüft ob ein User auf Dokumente/AI-Prompts/Exporte einer Ethical-Wall-Akte zugreifen darf
 *   - Überschreibt normale RBAC-Checks (Ethical Wall hat Vorrang)
 *
 * AI-Provider-Policy:
 *   - Bestimmt welche AI-Provider für welche Matter-Privilege-Level erlaubt sind
 *   - EU-DSGVO: attorney_client Daten nur bei EU-hosted Providers (Mistral, ZeroEntropy)
 *   - work_product: alle Provider erlaubt, aber kein externer Transfer ohne Consent
 *   - none: alle Provider erlaubt
 */

import type { ModelProvider, ModelEntry } from "@/lib/model-config";
import type { PermissionInfo } from "@/lib/legal-types";
import type { PrivilegeLevel, ConfidentialityLevel } from "@/lib/privilege-labels";

// ── Ethical Wall Types ────────────────────────────────────────────────

export interface EthicalWallCheckResult {
  allowed: boolean;
  reason: string;
  ethical_wall_active: boolean;
  user_blocked: boolean;
}

/**
 * Prüft, ob ein User durch eine Ethical Wall blockiert wird.
 * Ethical Wall hat Vorrang vor normaler RBAC.
 */
export function checkEthicalWall(
  userId: string,
  permissions: PermissionInfo | undefined
): EthicalWallCheckResult {
  if (!permissions) {
    return {
      allowed: true,
      reason: "no_permissions_defined",
      ethical_wall_active: false,
      user_blocked: false,
    };
  }

  const blockedUsers = permissions.blocked_users ?? [];
  const isBlocked = blockedUsers.includes(userId);

  if (isBlocked) {
    return {
      allowed: false,
      reason: "user_blocked_by_ethical_wall",
      ethical_wall_active: blockedUsers.length > 0,
      user_blocked: true,
    };
  }

  return {
    allowed: true,
    reason: "not_blocked",
    ethical_wall_active: blockedUsers.length > 0,
    user_blocked: false,
  };
}

/**
 * Kombiniert RBAC-Check mit Ethical-Wall-Check.
 * Ethical Wall hat Vorrang: wenn blockiert, immer deny — auch wenn RBAC erlaubt.
 */
export function checkPermissionWithEthicalWall(
  canPerformAction: boolean,
  userId: string,
  permissions: PermissionInfo | undefined
): EthicalWallCheckResult & { rbac_allowed: boolean } {
  const wallCheck = checkEthicalWall(userId, permissions);

  if (!wallCheck.allowed) {
    return { ...wallCheck, rbac_allowed: canPerformAction };
  }

  if (!canPerformAction) {
    return {
      allowed: false,
      reason: "rbac_denied",
      ethical_wall_active: wallCheck.ethical_wall_active,
      user_blocked: false,
      rbac_allowed: false,
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    ethical_wall_active: wallCheck.ethical_wall_active,
    user_blocked: false,
    rbac_allowed: true,
  };
}

/**
 * Prüft Ethical Wall für eine Liste von Users (z.B. Team-Zugriff auf Akte).
 */
export function filterUsersByEthicalWall(
  userIds: string[],
  permissions: PermissionInfo | undefined
): { allowed: string[]; blocked: string[] } {
  if (!permissions?.blocked_users) {
    return { allowed: [...userIds], blocked: [] };
  }

  const blockedSet = new Set(permissions.blocked_users);
  const allowed: string[] = [];
  const blocked: string[] = [];

  for (const userId of userIds) {
    if (blockedSet.has(userId)) {
      blocked.push(userId);
    } else {
      allowed.push(userId);
    }
  }

  return { allowed, blocked };
}

// ── AI-Provider-Policy Types ──────────────────────────────────────────

export type ProviderRegion = "eu" | "us" | "global";

export const PROVIDER_REGIONS: Record<ModelProvider, ProviderRegion> = {
  anthropic: "us",
  openai: "us",
  google: "global",
  mistral: "eu",
  meta: "us",
  "zero-entropy": "eu",
  deepseek: "global",
};

export type DataResidencyRequirement = "none" | "eu_only" | "eu_or_adequate";

export interface AiProviderPolicyResult {
  allowed: boolean;
  reason: string;
  provider: ModelProvider;
  region: ProviderRegion;
  required_region: DataResidencyRequirement;
}

/**
 * Bestimmt die Data-Residency-Anforderung basierend auf Privilege-Level.
 * attorney_client → eu_only (streng, § 203 StGB)
 * work_product → eu_or_adequate (EU oder Adequacy Decision)
 * joint_defense → eu_or_adequate
 * none → none (keine Beschränkung)
 */
export function getDataResidencyRequirement(privilege: PrivilegeLevel): DataResidencyRequirement {
  switch (privilege) {
    case "attorney_client":
      return "eu_only";
    case "work_product":
      return "eu_or_adequate";
    case "joint_defense":
      return "eu_or_adequate";
    case "none":
      return "none";
  }
}

/**
 * Prüft, ob ein AI-Provider für ein gegebenes Privilege-Level erlaubt ist.
 */
export function checkAiProviderPolicy(
  provider: ModelProvider,
  privilege: PrivilegeLevel
): AiProviderPolicyResult {
  const region = PROVIDER_REGIONS[provider];
  const required = getDataResidencyRequirement(privilege);

  if (required === "none") {
    return {
      allowed: true,
      reason: "no_residency_requirement",
      provider,
      region,
      required_region: required,
    };
  }

  if (required === "eu_only") {
    if (region === "eu") {
      return {
        allowed: true,
        reason: "provider_in_eu",
        provider,
        region,
        required_region: required,
      };
    }
    return {
      allowed: false,
      reason: "provider_not_in_eu_but_required",
      provider,
      region,
      required_region: required,
    };
  }

  // eu_or_adequate
  if (region === "eu") {
    return { allowed: true, reason: "provider_in_eu", provider, region, required_region: required };
  }
  // US providers with Adequacy Decision (EU-US Data Privacy Framework)
  if (region === "us") {
    return {
      allowed: true,
      reason: "provider_us_with_adequacy",
      provider,
      region,
      required_region: required,
    };
  }
  // global (Google) — depends on configuration
  return {
    allowed: true,
    reason: "provider_global_check_config",
    provider,
    region,
    required_region: required,
  };
}

/**
 * Filtert AI-Modelle basierend auf Privilege-Level.
 */
export function filterModelsByPrivilege(
  models: ModelEntry[],
  privilege: PrivilegeLevel
): { allowed: ModelEntry[]; blocked: Array<{ model: ModelEntry; reason: string }> } {
  const allowed: ModelEntry[] = [];
  const blocked: Array<{ model: ModelEntry; reason: string }> = [];

  for (const model of models) {
    const result = checkAiProviderPolicy(model.provider, privilege);
    if (result.allowed) {
      allowed.push(model);
    } else {
      blocked.push({ model, reason: result.reason });
    }
  }

  return { allowed, blocked };
}

// ── Confidentiality-based Provider Restrictions ───────────────────────

/**
 * Bestimmt zusätzliche Provider-Restriktionen basierend auf Confidentiality.
 * restricted → eu_only (Ethical Wall Daten dürfen nicht in US landen)
 * confidential → eu_or_adequate
 * internal → none
 * public → none
 */
export function getDataResidencyForConfidentiality(
  level: ConfidentialityLevel
): DataResidencyRequirement {
  switch (level) {
    case "restricted":
      return "eu_only";
    case "confidential":
      return "eu_or_adequate";
    case "internal":
      return "none";
    case "public":
      return "none";
  }
}

/**
 * Kombinierte Prüfung: Privilege + Confidentiality → strengere Anforderung gewinnt.
 */
export function getCombinedDataResidency(
  privilege: PrivilegeLevel,
  confidentiality: ConfidentialityLevel
): DataResidencyRequirement {
  const privReq = getDataResidencyRequirement(privilege);
  const confReq = getDataResidencyForConfidentiality(confidentiality);

  const rank: Record<DataResidencyRequirement, number> = { none: 0, eu_or_adequate: 1, eu_only: 2 };
  return rank[privReq] >= rank[confReq] ? privReq : confReq;
}

// ── Audit ─────────────────────────────────────────────────────────────

export interface EthicalWallAuditEntry {
  id: string;
  timestamp: string;
  user_id: string;
  case_slug?: string;
  action: string;
  result: "allowed" | "denied";
  reason: string;
  ethical_wall_active: boolean;
}

export function createEthicalWallAudit(
  userId: string,
  action: string,
  result: EthicalWallCheckResult,
  caseSlug?: string
): EthicalWallAuditEntry {
  return {
    id: `ew-audit-${Date.now()}-${userId}`,
    timestamp: new Date().toISOString(),
    user_id: userId,
    case_slug: caseSlug,
    action,
    result: result.allowed ? "allowed" : "denied",
    reason: result.reason,
    ethical_wall_active: result.ethical_wall_active,
  };
}
