import { describe, expect, it } from "vitest";
import {
  buildCaseMandateAcceptance,
  canAcceptMandate,
  defaultAcceptanceWorkflow,
  inferKycRequired,
  inferPoaRequired,
  inferPoaType,
  updateConflictCheck,
  validateAcceptanceForConversion,
  waiveConflictCheck,
} from "./intake-acceptance";

function clearWorkflow() {
  return {
    ...defaultAcceptanceWorkflow(),
    conflict_check: { ...defaultAcceptanceWorkflow().conflict_check, status: "clear" as const },
    kyc: { ...defaultAcceptanceWorkflow().kyc, status: "verified" as const },
    poa: { ...defaultAcceptanceWorkflow().poa, status: "signed" as const },
    engagement_letter: { status: "sent" as const },
  };
}

describe("defaultAcceptanceWorkflow", () => {
  it("returns pending defaults", () => {
    const w = defaultAcceptanceWorkflow();
    expect(w.conflict_check.status).toBe("pending");
    expect(w.kyc.required).toBe(true);
    expect(w.poa.required).toBe(true);
  });
});

describe("updateConflictCheck", () => {
  it("sets clear status for no match", () => {
    const w = defaultAcceptanceWorkflow();
    const result = updateConflictCheck(
      w,
      {
        name: "Max Muster",
        severity: "none",
        explanation: "",
        matches: [],
        checked_cases: 0,
        disclaimer: "",
      },
      "lawyer@test"
    );
    expect(result.conflict_check.status).toBe("clear");
    expect(result.conflict_check.performed_by).toBe("lawyer@test");
  });

  it("sets conflict status for critical match", () => {
    const w = defaultAcceptanceWorkflow();
    const result = updateConflictCheck(
      w,
      {
        name: "Max Muster",
        severity: "critical",
        explanation: "",
        matches: [
          { slug: "case-1", title: "A", role: "opponent", matched_name: "Max Muster", exact: true },
        ],
        checked_cases: 1,
        disclaimer: "",
      },
      "lawyer@test"
    );
    expect(result.conflict_check.status).toBe("conflict");
    expect(result.conflict_check.severity).toBe("critical");
  });
});

describe("waiveConflictCheck", () => {
  it("requires partner or admin role", () => {
    const w = defaultAcceptanceWorkflow();
    const result = waiveConflictCheck(w, "Begründung", "lawyer@test", {
      is_partner: false,
      is_admin: false,
    });
    expect(result.ok).toBe(false);
  });

  it("requires a reason", () => {
    const w = defaultAcceptanceWorkflow();
    const result = waiveConflictCheck(w, "   ", "partner@test", {
      is_partner: true,
      is_admin: false,
    });
    expect(result.ok).toBe(false);
  });

  it("waives conflict when partner gives reason", () => {
    const w = defaultAcceptanceWorkflow();
    const result = waiveConflictCheck(w, "Begründung", "partner@test", {
      is_partner: true,
      is_admin: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workflow.conflict_check.waived).toBe(true);
      expect(result.workflow.conflict_check.status).toBe("clear");
    }
  });
});

describe("canAcceptMandate", () => {
  it("passes when all steps complete", () => {
    const result = canAcceptMandate(clearWorkflow());
    expect(result.ok).toBe(true);
  });

  it("blocks when conflict check is pending", () => {
    const w = defaultAcceptanceWorkflow();
    w.kyc = { ...w.kyc, status: "verified" };
    w.poa = { ...w.poa, status: "signed" };
    w.engagement_letter = { status: "sent" };
    const result = canAcceptMandate(w);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blocking).toContain("conflict_check_pending");
  });

  it("blocks when kyc is pending", () => {
    const w = clearWorkflow();
    w.kyc = { ...w.kyc, status: "pending" };
    const result = canAcceptMandate(w);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blocking).toContain("kyc_pending");
  });
});

describe("validateAcceptanceForConversion", () => {
  it("passes for clear workflow", () => {
    const result = validateAcceptanceForConversion(clearWorkflow());
    expect(result.ok).toBe(true);
  });

  it("fails for unresolved conflict", () => {
    const w = defaultAcceptanceWorkflow();
    w.kyc = { ...w.kyc, status: "verified" };
    w.poa = { ...w.poa, status: "signed" };
    w.engagement_letter = { status: "sent" };
    const result = validateAcceptanceForConversion(w);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toContain("acceptance_incomplete");
  });
});

describe("buildCaseMandateAcceptance", () => {
  it("includes accepted_at and accepted_by", () => {
    const w = clearWorkflow();
    const at = new Date("2026-07-09T12:00:00.000Z");
    const result = buildCaseMandateAcceptance("intake-1", w, "partner@test", at);
    expect(result.intake_slug).toBe("intake-1");
    expect(result.accepted_at).toBe(at.toISOString());
    expect(result.accepted_by).toBe("partner@test");
  });
});

describe("inference helpers", () => {
  it("requires KYC for real estate and corporate", () => {
    expect(inferKycRequired("Immobilienrecht", "X")).toBe(true);
    expect(inferKycRequired("Gesellschaftsrecht", "X")).toBe(true);
    expect(inferKycRequired("Mietrecht", "X")).toBe(true);
  });

  it("requires POA for litigation", () => {
    expect(inferPoaRequired("Strafrecht")).toBe(true);
    expect(inferPoaRequired("Mietrecht")).toBe(true);
  });

  it("infers litigation POA type", () => {
    expect(inferPoaType("Strafrecht")).toBe("litigation");
    expect(inferPoaType("Gesellschaftsrecht")).toBe("transactional");
    expect(inferPoaType("Mietrecht")).toBe("general");
  });
});
