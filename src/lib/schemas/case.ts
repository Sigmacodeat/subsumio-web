import { z } from "zod";

export const caseStatusSchema = z.enum([
  "open",
  "pending",
  "settled",
  "won",
  "lost",
  "appealed",
  "dormant",
]);

export const casePrioritySchema = z.enum(["low", "medium", "high", "critical"]);

export const caseJurisdictionSchema = z.enum(["de", "at", "ch", "eu"]);

export const additionalOpponentSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200),
  slug: z.string().optional(),
  rolle: z.enum([
    "hauptbeklagter",
    "nebenbeklagter",
    "drittbeteiligter",
    "datenverantwortlicher",
    "beamter",
    "privatperson",
  ]),
  verfahrensschiene: z
    .enum([
      "zivil",
      "dsgvo",
      "straf",
      "disziplinar",
      "verwaltungsrecht",
      "finanzstraf",
      "sonstiges",
    ])
    .optional(),
  haftungsgrund: z.string().max(500).optional(),
});

export const caseFormSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich").max(300, "Titel zu lang"),
  caseNumber: z.string().max(100).optional(),
  legalArea: z.string().max(100).optional(),
  subArea: z.string().max(100).optional(),
  jurisdiction: caseJurisdictionSchema,
  status: caseStatusSchema,
  priority: casePrioritySchema,
  clientName: z.string().max(200).optional(),
  clientSlug: z.string().optional(),
  opponentName: z.string().max(200).optional(),
  opponentSlug: z.string().optional(),
  additionalOpponents: z.array(additionalOpponentSchema).optional(),
  relatedCaseSlugs: z.array(z.string()).optional(),
  mandateId: z.string().max(100).optional(),
  courtName: z.string().max(200).optional(),
  courtSlug: z.string().optional(),
  lawyerName: z.string().max(200).optional(),
  lawyerSlug: z.string().optional(),
  facts: z.string().max(10000).optional(),
  tags: z.string().optional(),
  portalEnabled: z.boolean(),
});

export type CaseFormData = z.infer<typeof caseFormSchema>;
export type AdditionalOpponentFormData = z.infer<typeof additionalOpponentSchema>;
