import { createHandler } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { getJudgementDetail } from "@/lib/legal-graph/search";
import { getCitationGraph } from "@/lib/legal-graph/citations";
import { aggregateTreatments } from "@/lib/legal-graph/validation";

export const maxDuration = 15;

export const GET = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
    cacheMaxAge: 300,
  },
  async (_ctx, _body, _query, req) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return Response.json({ error: "Database not configured" }, { status: 503 });
    }

    const url = new URL(req.url);
    const id = url.pathname.split("/").pop();
    if (!id) {
      return Response.json({ error: "Judgement ID required" }, { status: 400 });
    }

    const detail = await getJudgementDetail(pool, id);
    if (!detail) {
      return Response.json({ error: "Judgement not found" }, { status: 404 });
    }

    const citationGraph = await getCitationGraph(pool, id);

    return Response.json({
      ...detail,
      decision_date: detail.decision_date
        ? new Date(detail.decision_date).toISOString().split("T")[0]
        : null,
      citation_graph: citationGraph,
    });
  }
);

export const POST = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
  },
  async (_ctx, _body, _query, req) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return Response.json({ error: "Database not configured" }, { status: 503 });
    }

    const url = new URL(req.url);
    const id = url.pathname.split("/").pop();
    if (!id) {
      return Response.json({ error: "Judgement ID required" }, { status: 400 });
    }

    const aggregation = await aggregateTreatments(pool, id);

    return Response.json({
      judgement_id: id,
      treatment: aggregation,
    });
  }
);
