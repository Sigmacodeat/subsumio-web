import { describe, test, expect } from "vitest";
import {
  computePKHMeansTest,
  checkBeratungshilfe,
  createPKHForm,
  PKH_FREIBETRAEGE_2026,
} from "./pkh-beratungshilfe";

describe("pkh-beratungshilfe", () => {
  describe("computePKHMeansTest", () => {
    test("returns eligible for low income", () => {
      const result = computePKHMeansTest({
        monthly_income: 700,
        monthly_deductions: 0,
        family_size: 1,
        adults: 1,
        children: 0,
      });
      expect(result.eligible).toBe(true);
      expect(result.disposable_income).toBeLessThanOrEqual(200);
    });

    test("returns not eligible for high income", () => {
      const result = computePKHMeansTest({
        monthly_income: 5000,
        monthly_deductions: 500,
        family_size: 1,
        adults: 1,
        children: 0,
      });
      expect(result.eligible).toBe(false);
      expect(result.disposable_income).toBeGreaterThan(200);
    });

    test("calculates freibetrag for family with children", () => {
      const result = computePKHMeansTest({
        monthly_income: 2000,
        monthly_deductions: 0,
        family_size: 4,
        adults: 2,
        children: 2,
      });
      expect(result.total_freibetrag).toBe(
        PKH_FREIBETRAEGE_2026.per_person +
          PKH_FREIBETRAEGE_2026.additional_adult +
          2 * PKH_FREIBETRAEGE_2026.per_child
      );
    });

    test("monthly contribution is capped at disposable income", () => {
      const result = computePKHMeansTest({
        monthly_income: 1500,
        monthly_deductions: 0,
        family_size: 1,
        adults: 1,
        children: 0,
      });
      expect(result.monthly_contribution).toBeGreaterThan(0);
      expect(result.monthly_contribution).toBeLessThanOrEqual(result.disposable_income);
    });
  });

  describe("checkBeratungshilfe", () => {
    test("returns eligible for low income", () => {
      const result = checkBeratungshilfe({ net_income: 500, family_size: 1 });
      expect(result.eligible).toBe(true);
    });

    test("returns not eligible for high income", () => {
      const result = checkBeratungshilfe({ net_income: 2000, family_size: 1 });
      expect(result.eligible).toBe(false);
    });
  });

  describe("createPKHForm", () => {
    test("creates form with means test", () => {
      const form = createPKHForm({
        applicant_name: "Max Mustermann",
        applicant_address: "Berlin",
        case_matter: "Scheidung",
        court: "AG Berlin",
        monthly_income: 1000,
        employment_type: "employed",
        family_size: 1,
        adults: 1,
        children: 0,
        assets: 0,
        existing_obligations: 0,
      });
      expect(form.applicant_name).toBe("Max Mustermann");
      expect(form.means_test).toBeTruthy();
      expect(form.created_at).toBeTruthy();
    });
  });
});
