/**
 * Knowledge Asset Modell — P1-KM-001 + P1-KM-002 + P1-KM-003
 * ===========================================================
 * Knowledge Asset Modell für Precedents, Clauses, Playbooks,
 * Checklisten, Memos und After-Action Reviews.
 *
 * P1-KM-001: Datenmodell für Knowledge Assets
 * P1-KM-002: Precedent Governance (Freigabe, Versionierung,
 *            Confidentiality/Privilege Labels, Deprecation)
 * P1-KM-003: Precedent Search + Drafting Integration (nur
 *            freigegebene Knowledge Assets als autoritativ)
 *
 * Kopplung:
 *   - privilege-labels.ts → Confidentiality/Privilege Labels
 *   - legal-skill-pack.ts → Skill-Referenzen
 *   - types.ts → BrainPage
 */

import type { PrivilegeLevel, ConfidentialityLevel } from "@/lib/privilege-labels";

// ── Knowledge Asset Types ─────────────────────────────────────────────

export type KnowledgeAssetType =
  | "precedent"        // Präzedenzfall / Urteilsauszug
  | "clause"           // Klausel-Bibliothek
  | "playbook"         // Vorgehensmodell / Checkliste für Workflow
  | "checklist"        // Prüfliste
  | "memo"             // Memo / Aktennotiz / Rechercheergebnis
  | "after_action_review" // After-Action Review
  | "template"         // Dokumentvorlage
  | "guideline";       // Richtlinie / Handbuch

export type KnowledgeAssetStatus =
  | "draft"            // In Bearbeitung
  | "in_review"        // In Freigabeprüfung
  | "approved"         // Freigegeben (autoritativ)
  | "deprecated"       // Veraltet (nicht mehr autoritativ)
  | "archived";        // Archiviert

export type KnowledgeAssetCategory =
  | "litigation"
  | "contract"
  | "corporate"
  | "tax"
  | "compliance"
  | "real_estate"
  | "insurance"
  | "employment"
  | "ip"
  | "general";

export interface KnowledgeAssetVersion {
  version: string;
  created_at: string;
  created_by: string;
  changelog: string;
  content_hash: string;
}

export interface KnowledgeAsset {
  id: string;
  slug: string;
  type: KnowledgeAssetType;
  category: KnowledgeAssetCategory;
  title: string;
  description: string;
  content: string;
  status: KnowledgeAssetStatus;
  /** Current version (semver) */
  version: string;
  /** Version history */
  versions: KnowledgeAssetVersion[];
  /** Tags for search */
  tags: string[];
  /** Practice areas */
  practice_areas: string[];
  /** Linked case slugs */
  linked_cases: string[];
  /** Linked skills */
  linked_skills: string[];
  /** Privilege level */
  privilege_level: PrivilegeLevel;
  /** Confidentiality level */
  confidentiality_level: ConfidentialityLevel;
  /** Author */
  created_by: string;
  created_at: string;
  /** Last approver */
  approved_by?: string;
  approved_at?: string;
  /** Deprecation info */
  deprecated_by?: string;
  deprecated_at?: string;
  deprecation_reason?: string;
  /** Successor asset (if deprecated/superseded) */
  successor_id?: string;
  /** Tenant isolation */
  brain_id: string;
  org_id: string;
  /** Whether this asset is authoritative (only approved = true) */
  is_authoritative: boolean;
  /** Usage count (how many times referenced in drafting) */
  usage_count: number;
  /** Rating (0-5, average from reviews) */
  rating: number;
}

// ── Precedent Governance (P1-KM-002) ──────────────────────────────────

export interface GovernanceAction {
  action: "submit_for_review" | "approve" | "reject" | "deprecate" | "archive" | "restore";
  asset_id: string;
  actor: string;
  timestamp: string;
  reason?: string;
  previous_status: KnowledgeAssetStatus;
  new_status: KnowledgeAssetStatus;
}

export interface GovernancePolicy {
  /** Who can submit for review */
  can_submit_roles: string[];
  /** Who can approve */
  can_approve_roles: string[];
  /** Who can deprecate */
  can_deprecate_roles: string[];
  /** Require second reviewer for privileged assets */
  require_second_reviewer_for_privileged: boolean;
  /** Auto-deprecate after days without usage */
  auto_deprecate_days: number | null;
  /** Minimum rating to remain approved */
  min_rating_for_approved: number;
}

export const DEFAULT_GOVERNANCE_POLICY: GovernancePolicy = {
  can_submit_roles: ["lawyer", "senior_lawyer", "partner", "admin"],
  can_approve_roles: ["senior_lawyer", "partner", "admin"],
  can_deprecate_roles: ["partner", "admin"],
  require_second_reviewer_for_privileged: true,
  auto_deprecate_days: 365,
  min_rating_for_approved: 3.0,
};

export function canSubmitForReview(role: string, policy: GovernancePolicy = DEFAULT_GOVERNANCE_POLICY): boolean {
  return policy.can_submit_roles.includes(role);
}

export function canApprove(role: string, policy: GovernancePolicy = DEFAULT_GOVERNANCE_POLICY): boolean {
  return policy.can_approve_roles.includes(role);
}

export function canDeprecate(role: string, policy: GovernancePolicy = DEFAULT_GOVERNANCE_POLICY): boolean {
  return policy.can_deprecate_roles.includes(role);
}

export function submitForReview(
  asset: KnowledgeAsset,
  actor: string,
  role: string,
  policy: GovernancePolicy = DEFAULT_GOVERNANCE_POLICY,
): { asset: KnowledgeAsset; action: GovernanceAction } | { error: string } {
  if (!canSubmitForReview(role, policy)) {
    return { error: `Role ${role} cannot submit for review` };
  }
  if (asset.status === "approved") {
    return { error: "Asset is already approved — submit a new version instead" };
  }
  if (asset.status === "archived") {
    return { error: "Cannot submit archived asset for review" };
  }

  const previousStatus = asset.status;
  const updatedAsset: KnowledgeAsset = {
    ...asset,
    status: "in_review",
  };

  return {
    asset: updatedAsset,
    action: {
      action: "submit_for_review",
      asset_id: asset.id,
      actor,
      timestamp: new Date().toISOString(),
      previous_status: previousStatus,
      new_status: "in_review",
    },
  };
}

export function approveAsset(
  asset: KnowledgeAsset,
  actor: string,
  role: string,
  policy: GovernancePolicy = DEFAULT_GOVERNANCE_POLICY,
): { asset: KnowledgeAsset; action: GovernanceAction } | { error: string } {
  if (!canApprove(role, policy)) {
    return { error: `Role ${role} cannot approve assets` };
  }
  if (asset.status !== "in_review" && asset.status !== "draft") {
    return { error: `Cannot approve asset in status ${asset.status}` };
  }

  const previousStatus = asset.status;
  const now = new Date().toISOString();
  const updatedAsset: KnowledgeAsset = {
    ...asset,
    status: "approved",
    approved_by: actor,
    approved_at: now,
    is_authoritative: true,
  };

  return {
    asset: updatedAsset,
    action: {
      action: "approve",
      asset_id: asset.id,
      actor,
      timestamp: now,
      previous_status: previousStatus,
      new_status: "approved",
    },
  };
}

export function rejectAsset(
  asset: KnowledgeAsset,
  actor: string,
  reason: string,
): { asset: KnowledgeAsset; action: GovernanceAction } {
  const previousStatus = asset.status;
  const updatedAsset: KnowledgeAsset = {
    ...asset,
    status: "draft",
  };

  return {
    asset: updatedAsset,
    action: {
      action: "reject",
      asset_id: asset.id,
      actor,
      timestamp: new Date().toISOString(),
      reason,
      previous_status: previousStatus,
      new_status: "draft",
    },
  };
}

export function deprecateAsset(
  asset: KnowledgeAsset,
  actor: string,
  role: string,
  reason: string,
  successorId?: string,
  policy: GovernancePolicy = DEFAULT_GOVERNANCE_POLICY,
): { asset: KnowledgeAsset; action: GovernanceAction } | { error: string } {
  if (!canDeprecate(role, policy)) {
    return { error: `Role ${role} cannot deprecate assets` };
  }

  const previousStatus = asset.status;
  const now = new Date().toISOString();
  const updatedAsset: KnowledgeAsset = {
    ...asset,
    status: "deprecated",
    deprecated_by: actor,
    deprecated_at: now,
    deprecation_reason: reason,
    successor_id: successorId,
    is_authoritative: false,
  };

  return {
    asset: updatedAsset,
    action: {
      action: "deprecate",
      asset_id: asset.id,
      actor,
      timestamp: now,
      reason,
      previous_status: previousStatus,
      new_status: "deprecated",
    },
  };
}

// ── Version Management ────────────────────────────────────────────────

export function createNewVersion(
  asset: KnowledgeAsset,
  newContent: string,
  changelog: string,
  actor: string,
): KnowledgeAsset {
  const versionParts = asset.version.split(".").map(Number);
  const newVersion = `${versionParts[0]}.${versionParts[1]}.${(versionParts[2] ?? 0) + 1}`;

  const versionEntry: KnowledgeAssetVersion = {
    version: asset.version,
    created_at: asset.created_at,
    created_by: asset.created_by,
    changelog: changelog,
    content_hash: simpleHash(asset.content),
  };

  return {
    ...asset,
    version: newVersion,
    content: newContent,
    versions: [...asset.versions, versionEntry],
    created_at: new Date().toISOString(),
    status: "draft",
    is_authoritative: false,
    approved_by: undefined,
    approved_at: undefined,
  };
}

function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `h${Math.abs(hash).toString(16)}`;
}

// ── Precedent Search (P1-KM-003) ──────────────────────────────────────

export interface SearchResult {
  asset: KnowledgeAsset;
  score: number;
  matched_fields: string[];
  highlighted_snippet?: string;
}

export function searchKnowledgeAssets(
  assets: KnowledgeAsset[],
  query: string,
  opts?: {
    types?: KnowledgeAssetType[];
    categories?: KnowledgeAssetCategory[];
    tags?: string[];
    authoritative_only?: boolean;
    min_rating?: number;
    limit?: number;
  },
): SearchResult[] {
  const authoritativeOnly = opts?.authoritative_only ?? true;
  const minRating = opts?.min_rating ?? 0;
  const limit = opts?.limit ?? 20;
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 0);

  let filtered = assets;

  if (authoritativeOnly) {
    filtered = filtered.filter((a) => a.is_authoritative && a.status === "approved");
  }

  if (opts?.types && opts.types.length > 0) {
    filtered = filtered.filter((a) => opts.types!.includes(a.type));
  }

  if (opts?.categories && opts.categories.length > 0) {
    filtered = filtered.filter((a) => opts.categories!.includes(a.category));
  }

  if (opts?.tags && opts.tags.length > 0) {
    filtered = filtered.filter((a) => opts.tags!.some((t) => a.tags.includes(t)));
  }

  if (minRating > 0) {
    filtered = filtered.filter((a) => a.rating >= minRating);
  }

  const results: SearchResult[] = [];

  for (const asset of filtered) {
    const matchedFields: string[] = [];
    let score = 0;

    // Title match (highest weight)
    if (asset.title.toLowerCase().includes(queryLower)) {
      score += 10;
      matchedFields.push("title");
    } else if (queryTerms.some((t) => asset.title.toLowerCase().includes(t))) {
      score += 5;
      matchedFields.push("title");
    }

    // Description match
    if (asset.description.toLowerCase().includes(queryLower)) {
      score += 5;
      matchedFields.push("description");
    } else if (queryTerms.some((t) => asset.description.toLowerCase().includes(t))) {
      score += 2;
      matchedFields.push("description");
    }

    // Content match
    if (asset.content.toLowerCase().includes(queryLower)) {
      score += 3;
      matchedFields.push("content");
    }

    // Tag match
    for (const tag of asset.tags) {
      if (queryTerms.some((t) => tag.toLowerCase().includes(t))) {
        score += 2;
        if (!matchedFields.includes("tags")) matchedFields.push("tags");
      }
    }

    // Practice area match
    for (const area of asset.practice_areas) {
      if (queryTerms.some((t) => area.toLowerCase().includes(t))) {
        score += 2;
        if (!matchedFields.includes("practice_areas")) matchedFields.push("practice_areas");
      }
    }

    // Rating boost
    score += asset.rating * 0.5;

    // Usage count boost (popular assets)
    score += Math.min(asset.usage_count * 0.1, 5);

    if (score > 0) {
      // Generate highlighted snippet from content
      const snippet = generateSnippet(asset.content, queryTerms);

      results.push({
        asset,
        score,
        matched_fields: matchedFields,
        highlighted_snippet: snippet,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function generateSnippet(content: string, terms: string[], maxLen: number = 200): string {
  if (terms.length === 0) return content.slice(0, maxLen);
  const lowerContent = content.toLowerCase();
  const firstMatch = terms
    .map((t) => lowerContent.indexOf(t))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch === undefined) return content.slice(0, maxLen);

  const start = Math.max(0, firstMatch - 50);
  const end = Math.min(content.length, start + maxLen);
  return (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "");
}

// ── Drafting Integration ──────────────────────────────────────────────

export interface DraftingReference {
  asset_id: string;
  asset_slug: string;
  asset_title: string;
  asset_version: string;
  referenced_at: string;
  referenced_by: string;
  context: string;
  is_authoritative: boolean;
}

export function createDraftingReference(
  asset: KnowledgeAsset,
  actor: string,
  context: string,
): DraftingReference {
  return {
    asset_id: asset.id,
    asset_slug: asset.slug,
    asset_title: asset.title,
    asset_version: asset.version,
    referenced_at: new Date().toISOString(),
    referenced_by: actor,
    context,
    is_authoritative: asset.is_authoritative,
  };
}

export function filterAuthoritativeAssets(assets: KnowledgeAsset[]): KnowledgeAsset[] {
  return assets.filter((a) => a.is_authoritative && a.status === "approved");
}

export function filterDeprecatedAssets(assets: KnowledgeAsset[]): KnowledgeAsset[] {
  return assets.filter((a) => a.status === "deprecated");
}

export function getAssetsByType(assets: KnowledgeAsset[], type: KnowledgeAssetType): KnowledgeAsset[] {
  return assets.filter((a) => a.type === type);
}

export function getAssetsByCategory(assets: KnowledgeAsset[], category: KnowledgeAssetCategory): KnowledgeAsset[] {
  return assets.filter((a) => a.category === category);
}

// ── Factory ───────────────────────────────────────────────────────────

export function createKnowledgeAsset(params: {
  type: KnowledgeAssetType;
  category: KnowledgeAssetCategory;
  title: string;
  description: string;
  content: string;
  tags?: string[];
  practice_areas?: string[];
  privilege_level?: PrivilegeLevel;
  confidentiality_level?: ConfidentialityLevel;
  created_by: string;
  brain_id: string;
  org_id: string;
}): KnowledgeAsset {
  const slug = `km/${params.type}/${params.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
  return {
    id: `ka-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    slug,
    type: params.type,
    category: params.category,
    title: params.title,
    description: params.description,
    content: params.content,
    status: "draft",
    version: "1.0.0",
    versions: [],
    tags: params.tags ?? [],
    practice_areas: params.practice_areas ?? [],
    linked_cases: [],
    linked_skills: [],
    privilege_level: params.privilege_level ?? "none",
    confidentiality_level: params.confidentiality_level ?? "internal",
    created_by: params.created_by,
    created_at: new Date().toISOString(),
    is_authoritative: false,
    usage_count: 0,
    rating: 0,
    brain_id: params.brain_id,
    org_id: params.org_id,
  };
}

// ── Validation ────────────────────────────────────────────────────────

export interface AssetValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateKnowledgeAsset(asset: KnowledgeAsset): AssetValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!asset.id) errors.push("ID is required");
  if (!asset.slug) errors.push("Slug is required");
  if (!asset.title) errors.push("Title is required");
  if (!asset.content) errors.push("Content is required");
  if (!asset.brain_id) errors.push("brain_id is required");
  if (!asset.org_id) errors.push("org_id is required");
  if (!asset.created_by) errors.push("created_by is required");

  if (asset.status === "approved" && !asset.approved_by) {
    errors.push("Approved asset must have approved_by");
  }

  if (asset.status === "deprecated" && !asset.deprecation_reason) {
    warnings.push("Deprecated asset should have a deprecation reason");
  }

  if (asset.is_authoritative && asset.status !== "approved") {
    errors.push("Only approved assets can be authoritative");
  }

  if (asset.privilege_level !== "none" && asset.confidentiality_level === "public") {
    warnings.push("Privileged asset should not be public");
  }

  if (asset.rating < 0 || asset.rating > 5) {
    errors.push("Rating must be between 0 and 5");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Labels ────────────────────────────────────────────────────────────

export const ASSET_TYPE_LABELS: Record<KnowledgeAssetType, string> = {
  precedent: "Präzedenzfall",
  clause: "Klausel",
  playbook: "Playbook",
  checklist: "Checkliste",
  memo: "Memo",
  after_action_review: "After-Action Review",
  template: "Vorlage",
  guideline: "Richtlinie",
};

export const ASSET_STATUS_LABELS: Record<KnowledgeAssetStatus, string> = {
  draft: "Entwurf",
  in_review: "In Prüfung",
  approved: "Freigegeben",
  deprecated: "Veraltet",
  archived: "Archiviert",
};

export const ASSET_CATEGORY_LABELS: Record<KnowledgeAssetCategory, string> = {
  litigation: "Litigation",
  contract: "Vertragsrecht",
  corporate: "Gesellschaftsrecht",
  tax: "Steuerrecht",
  compliance: "Compliance",
  real_estate: "Immobilienrecht",
  insurance: "Versicherungsrecht",
  employment: "Arbeitsrecht",
  ip: "IP-Recht",
  general: "Allgemein",
};
