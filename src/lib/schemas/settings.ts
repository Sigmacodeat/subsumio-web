import { z } from "zod";

export const kanzleiSettingsSchema = z.object({
  kanzleiName: z.string().min(1, "Kanzlei-Name ist erforderlich").max(200, "Maximal 200 Zeichen"),
  anwaltName: z.string().min(1, "Anwalt-Name ist erforderlich").max(200, "Maximal 200 Zeichen"),
  kanzleiAdresse: z.string().max(500).optional().default(""),
  kanzleiEmail: z.string().max(200).optional().default(""),
  kanzleiTelefon: z.string().max(100).optional().default(""),
  kammerNummer: z.string().max(100).optional().default(""),
  ustId: z.string().max(50).optional().default(""),
  stundensatz: z.string().max(10).optional().default("200"),
  abrechnungstakt: z.string().max(10).optional().default("15"),
  bankName: z.string().max(200).optional().default(""),
  iban: z.string().max(50).optional().default(""),
  bic: z.string().max(20).optional().default(""),
  zahlungszielTage: z.string().max(10).optional().default("14"),
  rechnungFooter: z.string().max(1000).optional().default(""),
  tarifModell: z.enum(["rvg", "ratg", "custom"]).optional().default("custom"),
  datevKontenrahmen: z.enum(["SKR03", "SKR04", "SKR49"]).optional().default("SKR03"),
  datevBeraterNr: z.string().max(50).optional().default(""),
  datevMandantenNr: z.string().max(50).optional().default(""),
  smtpHost: z.string().max(200).optional().default(""),
  smtpPort: z.string().max(10).optional().default("587"),
  smtpUser: z.string().max(200).optional().default(""),
  smtpPassword: z.string().max(200).optional().default(""),
  smtpSecure: z.boolean().optional().default(false),
  emailFrom: z.string().max(200).optional().default(""),
  rechtsgebietSaetze: z.record(z.string(), z.number()).optional().default({}),
});

export type KanzleiSettingsFormData = z.infer<typeof kanzleiSettingsSchema>;

export const apiKeysSchema = z.object({
  openaiKey: z.string().max(200).optional().default(""),
  anthropicKey: z.string().max(200).optional().default(""),
  zeroEntropyKey: z.string().max(200).optional().default(""),
});

export type ApiKeysFormData = z.infer<typeof apiKeysSchema>;

export const modelPreferenceSchema = z.object({
  modelId: z.string().min(1, "Model ID is required").max(100),
});

export type ModelPreferenceFormData = z.infer<typeof modelPreferenceSchema>;
