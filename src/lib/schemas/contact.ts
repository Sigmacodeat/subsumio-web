import { z } from "zod";

export const contactRoleSchema = z.enum(["client", "opponent", "court", "lawyer", "other"]);

export const contactFormSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200, "Name zu lang"),
  role: contactRoleSchema,
  company: z.string().max(200).optional(),
  email: z.string().email("Ungültige E-Mail-Adresse").or(z.literal("")),
  phone: z.string().max(50).optional(),
  address: z.string().max(1000).optional(),
  notes: z.string().max(5000).optional(),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;
