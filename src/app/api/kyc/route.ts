import { z } from "zod";
import { isStaffRole } from "@/lib/team-visibility";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { listEnginePages } from "@/lib/engine-pages";
import {
  assessRiskLevel,
  createKYCVerification,
  getExpiringKYC,
  type KYCVerification,
} from "@/lib/kyc";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  case_slug: z.string().trim().min(1).max(300),
  client_name: z.string().trim().min(1).max(300),
  client_email: z.string().email().optional(),
  party_type: z.enum(["natural", "legal"]).optional(),
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
  { action: "brain.write", rateTier: "standard", body: createSchema },
  async (ctx, body) => {
    const assessment = body.risk_assessment ? assessRiskLevel(body.risk_assessment) : null;
    const verification = createKYCVerification({
      case_slug: body.case_slug,
      client_name: body.client_name,
      client_email: body.client_email,
      party_type: body.party_type,
      provider: body.provider,
      risk_level: assessment?.level,
      risk_factors: assessment?.factors,
      created_by: ctx.user.email,
    });
    if (body.risk_assessment?.is_pep) verification.pep_match = true;

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/kyc/${verification.id}`,
        title: `Identitätsprüfung: ${body.client_name}`,
        type: "kyc_verification",
        content: `Identitätsprüfung nach §§ 8a ff. RAO für ${body.client_name}.`,
        frontmatter: verification,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // Before, the route reported success even when nothing was stored.
    if (!res.ok)
      return apiError("engine_error", "Die Prüfung konnte nicht gespeichert werden", 502);

    void logAudit("kyc.create", "kyc_verification", {
      entityId: verification.id,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: { case: body.case_slug, risk: verification.risk_level },
    });
    return apiSuccess({ verification }, undefined, 201);
  }
);

const KYC_LIST_MAX = 20_000;

const querySchema = z.object({
  case_slug: z.string().max(300).optional(),
  expiring_days: z.coerce.number().optional(),
});

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query) => {
    // AML file (risk rating, screening, refusal reasons) is firm-internal —
    // never for client accounts, not even for their own matter.
    if (!isStaffRole(ctx.user.role)) {
      return apiError("forbidden", "Identitätsprüfungen sind nur für die Kanzlei einsehbar.", 403);
    }
    // Every record, paged past the engine's per-request cap, without deleted
    // ones — expiring IDs must not drop out of the list silently.
    let pages: Array<{ frontmatter?: KYCVerification }>;
    try {
      pages = (await listEnginePages(ctx.headers, "kyc_verification", KYC_LIST_MAX, {
        strict: true,
      })) as unknown as Array<{ frontmatter?: KYCVerification }>;
    } catch {
      return apiError("engine_error", "Die Identitätsprüfungen konnten nicht geladen werden", 502);
    }
    // The record lives in the page frontmatter.
    let items = pages.map((p) => p.frontmatter).filter((v): v is KYCVerification => Boolean(v?.id));
    if (query?.case_slug) items = items.filter((v) => v.case_slug === query.case_slug);
    const expiring = query?.expiring_days ? getExpiringKYC(items, query.expiring_days) : [];
    return apiSuccess({ items, expiring });
  }
);
