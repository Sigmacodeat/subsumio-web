import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createKYCVerification,
  assessRiskLevel,
  getExpiringKYC,
  type KYCVerification,
} from "@/lib/kyc";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  case_slug: z.string().min(1).max(300),
  client_name: z.string().min(1).max(300),
  client_email: z.string().email().optional(),
  provider: z.enum(["idnow", "video_ident", "post_ident", "manual"]).optional(),
  risk_assessment: z
    .object({
      is_pep: z.boolean(),
      is_high_risk_country: z.boolean(),
      cash_intensive: z.boolean(),
      complex_ownership: z.boolean(),
      trust_or_company_structure: z.boolean(),
    })
    .optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "kyc_verification",
      entityId: body.case_slug,
      details: { client: body.client_name, provider: body.provider },
    }),
  },
  async (ctx, body) => {
    let riskLevel: KYCVerification["risk_level"] = "low";
    let riskFactors: string[] = [];

    if (body.risk_assessment) {
      const assessment = assessRiskLevel(body.risk_assessment);
      riskLevel = assessment.level;
      riskFactors = assessment.factors;
    }

    const verification = createKYCVerification({
      case_slug: body.case_slug,
      client_name: body.client_name,
      client_email: body.client_email,
      provider: body.provider,
      risk_level: riskLevel,
      risk_factors: riskFactors,
    });

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/kyc/${verification.id}`,
        title: `KYC: ${body.client_name}`,
        type: "kyc_verification",
        frontmatter: verification,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({ verification });
  }
);

const querySchema = z.object({
  case_slug: z.string().max(300).optional(),
  expiring_days: z.coerce.number().optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "kyc_verification", limit: "500" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let items: KYCVerification[] = (
      Array.isArray(data) ? data : (data.pages ?? [])
    ) as KYCVerification[];
    if (query?.case_slug) {
      items = items.filter((v) => v.case_slug === query.case_slug);
    }
    const expiring = query?.expiring_days ? getExpiringKYC(items, query.expiring_days) : [];
    return apiSuccess({ items, expiring });
  }
);
