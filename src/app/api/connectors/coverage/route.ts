import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getCoverageMatrix, getCoverageSummary, validateMatrix } from "@/lib/connector-coverage";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 300,
  },
  async (_ctx, _body, _query, _req) => {
    const matrix = getCoverageMatrix();
    const summary = getCoverageSummary();
    const validation = validateMatrix();

    return apiSuccess({
      summary,
      total: matrix.total,
      available: matrix.available_count,
      beta: matrix.beta_count,
      planned: matrix.planned_count,
      by_category: matrix.by_category,
      by_status: matrix.by_status,
      coverage_gaps: matrix.coverage_gaps,
      connectors: matrix.connectors,
      validation,
    });
  }
);
