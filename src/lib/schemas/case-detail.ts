import { z } from "zod";

export const deadlineFormSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Titel ist erforderlich").max(200, "Titel zu lang"),
  due_date: z.string().min(1, "Datum ist erforderlich"),
  date: z.string().optional(),
  type: z.enum(["deadline", "hearing", "meeting", "filing", "reminder"]),
  status: z.enum(["pending", "warning", "critical", "overdue", "done"]),
  description: z.string().max(2000).optional(),
  law: z.string().optional(),
  rule_key: z.string().optional(),
  calculation_note: z.string().optional(),
  review_status: z.enum(["unreviewed", "reviewed", "approved", "rejected"]).optional(),
  reviewed_by: z.string().optional(),
  reviewed_at: z.string().optional(),
});

export type DeadlineFormData = z.infer<typeof deadlineFormSchema>;

export const evidenceFormSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich").max(200, "Titel zu lang"),
  type: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  source: z.string().max(200).optional(),
  weight: z.number().min(0).max(1),
});

export type EvidenceFormData = z.infer<typeof evidenceFormSchema>;

export const timeEntryFormSchema = z.object({
  description: z.string().min(1, "Tätigkeit ist erforderlich").max(500),
  minutes: z.string().min(1, "Minuten erforderlich"),
  rate: z.string().optional(),
  lawyer: z.string().max(200).optional(),
  activity_type: z.string(),
  billable: z.boolean(),
});

export type TimeEntryFormData = z.infer<typeof timeEntryFormSchema>;

export const expenseFormSchema = z.object({
  description: z.string().min(1, "Beschreibung ist erforderlich").max(500),
  amount: z.string().min(1, "Betrag erforderlich"),
  billable: z.boolean(),
});

export type ExpenseFormData = z.infer<typeof expenseFormSchema>;
