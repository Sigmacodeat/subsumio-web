import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createCreditCheck,
  interpretCreditScore,
  GDPR_NOTICE_DE,
  type CreditCheckResult,
} from "@/lib/credit-check";

export const dynamic = "force-dynamic";

const checkSchema = z.object({
  case_slug: z.string().max(300).optional(),
  client_name: z.string().min(1).max(300),
  client_company: z.string().max(300).optional(),
  gdpr_consent: z.boolean(),
  provider: z.enum(["creditreform", "manual", "opted_out"]).optional(),
  score: z.number().min(0).max(100).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: checkSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "credit_check",
      entityId: body.client_name,
      details: { caseSlug: body.case_slug, gdprConsent: body.gdpr_consent },
    }),
  },
  async (ctx, body) => {
    if (!body.gdpr_consent) {
      return apiError("consent_required", GDPR_NOTICE_DE, 400);
    }
    const check = createCreditCheck({
      case_slug: body.case_slug,
      client_name: body.client_name,
      client_company: body.client_company,
      gdpr_consent: body.gdpr_consent,
      provider: body.provider,
    });
    if (body.score !== undefined) {
      const interpretation = interpretCreditScore(body.score);
      check.risk_level = interpretation.risk_level;
      check.payment_behavior = interpretation.payment_behavior;
      check.score = body.score;
      check.status = "completed";
      check.checked_at = new Date().toISOString();
    }
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/credit-checks/${check.id}`,
        title: `Bonität: ${body.client_name}`,
        type: "credit_check",
        frontmatter: check,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ check, gdpr_notice: GDPR_NOTICE_DE });
  }
);

const listSchema = z.object({
  case_slug: z.string().max(300).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: listSchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "credit_check", limit: "200" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let items: CreditCheckResult[] = (
      Array.isArray(data) ? data : (data.pages ?? [])
    ) as CreditCheckResult[];
    if (query?.case_slug) {
      items = items.filter((c) => c.case_slug === query.case_slug);
    }
    return apiSuccess({ items });
  }
);
