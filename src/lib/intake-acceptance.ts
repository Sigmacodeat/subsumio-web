import type { ConflictCheckResponse } from "@/lib/types";

export type ConflictCheckStatus = "pending" | "clear" | "conflict" | "needs_review";

export type KycAcceptanceStatus = "pending" | "verified" | "failed" | "not_required";

export type PoaAcceptanceStatus = "pending" | "draft" | "sent" | "signed" | "not_required";

export type EngagementLetterStatus = "pending" | "draft" | "sent";

export interface IntakeConflictCheck {
  status: ConflictCheckStatus;
  performed_at?: string;
  performed_by?: string;
  severity?: ConflictCheckResponse["severity"] | "unknown";
  matches?: string[];
  waived?: boolean;
  waived_by?: string;
  waived_reason?: string;
  waived_at?: string;
}

export interface IntakeKyc {
  required: boolean;
  status: KycAcceptanceStatus;
  verification_slug?: string;
  verified_at?: string;
  risk_level?: "low" | "medium" | "high";
}

export interface IntakePoa {
  required: boolean;
  status: PoaAcceptanceStatus;
  poa_slug?: string;
  type?: "general" | "litigation" | "transactional" | "limited" | "post";
}

export interface IntakeEngagementLetter {
  status: EngagementLetterStatus;
  document_slug?: string;
  generated_at?: string;
  sent_at?: string;
}

export interface IntakeAcceptanceWorkflow {
  conflict_check: IntakeConflictCheck;
  kyc: IntakeKyc;
  poa: IntakePoa;
  engagement_letter: IntakeEngagementLetter;
  accepted_at?: string;
  accepted_by?: string;
}

export interface CaseMandateAcceptance {
  intake_slug: string;
  accepted_at: string;
  accepted_by: string;
  conflict_check: IntakeConflictCheck;
  kyc: IntakeKyc;
  poa: IntakePoa;
  engagement_letter: IntakeEngagementLetter;
}

export interface UserRoles {
  is_partner: boolean;
  is_admin: boolean;
}

export function defaultAcceptanceWorkflow(): IntakeAcceptanceWorkflow {
  return {
    conflict_check: {
      status: "pending",
      severity: "unknown",
      matches: [],
    },
    kyc: {
      required: true,
      status: "pending",
    },
    poa: {
      required: true,
      status: "pending",
    },
    engagement_letter: {
      status: "pending",
    },
  };
}

export function updateConflictCheck(
  workflow: IntakeAcceptanceWorkflow,
  result: ConflictCheckResponse,
  performedBy: string
): IntakeAcceptanceWorkflow {
  return {
    ...workflow,
    conflict_check: {
      ...workflow.conflict_check,
      status: result.severity === "critical" ? "conflict" : "clear",
      performed_at: new Date().toISOString(),
      performed_by: performedBy,
      severity: result.severity,
      matches: result.matches.map((m) => m.slug),
      waived: false,
    },
  };
}

export function waiveConflictCheck(
  workflow: IntakeAcceptanceWorkflow,
  reason: string,
  waivedBy: string,
  roles: UserRoles
): { ok: true; workflow: IntakeAcceptanceWorkflow } | { ok: false; error: string } {
  if (!roles.is_partner && !roles.is_admin) {
    return { ok: false, error: "conflict_waiver_requires_partner_or_admin" };
  }
  if (!reason.trim()) {
    return { ok: false, error: "conflict_waiver_reason_required" };
  }
  return {
    ok: true,
    workflow: {
      ...workflow,
      conflict_check: {
        ...workflow.conflict_check,
        status: "clear",
        waived: true,
        waived_by: waivedBy,
        waived_reason: reason.trim(),
        waived_at: new Date().toISOString(),
      },
    },
  };
}

export function canAcceptMandate(
  workflow: IntakeAcceptanceWorkflow,
  _roles?: UserRoles
): { ok: true } | { ok: false; blocking: string[] } {
  const blocking: string[] = [];

  const conflictOk =
    workflow.conflict_check.status === "clear" ||
    (workflow.conflict_check.status === "conflict" &&
      workflow.conflict_check.waived &&
      Boolean(workflow.conflict_check.waived_by));

  if (!conflictOk) {
    blocking.push("conflict_check_pending");
  }

  if (
    workflow.kyc.required &&
    workflow.kyc.status !== "verified" &&
    workflow.kyc.status !== "not_required"
  ) {
    blocking.push("kyc_pending");
  }

  if (
    workflow.poa.required &&
    workflow.poa.status !== "signed" &&
    workflow.poa.status !== "not_required"
  ) {
    blocking.push("poa_pending");
  }

  if (
    workflow.engagement_letter.status !== "sent" &&
    workflow.engagement_letter.status !== "draft"
  ) {
    blocking.push("engagement_letter_pending");
  }

  return blocking.length === 0 ? { ok: true } : { ok: false, blocking };
}

export function validateAcceptanceForConversion(
  workflow: IntakeAcceptanceWorkflow,
  roles?: UserRoles
): { ok: true } | { ok: false; error: string; code: string } {
  const result = canAcceptMandate(workflow, roles);
  if (!result.ok) {
    return {
      ok: false,
      error: `Mandatsannahme unvollständig: ${result.blocking.join(", ")}`,
      code: `acceptance_incomplete:${result.blocking.join(",")}`,
    };
  }

  if (workflow.conflict_check.status === "conflict" && !workflow.conflict_check.waived) {
    return {
      ok: false,
      error: "Interessenkonflikt ungeklärt; Mandatsannahme abgelehnt.",
      code: "conflict_critical",
    };
  }

  if (workflow.conflict_check.waived && !workflow.conflict_check.waived_reason) {
    return {
      ok: false,
      error: "Waiver-Begründung fehlt.",
      code: "conflict_waiver_reason_missing",
    };
  }

  return { ok: true };
}

export function buildCaseMandateAcceptance(
  intakeSlug: string,
  workflow: IntakeAcceptanceWorkflow,
  acceptedBy: string,
  at: Date = new Date()
): CaseMandateAcceptance {
  return {
    intake_slug: intakeSlug,
    accepted_at: at.toISOString(),
    accepted_by: acceptedBy,
    conflict_check: workflow.conflict_check,
    kyc: workflow.kyc,
    poa: workflow.poa,
    engagement_letter: workflow.engagement_letter,
  };
}

export function inferKycRequired(legalArea?: string, _clientName?: string): boolean {
  if (!legalArea) return true;
  const lower = legalArea.toLowerCase();
  // Real estate, company law, corporate transactions and M&A always need KYC/AML checks
  if (
    lower.includes("immobilien") ||
    lower.includes("grundstück") ||
    lower.includes("gesellschaft") ||
    lower.includes("m&a") ||
    lower.includes("unternehmens") ||
    lower.includes("transaktion")
  ) {
    return true;
  }
  return true;
}

export function inferPoaRequired(legalArea?: string): boolean {
  if (!legalArea) return true;
  const lower = legalArea.toLowerCase();
  if (
    lower.includes("straf") ||
    lower.includes("zivilprozess") ||
    lower.includes("miet") ||
    lower.includes("arbeits")
  ) {
    return true;
  }
  return true;
}

export function inferPoaType(legalArea?: string): IntakePoa["type"] {
  if (!legalArea) return "general";
  const lower = legalArea.toLowerCase();
  if (lower.includes("straf") || lower.includes("prozess")) return "litigation";
  if (lower.includes("gesellschaft") || lower.includes("m&a")) return "transactional";
  if (lower.includes("post")) return "post";
  return "general";
}
