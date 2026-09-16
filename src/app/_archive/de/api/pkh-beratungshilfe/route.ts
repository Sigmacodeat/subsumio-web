import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import {
  computePKHMeansTest,
  checkBeratungshilfe,
  createPKHForm,
  PKH_FREIBETRAEGE_2026,
  type PKHMeansTest,
  type BeratungshilfeBerechtigung,
  type PKHFormData,
} from "@/lib/pkh-beratungshilfe";

export const dynamic = "force-dynamic";

const meansTestSchema = z.object({
  monthly_income: z.number().min(0),
  monthly_deductions: z.number().min(0),
  family_size: z.number().int().min(1),
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
});

const beratungshilfeSchema = z.object({
  net_income: z.number().min(0),
  family_size: z.number().int().min(1),
});

const pkhFormSchema = z.object({
  applicant_name: z.string().min(1).max(300),
  applicant_address: z.string().min(1).max(500),
  case_matter: z.string().min(1).max(1000),
  court: z.string().min(1).max(300),
  case_number: z.string().max(200).optional(),
  monthly_income: z.number().min(0),
  employment_type: z.enum(["employed", "self_employed", "unemployed", "retired", "student"]),
  family_size: z.number().int().min(1),
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
  assets: z.number().min(0),
  existing_obligations: z.number().min(0),
});

const bodySchema = z.object({
  means_test: meansTestSchema.optional(),
  beratungshilfe: beratungshilfeSchema.optional(),
  pkh_form: pkhFormSchema.optional(),
});

export const POST = createHandler(
  {
    action: "legal.rvg",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "legal.rvg" as const,
      entityType: "pkh_form",
      details: {
        means_test: !!body.means_test,
        beratungshilfe: !!body.beratungshilfe,
        pkh_form: !!body.pkh_form,
      },
    }),
  },
  async (_ctx, body) => {
    const result: {
      means_test?: PKHMeansTest;
      beratungshilfe?: BeratungshilfeBerechtigung;
      pkh_form?: PKHFormData;
      freibetraege: typeof PKH_FREIBETRAEGE_2026;
    } = { freibetraege: PKH_FREIBETRAEGE_2026 };

    if (body.means_test) {
      result.means_test = computePKHMeansTest(body.means_test);
    }
    if (body.beratungshilfe) {
      result.beratungshilfe = checkBeratungshilfe(body.beratungshilfe);
    }
    if (body.pkh_form) {
      result.pkh_form = createPKHForm(body.pkh_form);
    }

    return apiSuccess(result);
  }
);
