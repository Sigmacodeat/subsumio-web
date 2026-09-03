import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { createClaim, allocatePayment, applyPaymentToClaim, type Claim } from "@/lib/claim-account";

const createClaimSchema = z.object({
  case_slug: z.string().min(1),
  claimant_name: z.string().min(1).max(200),
  debtor_name: z.string().min(1).max(200),
  debtor_address: z.string().max(500).optional(),
  principal_amount: z.number().min(0.01),
  interest_amount: z.number().min(0).optional(),
  costs_amount: z.number().min(0).optional(),
  interest_rate: z.number().min(0).max(100).optional(),
  interest_from: z.string(),
  due_date: z.string(),
  court: z.string().max(200).optional(),
  claim_number: z.string().max(200).optional(),
});

export const POST = createHandler(
  {
    action: "invoice.read",
    rateTier: "standard",
    body: createClaimSchema,
    audit: (_ctx, body) => ({
      action: "claim.create" as const,
      entityType: "claim",
      details: {
        case_slug: body.case_slug,
        principal_amount: body.principal_amount,
        interest_amount: body.interest_amount,
        costs_amount: body.costs_amount,
        interest_rate: body.interest_rate,
        interest_from: body.interest_from,
        due_date: body.due_date,
        court: body.court,
        claim_number: body.claim_number,
      },
    }),
  },
  async (ctx, body) => {
    const claim = createClaim(body);

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/claims/${claim.id}`,
        title: `Forderung: ${claim.claimant_name} vs ${claim.debtor_name}`,
        type: "claim",
        frontmatter: claim,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({ claim });
  }
);

const listQuerySchema = z.object({
  case_slug: z.string().optional(),
  status: z
    .enum([
      "open",
      "mahnbescheid",
      "vollstreckungsbescheid",
      "zwangsvollstreckung",
      "paid",
      "written_off",
    ])
    .optional(),
});

export const GET = createHandler(
  {
    action: "invoice.read",
    rateTier: "standard",
    query: listQuerySchema,
    audit: (_ctx, _body, query) => ({
      action: "claim.list" as const,
      entityType: "claim",
      details: {
        case_slug: query?.case_slug,
        status: query?.status,
      },
    }),
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "claim", limit: "200" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let claims: Claim[] = (Array.isArray(data) ? data : (data.pages ?? [])) as Claim[];

    if (query?.case_slug) {
      claims = claims.filter((c) => c.case_slug === query.case_slug);
    }
    if (query?.status) {
      claims = claims.filter((c) => c.status === query.status);
    }

    return apiSuccess({ claims });
  }
);

// ── Payment allocation (§367 BGB) ─────────────────────────────────────

const paymentSchema = z.object({
  claim_id: z.string().min(1),
  amount: z.number().min(0.01),
});

export const PATCH = createHandler(
  {
    action: "invoice.read",
    rateTier: "standard",
    body: paymentSchema,
    audit: (_ctx, body) => ({
      action: "claim.payment_allocate" as const,
      entityType: "claim",
      entityId: body.claim_id,
      details: {
        amount: body.amount,
      },
    }),
  },
  async (ctx, body) => {
    const params = new URLSearchParams({ type: "claim", limit: "200" });
    const listRes = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!listRes.ok) return apiError("engine_error", "Engine request failed", 502);
    const listData = await listRes.json();
    const pages = (Array.isArray(listData) ? listData : (listData.pages ?? [])) as Array<{
      frontmatter: Record<string, unknown>;
      slug: string;
    }>;
    const page = pages.find((p) => {
      const fm = p.frontmatter as Record<string, unknown>;
      return fm.id === body.claim_id;
    });

    if (!page) {
      return apiError("claim_not_found", "Forderung nicht gefunden", 404);
    }

    const claim = page.frontmatter as unknown as Claim;
    const allocation = allocatePayment(claim, body.amount);
    const updated = applyPaymentToClaim(claim, allocation);

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: page.slug,
        title: `Forderung: ${updated.claimant_name} vs ${updated.debtor_name}`,
        type: "claim",
        frontmatter: updated,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({ claim: updated, allocation });
  }
);
