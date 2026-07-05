import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { createFeeAgreement, type FeeAgreement } from "@/lib/fee-agreements";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  case_slug: z.string().min(1).max(300),
  model: z.enum(["rvg", "hourly", "flat", "capped"]),
  hourly_rate: z.number().min(0).optional(),
  flat_amount: z.number().min(0).optional(),
  budget_cap: z.number().min(0).optional(),
  rvg_area: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "fee_agreement",
      entityId: body.case_slug,
      details: { model: body.model, budgetCap: body.budget_cap },
    }),
  },
  async (ctx, body) => {
    const agreement = createFeeAgreement(body);
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/fee-agreements/${agreement.id}`,
        title: `Honorar: ${body.case_slug} (${body.model})`,
        type: "fee_agreement",
        frontmatter: agreement,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ agreement });
  }
);

const listQuerySchema = z.object({
  case_slug: z.string().max(300).optional(),
});

export const GET = createHandler(
  {
    action: "invoice.read",
    rateTier: "standard",
    query: listQuerySchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "fee_agreement", limit: "200" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let items: FeeAgreement[] = (Array.isArray(data) ? data : (data.pages ?? [])) as FeeAgreement[];
    if (query?.case_slug) {
      items = items.filter((a) => a.case_slug === query.case_slug);
    }
    return apiSuccess({ items });
  }
);
