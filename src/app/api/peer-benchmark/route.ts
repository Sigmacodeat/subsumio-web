import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  buildBenchmarkExport,
  applyKAnonymity,
  computeRealizationRate,
  computeThroughputStats,
  computePercentile,
  MIN_FIRMS_FOR_DISPLAY,
  type BenchmarkMetric,
} from "@/lib/peer-benchmark";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  firm_id: z.string().min(1),
  legal_area: z.string().min(1).max(100),
  total_cases: z.number().min(0),
  won_cases: z.number().min(0),
  durations: z.array(z.number().min(0)),
  period_from: z.string().max(20),
  period_to: z.string().max(20),
});

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: exportSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "benchmark_export",
      entityId: body.legal_area,
      details: { totalCases: body.total_cases, wonCases: body.won_cases },
    }),
  },
  async (ctx, body) => {
    const exportRecord = buildBenchmarkExport({
      firmId: body.firm_id,
      legalArea: body.legal_area,
      totalCases: body.total_cases,
      wonCases: body.won_cases,
      durations: body.durations,
      periodFrom: body.period_from,
      periodTo: body.period_to,
    });
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/benchmark-exports/${exportRecord.firm_id_hash}-${Date.now()}`,
        title: `Benchmark ${exportRecord.legal_area}`,
        type: "benchmark_export",
        frontmatter: exportRecord,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ export: exportRecord });
  }
);

const querySchema = z.object({
  legal_area: z.string().max(100).optional(),
});

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "benchmark_metric", limit: "200" });
    const response = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    const data = response.ok ? await response.json() : [];
    const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<
      { frontmatter?: BenchmarkMetric } | BenchmarkMetric
    >;
    const metrics = pages
      .map((page) =>
        "frontmatter" in page && page.frontmatter ? page.frontmatter : (page as BenchmarkMetric)
      )
      .filter((metric) => !query?.legal_area || metric.legal_area === query.legal_area);
    const filtered = applyKAnonymity(metrics);
    return apiSuccess({
      metrics: filtered,
      minFirms: MIN_FIRMS_FOR_DISPLAY,
      yourRealizationRate: computeRealizationRate(0, 0),
      yourThroughput: computeThroughputStats([]),
      percentile: computePercentile(0, []),
    });
  }
);
