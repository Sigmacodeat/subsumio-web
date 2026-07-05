import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { createClaim, allocatePayment, applyPaymentToClaim, type Claim } from "@/lib/claim-account";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  case_slug: z.string().min(1).max(300),
  claimant_name: z.string().min(1).max(300),
  debtor_name: z.string().min(1).max(300),
  debtor_address: z.string().max(500).optional(),
  principal_amount: z.number().min(0),
  interest_amount: z.number().min(0).optional(),
  costs_amount: z.number().min(0).optional(),
  interest_rate: z.number().min(0).optional(),
  interest_from: z.string().min(1),
  due_date: z.string().min(1),
  court: z.string().max(300).optional(),
  claim_number: z.string().max(300).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx, body) => ({
      action: "case.create" as const,
      entityType: "claim_account",
      entityId: body.case_slug,
      details: { principal: body.principal_amount, debtor: body.debtor_name },
    }),
  },
  async (ctx, body) => {
    const claim = createClaim(body);
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/claims/${claim.id}`,
        title: `Forderung: ${claim.debtor_name} — ${claim.total_claim.toFixed(2)} €`,
        type: "claim_account",
        frontmatter: claim,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ claim });
  }
);

const paymentSchema = z.object({
  claim: z.any(),
  payment_amount: z.number().min(0.01),
});

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: paymentSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "claim_payment",
      entityId: (body.claim as Claim)?.id ?? "unknown",
      details: { payment: body.payment_amount },
    }),
  },
  async (ctx, body) => {
    const claim = body.claim as Claim;
    const allocation = allocatePayment(claim, body.payment_amount);
    const updated = applyPaymentToClaim(claim, allocation);
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/claims/${updated.id}`,
        title: `Forderung: ${updated.debtor_name} — ${updated.total_claim.toFixed(2)} €`,
        type: "claim_account",
        frontmatter: updated,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ claim: updated, allocation });
  }
);

const listQuerySchema = z.object({
  case_slug: z.string().max(300).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: listQuerySchema,
  },
  async (ctx, query) => {
    const q = query as { case_slug?: string } | undefined;
    const params = new URLSearchParams({ type: "claim_account", limit: "200" });
    if (q?.case_slug) params.set("case_slug", q.case_slug);
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    const data = res.ok ? await res.json() : { pages: [] };
    return apiSuccess({
      claims: (data.pages ?? []).map((p: { frontmatter: unknown }) => p.frontmatter),
    });
  }
);
