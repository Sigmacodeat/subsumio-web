import { z } from "zod";
import { uiLanguageSchema } from "@/lib/api-validation";

/** Request of POST /api/legal/contract-draft — shared by the route and the
 *  Word add-in's contract test (the add-in must send exactly this shape). */
export const contractDraftSchema = z.object({
  type: z.string().min(1, "type_required").max(100),
  jurisdiction: z.enum(["at", "de", "ch"]),
  parties: z.object({
    a: z.string().min(1).max(300),
    b: z.string().min(1).max(300),
  }),
  instructions: z.string().max(5000).optional().default(""),
  template_slug: z.string().max(200).optional(),
  language: uiLanguageSchema.default("de"),
});
