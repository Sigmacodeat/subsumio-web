import { describe, it, expect } from "vitest";
import {
  createKYCProfile,
  calculateRiskScore,
  scoreToRiskLevel,
  requiresEDD,
  validateKYCProfile,
  RISK_FACTOR_WEIGHTS,
  HIGH_RISK_COUNTRIES,
  RISK_LEVEL_LABELS,
  KYC_STATUS_LABELS,
  type KYCCustomerProfile,
  type RiskFactor,
} from "@/lib/aml-kyc";

function createTestProfile(overrides: Partial<KYCCustomerProfile> = {}): KYCCustomerProfile {
  return createKYCProfile({
    case_slug: "legal/cases/123",
    brain_id: "brain-1",
    org_id: "org-1",
    customer_type: "individual",
    contact: {
      email: "test@test.com",
      address_line_1: "Teststr. 1",
      city: "Wien",
      postal_code: "1010",
      country: "AT",
    },
    first_name: "Max",
    last_name: "Mustermann",
    created_by: "lawyer@test",
  });
}

describe("AML/KYC — Factory", () => {
  it("creates profile with correct defaults", () => {
    const profile = createTestProfile();
    expect(profile.id).toBeTruthy();
    expect(profile.status).toBe("pending");
    expect(profile.risk_level).toBe("low");
    expect(profile.risk_score).toBe(0);
    expect(profile.pep_screening).toBe("clear");
    expect(profile.sanctions_screening).toBe("clear");
    expect(profile.edd_required).toBe(false);
  });
});

describe("AML/KYC — Risk Scoring", () => {
  it("calculates risk score from factors", () => {
    const factors: RiskFactor[] = [
      { category: "high_risk_country", description: "Customer from high-risk country", weight: 30, score: 100 },
      { category: "new_customer", description: "New customer", weight: 5, score: 100 },
    ];
    const score = calculateRiskScore(factors);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("scoreToRiskLevel maps correctly", () => {
    expect(scoreToRiskLevel(0)).toBe("low");
    expect(scoreToRiskLevel(25)).toBe("medium");
    expect(scoreToRiskLevel(50)).toBe("high");
    expect(scoreToRiskLevel(80)).toBe("prohibited");
  });

  it("requiresEDD for high risk", () => {
    expect(requiresEDD("high", "clear")).toBe(true);
    expect(requiresEDD("low", "clear")).toBe(false);
  });

  it("requiresEDD for PEP match", () => {
    expect(requiresEDD("low", "match")).toBe(true);
  });

  it("has risk factor weights", () => {
    expect(RISK_FACTOR_WEIGHTS["sanctions_match"]).toBe(100);
    expect(RISK_FACTOR_WEIGHTS["high_risk_country"]).toBe(30);
  });

  it("has high-risk countries list", () => {
    expect(HIGH_RISK_COUNTRIES.length).toBeGreaterThan(0);
    expect(HIGH_RISK_COUNTRIES.includes("AF")).toBe(true);
  });
});

describe("AML/KYC — Validation", () => {
  it("validates a correct profile", () => {
    const profile = createTestProfile();
    profile.date_of_birth = "1990-01-01";
    profile.identity_documents = [{
      type: "passport",
      number: "P12345",
      issuing_country: "AT",
      issued_at: "2020-01-01",
      verified: true,
    }];
    const result = validateKYCProfile(profile);
    expect(result.valid).toBe(true);
  });

  it("detects missing identity documents", () => {
    const profile = createTestProfile();
    profile.date_of_birth = "1990-01-01";
    const result = validateKYCProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("identity document"))).toBe(true);
  });

  it("detects approved with sanctions match", () => {
    const profile = createTestProfile();
    profile.sanctions_screening = "match";
    profile.status = "approved";
    const result = validateKYCProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("sanctions"))).toBe(true);
  });

  it("detects prohibited without rejection", () => {
    const profile = createTestProfile();
    profile.risk_level = "prohibited";
    profile.status = "pending";
    const result = validateKYCProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("prohibited"))).toBe(true);
  });

  it("detects EDD required but not completed", () => {
    const profile = createTestProfile();
    profile.edd_required = true;
    profile.edd_completed = false;
    profile.status = "approved";
    const result = validateKYCProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("EDD"))).toBe(true);
  });

  it("warns about high-risk without source of funds", () => {
    const profile = createTestProfile();
    profile.risk_level = "high";
    profile.source_of_funds_verified = false;
    const result = validateKYCProfile(profile);
    expect(result.warnings.some((w) => w.includes("source of funds"))).toBe(true);
  });
});

describe("AML/KYC — Labels", () => {
  it("has risk level labels", () => {
    expect(RISK_LEVEL_LABELS["low"]).toBe("Niedrig");
    expect(RISK_LEVEL_LABELS["prohibited"]).toBe("Verboten");
  });

  it("has status labels", () => {
    expect(KYC_STATUS_LABELS["pending"]).toBe("Ausstehend");
    expect(KYC_STATUS_LABELS["approved"]).toBe("Freigegeben");
  });
});
