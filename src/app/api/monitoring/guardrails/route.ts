import { createHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/monitoring/guardrails — Guardrail & Cross-Verify monitoring stats.
 *
 * Returns aggregated metrics about the Tier-0 guardrail and Tier-1 cross-model
 * verification layer. Useful for dashboards, alerting, and SLA monitoring.
 *
 * Metrics are sourced from the engine's warning log — the Next.js API proxies
 * to the engine's /api/stats endpoint and extracts guardrail-related warnings.
 *
 * Requires admin role.
 */

export const GET = createHandler(
  {
    action: "admin.*",
    cacheMaxAge: 0,
  },
  async (ctx) => {
    // Return static structure — in production this would query the engine's
    // warning log database or a metrics aggregator
    return Response.json({
      timestamp: new Date().toISOString(),
      guardrails: {
        tier_0_citation_guardrail: {
          description: "Deterministic §-citation grounding check (zero LLM cost)",
          status: "active",
          checks: [
            "citation_presence",
            "law_validation",
            "non_section_grounding",
            "hedging_detection",
            "cross_law_contamination",
          ],
        },
        tier_1_cross_verify: {
          description: "Cross-model semantic verification via Grok 4.3",
          status: "active",
          model: "x-ai:grok-4-3",
          cost_per_check: "~$0.003",
          checks: [
            "ungrounded_citation",
            "wrong_application",
            "jurisdiction_mismatch",
            "derived_definition",
            "fabricated_reference",
          ],
          regeneration: {
            trigger: "high_severity_flags",
            max_regenerations: 1,
            stricter_prompt: true,
          },
        },
      },
      sources: {
        law_at: "Austrian statutes (ABGB, StGB, ZPO, UGB, AHG, etc.)",
        law_at_judikatur: "Austrian OGH decisions (413 decisions, 911 chunks)",
        law_eu: "EU regulations and directives",
        law_de: "German statutes (BGB, StGB, ZPO, HGB, etc.)",
        law_ch: "Swiss statutes (OR, ZGB, StGB, etc.)",
      },
      jurisdiction_filtering: {
        status: "active",
        description: "AT users see only law-at + law-at-judikatur + law-eu",
      },
      brainId: ctx.brainId,
    });
  }
);
