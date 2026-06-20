import { z } from "zod";

// ── Deadline Calculation ────────────────────────────────────────────────────

export const bundeslandSchema = z.enum([
  "BB", "BE", "BW", "BY", "HB", "HE", "HH",
  "MV", "NI", "NW", "RP", "SH", "SL", "SN", "ST", "TH", "AT",
]);

export const deadlineRuleSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  law: z.string().min(1),
  days: z.number().int().positive().optional(),
  months: z.number().int().positive().optional(),
  years: z.number().int().positive().optional(),
  description: z.string().min(1),
}).refine(
  (data) => data.days || data.months || data.years,
  { message: "At least one of days, months, or years must be set" },
);

export const deadlineInputSchema = z.object({
  rule: deadlineRuleSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  state: bundeslandSchema.optional(),
});

export type DeadlineInput = z.infer<typeof deadlineInputSchema>;

// ── RVG ──────────────────────────────────────────────────────────────────────

export const rvgInputSchema = z.object({
  streitwert: z.number().finite().nonnegative(),
});

export type RvgInput = z.infer<typeof rvgInputSchema>;

// ── AI Deadline Detection ───────────────────────────────────────────────────

export const deadlineDetectInputSchema = z.object({
  text: z.string().min(1, "Text must not be empty").max(500_000, "Text too large for detection"),
});

export type DeadlineDetectInput = z.infer<typeof deadlineDetectInputSchema>;

// ── Portal Token ─────────────────────────────────────────────────────────────

export const portalTokenInputSchema = z.object({
  caseSlug: z.string().min(1).max(500),
  ttlSeconds: z.number().int().positive().max(365 * 24 * 3600).optional(),
});

export type PortalTokenInput = z.infer<typeof portalTokenInputSchema>;
