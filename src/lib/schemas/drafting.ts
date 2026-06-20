import { z } from "zod";

export const draftingSchema = z.object({
  title: z.string().min(1, "Titel / Betreff ist erforderlich").max(300, "Titel zu lang"),
  legalBasis: z.string().max(200).optional(),
  klaeger: z.string().max(200).optional(),
  beklagter: z.string().max(200).optional(),
  facts: z.string().min(1, "Sachverhalt ist erforderlich").max(10000, "Sachverhalt zu lang"),
  selectedCaseSlug: z.string().optional(),
});

export type DraftingFormData = z.infer<typeof draftingSchema>;
