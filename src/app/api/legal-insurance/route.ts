import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import {
  createRSVCaseData,
  buildCoverageInquiryEmail,
  type RSVCaseData,
} from "@/lib/legal-insurance";
import {
  resolveInsuranceProvider,
  InsuranceNotConfiguredError,
} from "@/lib/legal/insurance-adapter";
import { logger } from "@/lib/logger";
import { engineWriteOrThrow } from "@/lib/engine-write";

const log = logger("api/legal-insurance");

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

    // Konfigurierte Provider-API (z. B. drebis) zuerst versuchen; ohne
    // Partnerzugang bleibt der strukturierte E-Mail-Fallback der Weg.
    let coverageResult: Awaited<
      ReturnType<ReturnType<typeof resolveInsuranceProvider>["inquireCoverage"]>
    > | null = null;
    const provider = resolveInsuranceProvider(body.insurance_provider, {
      endpoint: process.env.RSV_PROVIDER_ENDPOINT,
      apiKey: process.env.RSV_PROVIDER_API_KEY,
    });
    try {
      coverageResult = await provider.inquireCoverage({
        case_slug: body.case_slug,
        client_name: body.client_name,
        insurance_number: body.insurance_number,
        matter: body.matter,
        legal_area: body.legal_area,
        dispute_value: body.dispute_value,
      });
      rsv.coverage_reference = coverageResult.reference;
    } catch (err) {
      if (!(err instanceof InsuranceNotConfiguredError)) {
        log.error(
          "[legal-insurance] provider inquiry failed:",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    rsv.coverage_status = "pending";
    rsv.inquired_at = new Date().toISOString();

    await engineWriteOrThrow(
      `${ENGINE_URL}/api/pages`,
      {
        method: "POST",
        headers: { ...ctx.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: `legal/rsv/${rsv.id}`,
          title: `RSV: ${body.client_name} (${body.insurance_provider})`,
          type: "rsv_case",
          frontmatter: rsv,
        }),
        signal: AbortSignal.timeout(10_000),
      },
      "RSV-Anfrage"
    );

    return apiSuccess({
      rsv,
      inquiryEmail: email,
      provider: coverageResult
        ? { mode: "api" as const, coverage: coverageResult }
        : { mode: "email" as const },
    });
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
    // Every entry, not only the first engine batch of 100.
    let data: unknown[];
    try {
      data = await listEnginePages(ctx.headers, "rsv_case", 10_000, { strict: true });
    } catch {
      return apiError("engine_error", "Engine request failed", 502);
    }
    const pages = data as Array<{ frontmatter?: RSVCaseData } | RSVCaseData>;
    let items = pages.map((page) =>
      "frontmatter" in page && page.frontmatter ? page.frontmatter : (page as RSVCaseData)
    );
    if (query?.case_slug) {
      items = items.filter((r) => r.case_slug === query.case_slug);
    }
    return apiSuccess({ items });
  }
);
