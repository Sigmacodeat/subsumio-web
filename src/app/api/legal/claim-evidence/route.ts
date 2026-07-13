import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL, engineHeaders } from "@/lib/engine";
import {
  computeClaimEvidenceCoverage,
  explainClaim,
  validateClaimEvidenceGraph,
  type ClaimEvidenceGraph,
} from "../../../../../server/src/core/legal/claim-evidence.ts";

const querySchema = z.object({
  case_slug: z.string().min(1),
  claim_id: z.string().min(1).optional(),
});

export const GET = createHandler(
  {
    action: "legal.receipt",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const headers = await engineHeaders();
    if (!headers) return apiError("unauthorized", "Nicht authentifiziert", 401);

    const graphSlug = `claim-evidence/${query.case_slug}`;
    const encodedSlug = graphSlug.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) {
      return apiError("not_found", "Claim–Evidence Graph nicht gefunden", 404);
    }
    if (!response.ok) {
      return apiError("engine_error", "Claim–Evidence Graph konnte nicht geladen werden", 502);
    }

    const page = (await response.json()) as {
      frontmatter?: Record<string, unknown>;
    };
    const graph = page.frontmatter?.claim_evidence_graph as ClaimEvidenceGraph | undefined;
    if (!graph) {
      return apiError("invalid_graph", "Gespeicherte Seite enthält keinen Graphvertrag", 409);
    }
    if (graph.brain_id && graph.brain_id !== ctx.brainId) {
      return apiError("forbidden", "Graph gehört nicht zum authentifizierten Brain", 403);
    }

    const validation = validateClaimEvidenceGraph(graph);
    if (!validation.valid) {
      return Response.json(
        { error: "invalid_graph", validation_errors: validation.errors },
        { status: 409 }
      );
    }

    if (query.claim_id) {
      const explanation = explainClaim(graph, query.claim_id);
      if (!explanation) return apiError("claim_not_found", "Claim nicht gefunden", 404);
      return Response.json({ graph_id: graph.graph_id, explanation });
    }

    return Response.json({
      graph_id: graph.graph_id,
      output_id: graph.output_id,
      jurisdiction: graph.jurisdiction,
      as_of_date: graph.as_of_date,
      coverage: computeClaimEvidenceCoverage(graph),
      claims: graph.claims,
    });
  }
);
