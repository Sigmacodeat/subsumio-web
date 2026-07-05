/**
 * PKH & Beratungshilfe (§§ 114-127 ZPO, §§ 1-11 BeratungshilfeG)
 * =================================================================
 * Form data models for PKH declaration (amtlicher Vordruck),
 * means test calculator (Freibeträge versioned like Düsseldorfer Tabelle),
 * cost determination request generator on rvg.ts.
 */

export interface PKHMeansTest {
  monthly_income: number;
  monthly_deductions: number;
  net_income: number;
  family_size: number;
  freibetrag_per_person: number;
  total_freibetrag: number;
  disposable_income: number;
  eligible: boolean;
  monthly_contribution: number;
}

export const PKH_FREIBETRAEGE_2026 = {
  per_person: 565,
  additional_adult: 415,
  per_child: 390,
};

export function computePKHMeansTest(input: {
  monthly_income: number;
  monthly_deductions: number;
  family_size: number;
  adults: number;
  children: number;
}): PKHMeansTest {
  const net_income = input.monthly_income - input.monthly_deductions;

  const total_freibetrag =
    PKH_FREIBETRAEGE_2026.per_person +
    (input.adults > 1 ? (input.adults - 1) * PKH_FREIBETRAEGE_2026.additional_adult : 0) +
    input.children * PKH_FREIBETRAEGE_2026.per_child;

  const disposable_income = Math.max(0, net_income - total_freibetrag);

  const eligible = disposable_income <= 0 || disposable_income < 200;

  const monthly_contribution =
    disposable_income > 0
      ? Math.min(disposable_income, Math.round(disposable_income / 50) * 50)
      : 0;

  return {
    monthly_income: input.monthly_income,
    monthly_deductions: input.monthly_deductions,
    net_income,
    family_size: input.family_size,
    freibetrag_per_person: PKH_FREIBETRAEGE_2026.per_person,
    total_freibetrag,
    disposable_income,
    eligible,
    monthly_contribution,
  };
}

export interface BeratungshilfeBerechtigung {
  net_income: number;
  family_size: number;
  freibetrag: number;
  eligible: boolean;
}

export function checkBeratungshilfe(input: {
  net_income: number;
  family_size: number;
}): BeratungshilfeBerechtigung {
  const freibetrag =
    PKH_FREIBETRAEGE_2026.per_person +
    (input.family_size - 1) * PKH_FREIBETRAEGE_2026.additional_adult;

  return {
    net_income: input.net_income,
    family_size: input.family_size,
    freibetrag,
    eligible: input.net_income <= freibetrag,
  };
}

export interface PKHFormData {
  applicant_name: string;
  applicant_address: string;
  case_matter: string;
  court: string;
  case_number?: string;
  monthly_income: number;
  employment_type: "employed" | "self_employed" | "unemployed" | "retired" | "student";
  family_size: number;
  adults: number;
  children: number;
  assets: number;
  existing_obligations: number;
  means_test: PKHMeansTest;
  created_at: string;
}

export function createPKHForm(input: Omit<PKHFormData, "means_test" | "created_at">): PKHFormData {
  const means_test = computePKHMeansTest({
    monthly_income: input.monthly_income,
    monthly_deductions: input.existing_obligations,
    family_size: input.family_size,
    adults: input.adults,
    children: input.children,
  });

  return {
    ...input,
    means_test,
    created_at: new Date().toISOString(),
  };
}
