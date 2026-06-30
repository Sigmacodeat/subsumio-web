import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  submitElsterForm,
  getElsterConnectionStatus,
  validateElsterForm,
  type ElsterFormData,
} from "@/lib/elster";

export const dynamic = "force-dynamic";

const submitSchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  formType: z.enum(["UStVA", "LStA", "ZM", "ESt", "USt", "GewSt", "KSt"]),
  period: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  taxAmount: z.number().optional(),
  refundAmount: z.number().optional(),
  vatPrevious: z.number().optional(),
  vatPayable: z.number().optional(),
  vatDeductible: z.number().optional(),
  grossWages: z.number().optional(),
  withheldTax: z.number().optional(),
  euCountryCode: z.string().length(2).optional(),
  euVatId: z.string().optional(),
  euTurnover: z.number().optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/tax/elster
 * Returns ELSTER connection status and recent submission history from the brain.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    if (ctx.user.industry !== "tax") {
      return apiError("forbidden", "ELSTER is only available for tax users", 403);
    }

    const status = getElsterConnectionStatus();
    const params = new URLSearchParams({
      type: "page",
      tag: "elster-submission",
      limit: "50",
    });

    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });

    let submissions: unknown[] = [];
    if (res.ok) {
      const data = await res.json();
      submissions = Array.isArray(data) ? data : (data.pages ?? []);
    }

    return Response.json({ status, submissions });
  }
);

/**
 * POST /api/tax/elster
 * Validates and queues an ELSTER submission. Stores a submission page in the brain.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: submitSchema,
    audit: (ctx, body) => ({
      action: "tax.elster_submit" as const,
      entityType: "elster_submission",
      details: { by: ctx.user.email, formType: body.formType, period: body.period },
    }),
  },
  async (ctx, body, _query, _req) => {
    if (ctx.user.industry !== "tax") {
      return apiError("forbidden", "ELSTER is only available for tax users", 403);
    }

    const data: ElsterFormData = body;
    const validationErrors = validateElsterForm(data);
    if (validationErrors.length > 0) {
      return apiError("validation_error", validationErrors.join(", "), 400);
    }

    let submission: Awaited<ReturnType<typeof submitElsterForm>>;
    try {
      submission = await submitElsterForm(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed";
      return apiError("elster_error", message, 500);
    }

    const now = new Date().toISOString();
    const slug = `tax/elster/${data.formType}-${data.period}-${data.clientName
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, "-")
      .slice(0, 40)}-${Date.now().toString(36)}`;

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: `ELSTER ${data.formType} ${data.period} — ${data.clientName}`,
        type: "elster-submission",
        content: data.notes ?? `ELSTER ${data.formType} ${data.period}`,
        tags: ["elster-submission", data.formType.toLowerCase()],
        frontmatter: {
          type: "elster-submission",
          client_id: data.clientId,
          client_name: data.clientName,
          form_type: data.formType,
          period: data.period,
          year: data.year,
          tax_amount: data.taxAmount ?? null,
          refund_amount: data.refundAmount ?? null,
          elster_status: submission.status,
          elster_reference: submission.elsterReference ?? null,
          submitted_at: submission.submittedAt ?? null,
          created_at: now,
          updated_at: now,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError(
        "engine_error",
        `Failed to store ELSTER submission: ${text.slice(0, 200)}`,
        502
      );
    }

    const result = await res.json();
    return Response.json({ slug, submission, ...result }, { status: 201 });
  }
);
