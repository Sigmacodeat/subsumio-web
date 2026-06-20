import { z } from "zod";

export const verfahrensdokuSchema = z.object({
  kanzleiName: z.string().min(1, "Kanzlei-Name ist erforderlich").max(200),
  anwaltName: z.string().max(200).optional().default(""),
  ustId: z.string().max(50).optional().default(""),
  verantwortlich: z.string().max(200).optional().default(""),
  systeme: z.string().max(500).optional().default(""),
  belegEingang: z.string().max(2000).optional().default(""),
  erfassung: z.string().max(2000).optional().default(""),
  ablageOrt: z.string().max(500).optional().default(""),
  backup: z.string().max(2000).optional().default(""),
  zugriffsschutz: z.string().max(2000).optional().default(""),
  iks: z.string().max(2000).optional().default(""),
  stand: z.string().max(20).optional().default(""),
});

export type VerfahrensdokuFormData = z.infer<typeof verfahrensdokuSchema>;
