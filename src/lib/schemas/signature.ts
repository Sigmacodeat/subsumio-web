import { z } from "zod";

export const signatureRequestSchema = z.object({
  documentName: z.string().min(1, "Dokumentname ist erforderlich").max(300, "Maximal 300 Zeichen"),
  recipientName: z.string().max(200).optional().default(""),
  recipientEmail: z
    .string()
    .min(1, "E-Mail ist erforderlich")
    .email("Ungültige E-Mail-Adresse")
    .max(200),
  expiresDays: z.string().min(1, "Gültigkeit erforderlich").max(3).default("14"),
});

export type SignatureRequestFormData = z.infer<typeof signatureRequestSchema>;
