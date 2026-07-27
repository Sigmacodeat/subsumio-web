/**
 * Legal Pipeline Structure Tests (Phase 6b — structural validation)
 *
 * Validates that the 7-layer Legal Agent Pipeline V2 is correctly wired:
 *   - All specialists referenced in the pipeline exist in EMBEDDED_SPECIALISTS
 *   - Layer ordering is correct (1→7)
 *   - Critical specialists (subsumption-checker, opponent-simulator) are deep tier
 *   - Law-matcher has access to search/get_page for §-retrieval
 *   - Cost estimation per layer is within budget
 *
 * This is a structural test — no API calls, no engine required.
 * The companion harness (phase6-pipeline-e2e.ts) does the full E2E test.
 */

import { describe, it, expect } from "bun:test";
import { EMBEDDED_SPECIALISTS, resolveSpecialist } from "../src/core/minions/specialist-defs.ts";
import {
  LAYER_REGISTRY,
  validateNoHiddenContinue,
  getMandatoryLayerIds,
} from "../src/core/minions/pipeline-registry.ts";
import {
  validateAllWorkflowDefs,
  listWorkflowIds,
  WORKFLOW_DEFS,
} from "../src/core/minions/workflow-defs.ts";
import { TIER_DEFAULTS } from "../src/core/model-config.ts";

// ── Pipeline layer → specialist mapping (from legal-pipeline.ts) ──────────
interface LayerSpec {
  specialist: string;
  tier: "utility" | "reasoning" | "deep";
  output: string;
  mapReduce?: boolean;
}

const PIPELINE_LAYERS: Record<string, LayerSpec> = {
  "1": { specialist: "on-scanner", tier: "utility", output: "on_index", mapReduce: true },
  "2": { specialist: "entity-extractor", tier: "utility", output: "entities", mapReduce: true },
  "3": {
    specialist: "forensic-analyst",
    tier: "reasoning",
    output: "forensic_report",
    mapReduce: true,
  },
  "3c": { specialist: "fact-gap-detector", tier: "reasoning", output: "fact_gap" },
  "4": { specialist: "law-matcher", tier: "utility", output: "legal_grounding_map" },
  "4b": { specialist: "precedent-matcher", tier: "reasoning", output: "precedent_match" },
  "4c": { specialist: "burden-of-proof-analyzer", tier: "reasoning", output: "burden_of_proof" },
  "4d": { specialist: "admissibility-checker", tier: "reasoning", output: "admissibility_check" },
  "4f": { specialist: "evidence-quality-assessor", tier: "reasoning", output: "evidence_quality" },
  "4g": { specialist: "witness-expert-analyzer", tier: "reasoning", output: "witness_expert" },
  "5": {
    specialist: "damage-extractor",
    tier: "reasoning",
    output: "damage_table + deadline_calendar",
    mapReduce: true,
  },
  "5b": { specialist: "deadline-validator", tier: "reasoning", output: "deadline_validation" },
  "5c": { specialist: "cost-benefit-analyzer", tier: "reasoning", output: "cost_benefit" },
  "5d": { specialist: "settlement-analyzer", tier: "reasoning", output: "settlement_analysis" },
  "5e": { specialist: "enforcement-analyzer", tier: "reasoning", output: "enforcement_analysis" },
  "5f": { specialist: "appeal-risk-analyzer", tier: "reasoning", output: "appeal_risk" },
  "5g": { specialist: "procedural-strategist", tier: "reasoning", output: "procedural_strategy" },
  "5h": {
    specialist: "insurance-coverage-analyzer",
    tier: "reasoning",
    output: "insurance_coverage",
  },
  "5i": { specialist: "tax-impact-analyzer", tier: "reasoning", output: "tax_impact" },
  "5j": { specialist: "counterclaim-analyzer", tier: "reasoning", output: "counterclaim_risk" },
  "5k": { specialist: "mediation-adr-analyzer", tier: "reasoning", output: "mediation_adr" },
  "5l": { specialist: "limitation-scanner", tier: "reasoning", output: "limitation_scan" },
  "5m": { specialist: "cost-award-predictor", tier: "reasoning", output: "cost_award" },
  "6": { specialist: "legal-drafter", tier: "reasoning", output: "legal_draft" },
  "6.5": { specialist: "opponent-simulator", tier: "deep", output: "counter_arguments" },
  "7": { specialist: "subsumption-checker", tier: "deep", output: "quality_audit" },
  "7e": { specialist: "legal-critic", tier: "deep", output: "ensemble_critic" },
};

// Specialists that MUST have search + get_page tools (§-retrieval capability)
const SPECIALISTS_REQUIRING_SEARCH = new Set([
  "law-matcher",
  "subsumption-checker",
  "opponent-simulator",
  "precedent-matcher",
  "deadline-validator",
  "legal-critic",
  "legal-researcher",
]);

describe("Pipeline structure — all specialists exist", () => {
  it("every specialist referenced in the pipeline exists in EMBEDDED_SPECIALISTS", () => {
    for (const [layer, spec] of Object.entries(PIPELINE_LAYERS)) {
      const def = resolveSpecialist(spec.specialist);
      expect(def, `Layer ${layer}: specialist "${spec.specialist}" not found`).not.toBeNull();
    }
  });

  it("pipeline has at least 25 specialist invocations across 7 layers", () => {
    const count = Object.keys(PIPELINE_LAYERS).length;
    expect(count).toBeGreaterThanOrEqual(25);
  });
});

describe("Pipeline structure — tier assignments per layer", () => {
  for (const [layer, spec] of Object.entries(PIPELINE_LAYERS)) {
    it(`Layer ${layer} (${spec.specialist}) is on ${spec.tier} tier`, () => {
      const def = resolveSpecialist(spec.specialist);
      expect(def).not.toBeNull();
      expect(def!.modelTier).toBe(spec.tier);
    });
  }
});

describe("Pipeline structure — §-retrieval capability", () => {
  it("law-matcher has search and get_page tools", () => {
    const def = resolveSpecialist("law-matcher");
    expect(def).not.toBeNull();
    expect(def!.allowedTools).toContain("search");
    expect(def!.allowedTools).toContain("get_page");
  });

  it("subsumption-checker has search and get_page tools", () => {
    const def = resolveSpecialist("subsumption-checker");
    expect(def).not.toBeNull();
    expect(def!.allowedTools).toContain("search");
    expect(def!.allowedTools).toContain("get_page");
  });

  it("opponent-simulator has search and get_page tools", () => {
    const def = resolveSpecialist("opponent-simulator");
    expect(def).not.toBeNull();
    expect(def!.allowedTools).toContain("search");
    expect(def!.allowedTools).toContain("get_page");
  });

  it("all §-retrieval specialists have search + get_page", () => {
    for (const name of SPECIALISTS_REQUIRING_SEARCH) {
      const def = resolveSpecialist(name);
      expect(def, `specialist "${name}" not found`).not.toBeNull();
      expect(def!.allowedTools, `${name} must have search`).toContain("search");
      expect(def!.allowedTools, `${name} must have get_page`).toContain("get_page");
    }
  });
});

describe("Pipeline structure — critical specialist validation", () => {
  it("subsumption-checker has anti-hallucination rules in system prompt", () => {
    const def = resolveSpecialist("subsumption-checker");
    expect(def).not.toBeNull();
    expect(def!.systemPrompt).toContain("ERFINDE KEINE");
    expect(def!.systemPrompt).toContain("source_text");
  });

  it("opponent-simulator has counter-argument structure in system prompt", () => {
    const def = resolveSpecialist("opponent-simulator");
    expect(def).not.toBeNull();
    expect(def!.systemPrompt).toContain("GEGENSEITE");
    expect(def!.systemPrompt).toContain("counter_arguments");
  });

  it("law-matcher has §-retrieval structure in system prompt", () => {
    const def = resolveSpecialist("law-matcher");
    expect(def).not.toBeNull();
    expect(def!.systemPrompt).toContain("paragraph");
    expect(def!.systemPrompt).toContain("source_text");
  });
});

describe("Pipeline cost estimation", () => {
  const TIER_COST_PER_CALL: Record<string, number> = {
    utility: 0.001,
    reasoning: 0.002,
    deep: 0.008,
  };

  it("estimated cost per pipeline run is within $50 budget cap", () => {
    let totalCost = 0;
    for (const spec of Object.values(PIPELINE_LAYERS)) {
      const cost = TIER_COST_PER_CALL[spec.tier];
      const calls = spec.mapReduce ? 5 : 1;
      totalCost += cost * calls;
    }
    totalCost *= 1.5;
    expect(totalCost).toBeLessThan(50);
  });

  it("deep-tier specialists (Grok 4.3) are used sparingly", () => {
    const deepCount = Object.values(PIPELINE_LAYERS).filter((s) => s.tier === "deep").length;
    const totalCount = Object.keys(PIPELINE_LAYERS).length;
    const deepRatio = deepCount / totalCount;
    expect(deepRatio).toBeLessThan(0.15);
  });
});

describe("Pipeline layer ordering", () => {
  it("Layer 1 (on-scanner) runs before Layer 2 (entity-extractor)", () => {
    expect(PIPELINE_LAYERS["1"].specialist).toBe("on-scanner");
    expect(PIPELINE_LAYERS["2"].specialist).toBe("entity-extractor");
  });

  it("Layer 4 (law-matcher) runs after Layer 3 (forensic-analyst)", () => {
    expect(PIPELINE_LAYERS["3"].specialist).toBe("forensic-analyst");
    expect(PIPELINE_LAYERS["4"].specialist).toBe("law-matcher");
  });

  it("Layer 6.5 (opponent-simulator) runs after Layer 6 (legal-drafter)", () => {
    expect(PIPELINE_LAYERS["6"].specialist).toBe("legal-drafter");
    expect(PIPELINE_LAYERS["6.5"].specialist).toBe("opponent-simulator");
  });

  it("Layer 7 (subsumption-checker + ensemble critic) is the final layer", () => {
    expect(PIPELINE_LAYERS["7"].specialist).toBe("subsumption-checker");
    expect(PIPELINE_LAYERS["7e"].specialist).toBe("legal-critic");
    expect(PIPELINE_LAYERS["7"].tier).toBe("deep");
    expect(PIPELINE_LAYERS["7e"].tier).toBe("deep");
  });
});

describe("Pipeline guardrail integration (AP-1/AP-2)", () => {
  it("legal-pipeline.ts imports checkCitationGrounding from citation-guardrail", async () => {
    const source = await Bun.file("./server/src/core/minions/handlers/legal-pipeline.ts").text();
    expect(source).toContain("checkCitationGrounding");
    expect(source).toContain("citation-guardrail");
  });

  it("legal-pipeline.ts imports crossVerifyCitations from cross-verify", async () => {
    const source = await Bun.file("./server/src/core/minions/handlers/legal-pipeline.ts").text();
    expect(source).toContain("crossVerifyCitations");
    expect(source).toContain("cross-verify");
  });

  it("legal-pipeline.ts imports buildRegenerationPrompt and buildCrossVerifyRegenerationPrompt", async () => {
    const source = await Bun.file("./server/src/core/minions/handlers/legal-pipeline.ts").text();
    expect(source).toContain("buildRegenerationPrompt");
    expect(source).toContain("buildCrossVerifyRegenerationPrompt");
  });

  it("legal-pipeline.ts has runCitationGuardrailForLayer function", async () => {
    const source = await Bun.file("./server/src/core/minions/handlers/legal-pipeline.ts").text();
    expect(source).toContain("function runCitationGuardrailForLayer");
  });

  it("legal-pipeline.ts has crossCheckDeadlineStatutory function (AP-6)", async () => {
    const source = await Bun.file("./server/src/core/minions/handlers/legal-pipeline.ts").text();
    expect(source).toContain("function crossCheckDeadlineStatutory");
    expect(source).toContain("STATUTORY_LIMITATION_PERIODS");
  });

  it("legal-pipeline.ts has configurable ensemble critic models (AP-5)", async () => {
    const source = await Bun.file("./server/src/core/minions/handlers/legal-pipeline.ts").text();
    expect(source).toContain("SUBSUMIO_ENSEMBLE_CRITIC_MODELS");
    expect(source).toContain("resolveEnsembleCriticModels");
  });

  it("legal-pipeline.ts has hard-block config option (AP-8)", async () => {
    const source = await Bun.file("./server/src/core/minions/handlers/legal-pipeline.ts").text();
    expect(source).toContain("SUBSUMIO_GUARDRAIL_HARD_BLOCK");
    expect(source).toContain("enforceGuardrailHardBlock");
  });
});

// ── Registry vs Specialist-Defs Consistency ──────────────────────────────────

describe("Registry ↔ specialist-defs consistency", () => {
  it("every specialist referenced in LAYER_REGISTRY exists in EMBEDDED_SPECIALISTS", () => {
    const specialistNames = new Set(EMBEDDED_SPECIALISTS.map((s) => s.name));
    for (const layer of LAYER_REGISTRY) {
      if (!layer.specialist) continue; // skip non-specialist layers (doc-classifier, contradiction-probe)
      expect(
        specialistNames.has(layer.specialist),
        `Layer "${layer.id}" references specialist "${layer.specialist}" which does not exist in EMBEDDED_SPECIALISTS`
      ).toBe(true);
    }
  });

  it("every specialist prompt contains a HALLUCINATION-GATE", () => {
    for (const s of EMBEDDED_SPECIALISTS) {
      const hasGate =
        s.systemPrompt.includes("HALLUCINATION-GATE") || s.systemPrompt.includes("ERFINDE KEINE");
      expect(
        hasGate,
        `Specialist "${s.name}" is missing a HALLUCINATION-GATE in its system prompt`
      ).toBe(true);
    }
  });

  it("mandatory layers all have failurePolicy 'fail'", () => {
    const mandatoryIds = getMandatoryLayerIds();
    expect(mandatoryIds.length).toBeGreaterThanOrEqual(8);
    for (const layer of LAYER_REGISTRY) {
      if (layer.mandatory) {
        expect(
          layer.failurePolicy,
          `Mandatory layer "${layer.id}" has failurePolicy "${layer.failurePolicy}" — must be "fail"`
        ).toBe("fail");
      }
    }
  });

  it("validateNoHiddenContinue returns no violations", () => {
    const violations = validateNoHiddenContinue();
    expect(violations, violations.map((v) => v.issue).join("; ")).toEqual([]);
  });

  it("exactly 3 deep-tier specialists in EMBEDDED_SPECIALISTS", () => {
    const deepSpecialists = EMBEDDED_SPECIALISTS.filter((s) => s.modelTier === "deep");
    expect(deepSpecialists.length).toBe(3);
    const names = deepSpecialists.map((s) => s.name);
    expect(names).toContain("legal-critic");
    expect(names).toContain("opponent-simulator");
    expect(names).toContain("subsumption-checker");
  });

  it("exactly 4 utility-tier specialists in EMBEDDED_SPECIALISTS", () => {
    const utilitySpecialists = EMBEDDED_SPECIALISTS.filter((s) => s.modelTier === "utility");
    expect(utilitySpecialists.length).toBe(4);
    const names = utilitySpecialists.map((s) => s.name);
    expect(names).toContain("legal-deadline-extractor");
    expect(names).toContain("on-scanner");
    expect(names).toContain("entity-extractor");
    expect(names).toContain("law-matcher");
  });

  it("all remaining specialists are reasoning-tier", () => {
    const reasoningCount = EMBEDDED_SPECIALISTS.filter((s) => s.modelTier === "reasoning").length;
    const total = EMBEDDED_SPECIALISTS.length;
    expect(reasoningCount).toBe(total - 3 - 4);
  });

  it("LAYER_REGISTRY has at least 27 layers", () => {
    expect(LAYER_REGISTRY.length).toBeGreaterThanOrEqual(27);
  });
});

// ── Workflow & Cross-Cutting Validation ──────────────────────────────────────

describe("Workflow definitions validation", () => {
  it("all workflow definitions reference valid layer IDs", () => {
    const issues = validateAllWorkflowDefs();
    expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
  });

  it("all 4 workflow IDs are defined", () => {
    const ids = listWorkflowIds();
    expect(ids).toContain("memo");
    expect(ids).toContain("fristen_report");
    expect(ids).toContain("schriftsatz");
    expect(ids).toContain("full_pipeline");
    expect(ids.length).toBe(4);
  });

  it("full_pipeline includes all LAYER_REGISTRY layers", () => {
    const fullLayers = WORKFLOW_DEFS.full_pipeline.layers;
    expect(fullLayers.length).toBe(LAYER_REGISTRY.length);
    for (const layer of LAYER_REGISTRY) {
      expect(fullLayers).toContain(layer.id);
    }
  });

  it("approval gates are subset of layers in each workflow", () => {
    for (const id of listWorkflowIds()) {
      const def = WORKFLOW_DEFS[id];
      for (const gate of def.approvalGates) {
        expect(
          def.layers.includes(gate),
          `Workflow "${id}" has approval gate "${gate}" not in its layers list`
        ).toBe(true);
      }
    }
  });
});

describe("Cross-cutting specialist validation", () => {
  it("no specialist uses subagent tier", () => {
    const subagents = EMBEDDED_SPECIALISTS.filter((s) => s.modelTier === "subagent");
    expect(subagents, subagents.map((s) => s.name).join(", ")).toEqual([]);
  });

  it("drafting specialists have put_page tool", () => {
    const drafters = EMBEDDED_SPECIALISTS.filter(
      (s) => s.name === "legal-drafter" || s.name === "legal-deadline-extractor"
    );
    for (const d of drafters) {
      expect(
        d.allowedTools.includes("put_page"),
        `Drafting specialist "${d.name}" lacks put_page tool`
      ).toBe(true);
    }
  });

  it("interactive copilot specialists have traverse_graph", () => {
    const copilotSpecialists = [
      "legal-researcher",
      "legal-analyst",
      "legal-strategist",
      "legal-critic",
    ];
    for (const name of copilotSpecialists) {
      const s = EMBEDDED_SPECIALISTS.find((e) => e.name === name);
      expect(s, `Specialist "${name}" not found`).toBeDefined();
      expect(
        s!.allowedTools.includes("traverse_graph"),
        `Copilot specialist "${name}" lacks traverse_graph tool`
      ).toBe(true);
    }
  });

  it("every specialist has non-empty allowedTools array", () => {
    for (const s of EMBEDDED_SPECIALISTS) {
      expect(
        s.allowedTools.length,
        `Specialist "${s.name}" has empty allowedTools`
      ).toBeGreaterThan(0);
    }
  });

  it("every specialist has maxTurns >= 5", () => {
    for (const s of EMBEDDED_SPECIALISTS) {
      expect(
        s.maxTurns,
        `Specialist "${s.name}" has maxTurns ${s.maxTurns} — must be >= 5`
      ).toBeGreaterThanOrEqual(5);
    }
  });
});
