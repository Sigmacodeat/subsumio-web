import { z } from "zod";

export const vaultReviewSchema = z.object({
  questions: z
    .array(z.string().min(1, "Frage darf nicht leer sein"))
    .min(1, "Mindestens eine Frage erforderlich")
    .max(8, "Maximal 8 Fragen"),
});

export type VaultReviewData = z.infer<typeof vaultReviewSchema>;
