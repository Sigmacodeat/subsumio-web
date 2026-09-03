import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import {
  generateRubrum,
  generateLetterhead,
  type RubrumData,
  type LetterheadConfig,
} from "@/lib/letterhead-rubrum";

export const dynamic = "force-dynamic";

const rubrumSchema = z.object({
  court: z.string().min(1).max(300),
  case_number: z.string().min(1).max(200),
  plaintiffs: z.array(
    z.object({
      role: z.literal("plaintiff"),
      name: z.string().min(1).max(300),
      address: z.string().max(500).optional(),
      legal_form: z.string().max(200).optional(),
      representative: z.string().max(300).optional(),
    })
  ),
  defendants: z.array(
    z.object({
      role: z.literal("defendant"),
      name: z.string().min(1).max(300),
      address: z.string().max(500).optional(),
      legal_form: z.string().max(200).optional(),
      representative: z.string().max(300).optional(),
    })
  ),
  date: z.string().optional(),
});

const letterheadSchema = z.object({
  firm_name: z.string().min(1).max(300),
  address_line_1: z.string().min(1).max(300),
  address_line_2: z.string().max(300).optional(),
  zip_city: z.string().min(1).max(300),
  phone: z.string().max(100).optional(),
  fax: z.string().max(100).optional(),
  email: z.string().max(200).optional(),
  website: z.string().max(300).optional(),
  logo_url: z.string().max(500).optional(),
  lawyers: z.array(
    z.object({
      name: z.string().min(1).max(300),
      title: z.string().max(200),
      bar_number: z.string().max(100).optional(),
    })
  ),
  tax_number: z.string().max(100).optional(),
  vat_id: z.string().max(100).optional(),
  bank_details: z
    .object({
      iban: z.string().max(34),
      bic: z.string().max(11),
      bank_name: z.string().max(200),
    })
    .optional(),
});

const bodySchema = z.object({
  rubrum: rubrumSchema.optional(),
  letterhead: letterheadSchema.optional(),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "drafting.generate" as const,
      entityType: "letterhead_rubrum",
      details: {
        hasLetterhead: Boolean(body.letterhead),
        hasRubrum: Boolean(body.rubrum),
      },
    }),
  },
  async (_ctx, body) => {
    const parts: string[] = [];
    if (body.letterhead) {
      parts.push(generateLetterhead(body.letterhead as LetterheadConfig));
    }
    if (body.rubrum) {
      parts.push(generateRubrum(body.rubrum as RubrumData));
    }
    return apiSuccess({ text: parts.join("\n\n---\n\n") });
  }
);
