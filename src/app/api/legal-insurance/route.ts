import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createRSVCaseData,
  buildCoverageInquiryEmail,
  type RSVCaseData,
} from "@/lib/legal-insurance";

export const dynamic = "force-dynamic";

const inquireSchema = z.object({
  case_slug: z.string().min(1).max(300),
  client_name: z.string().min(1).max(300),
  insurance_provider: z.string().min(1).max(200),
  insurance_number: z.string().max(100).optional(),
  matter: z.string().min(1).max(2000),
  legal_area: z.string().min(1).max(100),
  dispute_value: z.number().min(0).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: inquireSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "rsv_case",
      entityId: body.case_slug,
      details: { provider: body.insurance_provider, client: body.client_name },
    }),
  },
  async (ctx, body) => {
    const rsv = createRSVCaseData({
      case_slug: body.case_slug,
      client_name: body.client_name,
      insurance_provider: body.insurance_provider,
      insurance_number: body.insurance_number,
    });

    const email = buildCoverageInquiryEmail(rsv, body.matter, body.legal_area, body.dispute_value);

    rsv.coverage_status = "pending";
    rsv.inquired_at = new Date().toISOString();

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/rsv/${rsv.id}`,
        title: `RSV: ${body.client_name} (${body.insurance_provider})`,
        type: "rsv_case",
        frontmatter: rsv,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({ rsv, inquiryEmail: email });
  }
);

const querySchema = z.object({
  case_slug: z.string().max(300).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "rsv_case", limit: "200" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<
      { frontmatter?: RSVCaseData } | RSVCaseData
    >;
    let items = pages.map((page) =>
      "frontmatter" in page && page.frontmatter ? page.frontmatter : (page as RSVCaseData)
    );
    if (query?.case_slug) {
      items = items.filter((r) => r.case_slug === query.case_slug);
    }
    return apiSuccess({ items });
  }
);
