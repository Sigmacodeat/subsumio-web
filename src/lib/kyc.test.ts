import { describe, test, expect } from "vitest";
import {
  createKYCVerification,
  assessRiskLevel,
  getExpiringKYC,
  missingForVerification,
  retentionEnd,
  type KYCVerification,
} from "./kyc";

describe("kyc", () => {
  describe("assessRiskLevel", () => {
    test("returns low risk for no factors", () => {
      const result = assessRiskLevel({
        is_pep: false,
        is_high_risk_country: false,
        cash_intensive: false,
        complex_ownership: false,
        trust_or_company_structure: false,
      });
      expect(result.level).toBe("low");
      expect(result.factors).toHaveLength(0);
    });

    test("returns medium risk for one factor", () => {
      const result = assessRiskLevel({
        is_pep: false,
        is_high_risk_country: true,
        cash_intensive: false,
        complex_ownership: false,
        trust_or_company_structure: false,
      });
      expect(result.level).toBe("medium");
      expect(result.factors).toContain("Hochrisikoland");
    });

    test("a politically exposed person is always high risk (§ 8f RAO)", () => {
      const result = assessRiskLevel({
        is_pep: true,
        is_high_risk_country: false,
        cash_intensive: false,
        complex_ownership: false,
        trust_or_company_structure: false,
      });
      expect(result.level).toBe("high");
      expect(result.factors).toContain("PEP (politisch exponierte Person)");
    });

    test("returns high risk for three or more factors", () => {
      const result = assessRiskLevel({
        is_pep: true,
        is_high_risk_country: true,
        cash_intensive: true,
        complex_ownership: false,
        trust_or_company_structure: false,
      });
      expect(result.level).toBe("high");
      expect(result.factors).toHaveLength(3);
    });
  });

  describe("createKYCVerification", () => {
    test("creates verification with correct defaults", () => {
      const v = createKYCVerification({
        case_slug: "case-123",
        client_name: "Test GmbH",
      });
      expect(v.id).toMatch(/^kyc-/);
      expect(v.case_slug).toBe("case-123");
      expect(v.status).toBe("pending");
      expect(v.provider).toBe("manual");
      expect(v.risk_level).toBe("low");
      expect(v.transparenzregister_checked).toBe(false);
    });

    test("accepts custom provider and risk level", () => {
      const v = createKYCVerification({
        case_slug: "c1",
        client_name: "Test",
        provider: "idnow",
        risk_level: "high",
        risk_factors: ["PEP"],
      });
      expect(v.provider).toBe("idnow");
      expect(v.risk_level).toBe("high");
      expect(v.risk_factors).toContain("PEP");
    });
  });

  describe("getExpiringKYC", () => {
    test("returns verifications expiring within given days", () => {
      const soon = new Date(Date.now() + 10 * 86400000).toISOString();
      const far = new Date(Date.now() + 100 * 86400000).toISOString();
      const verifications = [
        {
          ...createKYCVerification({ case_slug: "c1", client_name: "A" }),
          status: "verified" as const,
          expires_at: soon,
        },
        {
          ...createKYCVerification({ case_slug: "c2", client_name: "B" }),
          status: "verified" as const,
          expires_at: far,
        },
      ];
      const expiring = getExpiringKYC(verifications, 30);
      expect(expiring).toHaveLength(1);
      expect(expiring[0]!.client_name).toBe("A");
    });

    test("does not return already expired or non-verified", () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      const verifications = [
        {
          ...createKYCVerification({ case_slug: "c1", client_name: "A" }),
          status: "verified" as const,
          expires_at: past,
        },
        {
          ...createKYCVerification({ case_slug: "c2", client_name: "B" }),
          status: "pending" as const,
          expires_at: past,
        },
      ];
      const expiring = getExpiringKYC(verifications, 30);
      expect(expiring).toHaveLength(0);
    });
  });
});

describe("Vollständigkeit der Identifizierung (§§ 8b, 8d, 8f RAO)", () => {
  const today = new Date("2026-09-17");
  const complete = (over: Partial<KYCVerification> = {}): KYCVerification => ({
    ...createKYCVerification({ case_slug: "intake/1", client_name: "Mag. Anna Berger" }),
    purpose: "Vertretung im Kündigungsanfechtungsverfahren",
    identification: {
      method: "persoenlich",
      document_type: "reisepass",
      document_number: "P1234567",
      issuing_authority: "BH Mödling",
      document_valid_until: "2030-01-31",
      copy_retained: true,
    },
    pep_check: true,
    pep_match: false,
    sanctions_checked: true,
    sanctions_source: "EU-Finanzsanktionsliste, abgerufen 17.09.2026",
    ...over,
  });

  test("a natural person with document, purpose, PEP and sanctions check is complete", () => {
    expect(missingForVerification(complete(), today)).toEqual([]);
  });

  test("names every gap of an empty check", () => {
    const missing = missingForVerification(
      createKYCVerification({ case_slug: "c", client_name: "X" }),
      today
    );
    expect(missing.join(" | ")).toMatch(
      /Zweck.*Lichtbildausweis.*Gültigkeit.*Kopie.*politisch exponierte.*Sanktionsliste/
    );
  });

  test("an expired document, a remote identification without measures and a PEP without notes are gaps", () => {
    expect(
      missingForVerification(
        complete({
          identification: { ...complete().identification, document_valid_until: "2026-09-16" },
        }),
        today
      )
    ).toContain("Der Ausweis ist abgelaufen");
    expect(
      missingForVerification(
        complete({ identification: { ...complete().identification, remote: true } }),
        today
      )[0]
    ).toMatch(/Ferngeschäft/);
    expect(missingForVerification(complete({ pep_match: true }), today)[0]).toMatch(
      /Herkunft der Mittel/
    );
  });

  test("a legal person needs the WiEReG extract and verified beneficial owners", () => {
    const legal = complete({ party_type: "legal" });
    expect(missingForVerification(legal, today)).toHaveLength(2);
    expect(
      missingForVerification(
        {
          ...legal,
          wiereg_extract_obtained: true,
          beneficial_owners: [{ name: "Dr. Karl Muster", verified: true }],
        },
        today
      )
    ).toEqual([]);
    expect(
      missingForVerification(
        {
          ...legal,
          wiereg_extract_obtained: true,
          beneficial_owners: [{ name: "Dr. Karl Muster", verified: false }],
        },
        today
      )
    ).toHaveLength(1);
  });

  test("a sanctions hit can never be completed", () => {
    expect(missingForVerification(complete({ sanctions_hit: true }), today)).toHaveLength(1);
  });

  test("records are kept five years after the engagement ends (§ 12 Abs. 3 RAO)", () => {
    expect(retentionEnd("2026-09-17T10:00:00Z")).toBe("2031-09-17");
  });
});
