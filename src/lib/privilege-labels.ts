/**
 * Privilege & Confidentiality Labels — P0-ETHICS-001.
 *
 * Definiert Labels für Matter, Dokumente, AI-Prompts und Exporte:
 *   - Privilege: attorney-client, work-product, joint-defense, none
 *   - Confidentiality: public, internal, confidential, restricted
 *
 * Labels werden propagiert: Matter → Dokumente → AI-Prompts → Exporte.
 * Legal Hold und Ethical Wall berücksichtigen Labels.
 */

import type { PermissionInfo } from "@/lib/legal-types";

// ── Privilege Types ───────────────────────────────────────────────────

export type PrivilegeLevel =
  | "attorney_client"    // Mandantenkommunikation, § 203 StGB
  | "work_product"       // Anwaltliches Arbeitsergebnis
  | "joint_defense"      // Joint Defense / Common Interest
  | "none";              // Kein Privilege

export const PRIVILEGE_LABELS: Record<PrivilegeLevel, { label: string; description: string }> = {
  attorney_client: {
    label: "Mandantenprivileg",
    description: "Vertrauliche Kommunikation zwischen Anwalt und Mandant (§ 203 StGB, § 43a BRAO)",
  },
  work_product: {
    label: "Arbeitsergebnis",
    description: "Anwaltliches Arbeitsergebnis, nicht mit Mandant geteilt",
  },
  joint_defense: {
    label: "Joint Defense",
    description: "Gemeinsame Verteidigung mit anderen Parteien unter Common Interest Agreement",
  },
  none: {
    label: "Kein Privileg",
    description: "Kein rechtliches Privileg applicable",
  },
};

// ── Confidentiality Types ─────────────────────────────────────────────

export type ConfidentialityLevel =
  | "public"       // Öffentlich zugänglich
  | "internal"     // Internes Team
  | "confidential" // Nur berechtigte Personen
  | "restricted";  // Streng vertraulich (Ethical Wall)

export const CONFIDENTIALITY_LABELS: Record<ConfidentialityLevel, { label: string; description: string }> = {
  public: {
    label: "Öffentlich",
    description: "Für die Öffentlichkeit bestimmt",
  },
  internal: {
    label: "Intern",
    description: "Für das interne Team bestimmt",
  },
  confidential: {
    label: "Vertraulich",
    description: "Nur für berechtigte Personen (allowed_users)",
  },
  restricted: {
    label: "Streng vertraulich",
    description: "Ethical Wall aktiv — nur explizit erlaubte Personen",
  },
};

// ── Label Interfaces ──────────────────────────────────────────────────

export interface PrivilegeLabel {
  privilege: PrivilegeLevel;
  confidentiality: ConfidentialityLevel;
  labeled_at: string;
  labeled_by: string;
  reason?: string;
}

export interface MatterPrivilegeLabel extends PrivilegeLabel {
  case_slug: string;
}

export interface DocumentPrivilegeLabel extends PrivilegeLabel {
  document_slug: string;
  case_slug: string;
}

export interface AiPromptPrivilegeLabel extends PrivilegeLabel {
  prompt_id: string;
  case_slug?: string;
  includes_matter_data: boolean;
}

export interface ExportPrivilegeLabel extends PrivilegeLabel {
  export_id: string;
  case_slugs: string[];
  format: "pdf" | "csv" | "json" | "zip" | "datev";
  recipient?: string;
}

// ── Propagation Rules ─────────────────────────────────────────────────

/**
 * Propagiert Privilege von Matter auf Dokument.
 * Dokumente erben standardmäßig das Privilege des Matters,
 * können aber höher eingestuft werden (nie niedriger).
 */
export function propagateMatterToDocument(
  matterLabel: MatterPrivilegeLabel,
  documentOverride?: Partial<PrivilegeLabel>,
): DocumentPrivilegeLabel {
  const privilege = documentOverride?.privilege
    ? maxPrivilege(documentOverride.privilege, matterLabel.privilege)
    : matterLabel.privilege;

  const confidentiality = documentOverride?.confidentiality
    ? maxConfidentiality(documentOverride.confidentiality, matterLabel.confidentiality)
    : matterLabel.confidentiality;

  return {
    document_slug: "",
    case_slug: matterLabel.case_slug,
    privilege,
    confidentiality,
    labeled_at: documentOverride?.labeled_at ?? matterLabel.labeled_at,
    labeled_by: documentOverride?.labeled_by ?? matterLabel.labeled_by,
    reason: documentOverride?.reason ?? `Inherited from matter ${matterLabel.case_slug}`,
  };
}

/**
 * Propagiert Privilege von Matter/Dokumenten auf AI-Prompt.
 * AI-Prompts erben das höchste Privilege aller involvierten Matters/Dokumente.
 */
export function propagateToAiPrompt(
  matterLabels: MatterPrivilegeLabel[],
  includesMatterData: boolean,
  promptId: string,
  actor: string,
): AiPromptPrivilegeLabel {
  if (matterLabels.length === 0) {
    return {
      prompt_id: promptId,
      includes_matter_data: includesMatterData,
      privilege: "none",
      confidentiality: "internal",
      labeled_at: new Date().toISOString(),
      labeled_by: actor,
    };
  }

  const privilege = matterLabels.reduce(
    (max, l) => maxPrivilege(max, l.privilege),
    "none" as PrivilegeLevel,
  );
  const confidentiality = matterLabels.reduce(
    (max, l) => maxConfidentiality(max, l.confidentiality),
    "internal" as ConfidentialityLevel,
  );

  return {
    prompt_id: promptId,
    case_slug: matterLabels[0]?.case_slug,
    includes_matter_data: includesMatterData,
    privilege,
    confidentiality,
    labeled_at: new Date().toISOString(),
    labeled_by: actor,
    reason: `Inherited from ${matterLabels.length} matter(s)`,
  };
}

/**
 * Propagiert Privilege auf Export.
 * Exporte erben das höchste Privilege aller involvierten Matters.
 */
export function propagateToExport(
  matterLabels: MatterPrivilegeLabel[],
  exportId: string,
  format: ExportPrivilegeLabel["format"],
  recipient?: string,
): ExportPrivilegeLabel {
  if (matterLabels.length === 0) {
    return {
      export_id: exportId,
      case_slugs: [],
      format,
      recipient,
      privilege: "none",
      confidentiality: "internal",
      labeled_at: new Date().toISOString(),
      labeled_by: "system",
    };
  }

  const privilege = matterLabels.reduce(
    (max, l) => maxPrivilege(max, l.privilege),
    "none" as PrivilegeLevel,
  );
  const confidentiality = matterLabels.reduce(
    (max, l) => maxConfidentiality(max, l.confidentiality),
    "internal" as ConfidentialityLevel,
  );

  return {
    export_id: exportId,
    case_slugs: matterLabels.map((l) => l.case_slug),
    format,
    recipient,
    privilege,
    confidentiality,
    labeled_at: new Date().toISOString(),
    labeled_by: "system",
    reason: `Inherited from ${matterLabels.length} matter(s)`,
  };
}

// ── Comparison Helpers ────────────────────────────────────────────────

const PRIVILEGE_RANK: Record<PrivilegeLevel, number> = {
  none: 0,
  joint_defense: 1,
  work_product: 2,
  attorney_client: 3,
};

const CONFIDENTIALITY_RANK: Record<ConfidentialityLevel, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export function maxPrivilege(a: PrivilegeLevel, b: PrivilegeLevel): PrivilegeLevel {
  return PRIVILEGE_RANK[a] >= PRIVILEGE_RANK[b] ? a : b;
}

export function maxConfidentiality(a: ConfidentialityLevel, b: ConfidentialityLevel): ConfidentialityLevel {
  return CONFIDENTIALITY_RANK[a] >= CONFIDENTIALITY_RANK[b] ? a : b;
}

export function privilegeRank(level: PrivilegeLevel): number {
  return PRIVILEGE_RANK[level];
}

export function confidentialityRank(level: ConfidentialityLevel): number {
  return CONFIDENTIALITY_RANK[level];
}

// ── Permission Info → Labels ──────────────────────────────────────────

export function inferConfidentialityFromPermissions(permissions: PermissionInfo | undefined): ConfidentialityLevel {
  if (!permissions) return "internal";
  if (permissions.blocked_users && permissions.blocked_users.length > 0) return "restricted";
  if (permissions.visibility === "confidential") return "confidential";
  if (permissions.visibility === "restricted") return "confidential";
  if (permissions.visibility === "full") return "internal";
  return "internal";
}

export function inferPrivilegeFromPermissions(permissions: PermissionInfo | undefined): PrivilegeLevel {
  if (!permissions) return "none";
  return permissions.privileged ? "attorney_client" : "none";
}

// ── Export Redaction ──────────────────────────────────────────────────

export interface RedactionResult {
  redacted: boolean;
  reason: string;
  fields_redacted: string[];
}

export function shouldRedactForExport(
  label: ExportPrivilegeLabel,
  recipientRole: "client" | "opponent" | "court" | "internal" | "external",
): RedactionResult {
  const fieldsRedacted: string[] = [];

  if (label.privilege === "attorney_client" && recipientRole === "opponent") {
    fieldsRedacted.push("internal_notes", "legal_assessment", "strategy");
    return {
      redacted: true,
      reason: "attorney_client privilege — opponent access denied",
      fields_redacted: fieldsRedacted,
    };
  }

  if (label.privilege === "work_product" && (recipientRole === "opponent" || recipientRole === "court")) {
    fieldsRedacted.push("work_product_notes");
    return {
      redacted: true,
      reason: "work_product privilege — internal only",
      fields_redacted: fieldsRedacted,
    };
  }

  if (label.confidentiality === "restricted" && recipientRole === "external") {
    fieldsRedacted.push("all_matter_data");
    return {
      redacted: true,
      reason: "restricted confidentiality — external access denied",
      fields_redacted: fieldsRedacted,
    };
  }

  if (label.confidentiality === "confidential" && (recipientRole === "opponent" || recipientRole === "external")) {
    fieldsRedacted.push("confidential_sections");
    return {
      redacted: true,
      reason: "confidential — not for external/opponent",
      fields_redacted: fieldsRedacted,
    };
  }

  return { redacted: false, reason: "no_redaction_needed", fields_redacted: [] };
}

// ── Validation ────────────────────────────────────────────────────────

export function validatePrivilegeLabel(label: PrivilegeLabel): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!label.labeled_at) errors.push("labeled_at is required");
  if (!label.labeled_by) errors.push("labeled_by is required");
  if (!PRIVILEGE_LABELS[label.privilege]) errors.push(`invalid privilege: ${label.privilege}`);
  if (!CONFIDENTIALITY_LABELS[label.confidentiality]) errors.push(`invalid confidentiality: ${label.confidentiality}`);

  return { valid: errors.length === 0, errors };
}

export function canShareWith(
  label: PrivilegeLabel,
  recipientRole: "client" | "opponent" | "court" | "internal" | "external",
): { allowed: boolean; reason: string } {
  if (label.privilege === "attorney_client" && recipientRole !== "client" && recipientRole !== "internal") {
    return { allowed: false, reason: "attorney_client privilege — only client and internal" };
  }

  if (label.privilege === "work_product" && recipientRole !== "internal") {
    return { allowed: false, reason: "work_product — internal only" };
  }

  if (label.confidentiality === "restricted" && recipientRole !== "internal") {
    return { allowed: false, reason: "restricted — internal only (ethical wall)" };
  }

  if (label.confidentiality === "confidential" && (recipientRole === "opponent" || recipientRole === "external")) {
    return { allowed: false, reason: "confidential — not for opponent/external" };
  }

  return { allowed: true, reason: "allowed" };
}
