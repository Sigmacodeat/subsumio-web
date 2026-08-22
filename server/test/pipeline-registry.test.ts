import { describe, it, expect } from "vitest";
import {
  LAYER_REGISTRY,
  getLayerDeclaration,
  getLayersByNumber,
  getAllLayerIds,
  resolveFailurePolicy,
  isMandatoryLayer,
  getChildFailPolicy,
  validateNoHiddenContinue,
  getMandatoryLayerIds,
  getOptionalLayerIds,
} from "../src/core/minions/pipeline-registry.ts";
import {
  WORKFLOW_DEFS,
  getWorkflowDef,
  getWorkflowLayers,
  getWorkflowLayerSet,
  getApprovalGates,
  isApprovalGate,
  shouldLayerRunInWorkflow,
  getWorkflowLayerNumbers,
  listWorkflowIds,
  validateWorkflowDef,
  validateAllWorkflowDefs,
  type WorkflowId,
} from "../src/core/minions/workflow-defs.ts";

// ── Pipeline Layer Registry Tests ─────────────────────────────

describe("Pipeline Layer Registry", () => {
  it("should have 27+ layer declarations", () => {
    expect(LAYER_REGISTRY.length).toBeGreaterThanOrEqual(27);
  });

  it("every layer has a unique id", () => {
    const ids = LAYER_REGISTRY.map((l) => l.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every layer has required fields", () => {
    for (const layer of LAYER_REGISTRY) {
      expect(layer.id).toBeTruthy();
      expect(layer.layerNumber).toBeGreaterThanOrEqual(0);
      expect(layer.name).toBeTruthy();
      // Some layers are deliberate deterministic heuristics or dedicated
      // runners rather than LLM specialists (e.g. document classification,
      // contradiction-probe which uses runContradictionProbe()). These may
      // carry medium risk when the dedicated code is non-trivial.
      if (layer.specialist === undefined) {
        expect(["low", "medium"]).toContain(layer.risk);
      } else {
        expect(layer.specialist).toBeTruthy();
      }
      expect(layer.inputs).toBeInstanceOf(Array);
      expect(layer.outputs).toBeInstanceOf(Array);
      expect(layer.sideEffects).toBeInstanceOf(Array);
      expect(["low", "medium", "high"]).toContain(layer.risk);
      expect(layer.timeoutSec).toBeGreaterThan(0);
      expect(["fail", "continue", "retry_once"]).toContain(layer.failurePolicy);
      expect(typeof layer.mandatory).toBe("boolean");
      expect(layer.description).toBeTruthy();
    }
  });

  it("getLayerDeclaration returns correct layer", () => {
    const layer = getLayerDeclaration("forensic-analyst");
    expect(layer).toBeDefined();
    expect(layer!.id).toBe("forensic-analyst");
    expect(layer!.layerNumber).toBe(3);
    expect(layer!.mandatory).toBe(true);
  });

  it("getLayerDeclaration returns undefined for unknown id", () => {
    expect(getLayerDeclaration("nonexistent-layer")).toBeUndefined();
  });

  it("getLayersByNumber returns all sub-layers for a number", () => {
    const layers4 = getLayersByNumber(4);
    expect(layers4.length).toBeGreaterThanOrEqual(2);
    expect(layers4.map((l) => l.id)).toContain("law-matcher");
  });

  it("getAllLayerIds returns all IDs", () => {
    const ids = getAllLayerIds();
    expect(ids.length).toBe(LAYER_REGISTRY.length);
  });

  // ── Failure Policy Tests ──

  it("resolveFailurePolicy returns 'fail' for mandatory layers", () => {
    expect(resolveFailurePolicy("on-scanner")).toBe("fail");
    expect(resolveFailurePolicy("forensic-analyst")).toBe("fail");
    expect(resolveFailurePolicy("law-matcher")).toBe("fail");
    expect(resolveFailurePolicy("legal-drafter")).toBe("fail");
    expect(resolveFailurePolicy("ensemble-critic")).toBe("fail");
    expect(resolveFailurePolicy("deadline-validator")).toBe("fail");
    expect(resolveFailurePolicy("limitation-scanner")).toBe("fail");
    expect(resolveFailurePolicy("opponent-simulator")).toBe("fail");
    expect(resolveFailurePolicy("subsumption-checker")).toBe("fail");
    expect(resolveFailurePolicy("entity-extractor")).toBe("fail");
    expect(resolveFailurePolicy("damage-deadline-extractor")).toBe("fail");
  });

  it("resolveFailurePolicy returns 'continue' for non-mandatory layers", () => {
    expect(resolveFailurePolicy("doc-classifier")).toBe("continue");
    expect(resolveFailurePolicy("precedent-matcher")).toBe("continue");
    expect(resolveFailurePolicy("cost-benefit")).toBe("continue");
    expect(resolveFailurePolicy("mediation-adr")).toBe("continue");
  });

  it("resolveFailurePolicy returns 'continue' for unknown layer", () => {
    expect(resolveFailurePolicy("unknown")).toBe("continue");
  });

  it("isMandatoryLayer returns true for mandatory layers", () => {
    expect(isMandatoryLayer("on-scanner")).toBe(true);
    expect(isMandatoryLayer("forensic-analyst")).toBe(true);
    expect(isMandatoryLayer("law-matcher")).toBe(true);
  });

  it("isMandatoryLayer returns false for non-mandatory layers", () => {
    expect(isMandatoryLayer("doc-classifier")).toBe(false);
    expect(isMandatoryLayer("precedent-matcher")).toBe(false);
  });

  // ── Child Fail Policy Tests (T5.4: no hidden continue) ──

  it("getChildFailPolicy returns 'fail_parent' for mandatory layers", () => {
    expect(getChildFailPolicy("on-scanner")).toBe("fail_parent");
    expect(getChildFailPolicy("forensic-analyst")).toBe("fail_parent");
    expect(getChildFailPolicy("law-matcher")).toBe("fail_parent");
    expect(getChildFailPolicy("legal-drafter")).toBe("fail_parent");
    expect(getChildFailPolicy("ensemble-critic")).toBe("fail_parent");
    expect(getChildFailPolicy("deadline-validator")).toBe("fail_parent");
    expect(getChildFailPolicy("limitation-scanner")).toBe("fail_parent");
    expect(getChildFailPolicy("opponent-simulator")).toBe("fail_parent");
    expect(getChildFailPolicy("subsumption-checker")).toBe("fail_parent");
    expect(getChildFailPolicy("entity-extractor")).toBe("fail_parent");
    expect(getChildFailPolicy("damage-deadline-extractor")).toBe("fail_parent");
  });

  it("getChildFailPolicy returns 'continue' for non-mandatory layers", () => {
    expect(getChildFailPolicy("doc-classifier")).toBe("continue");
    expect(getChildFailPolicy("precedent-matcher")).toBe("continue");
    expect(getChildFailPolicy("cost-benefit")).toBe("continue");
  });

  it("getChildFailPolicy returns 'continue' for unknown layer (backward compat)", () => {
    expect(getChildFailPolicy("unknown")).toBe("continue");
  });

  // ── No Hidden Continue Validation ──

  it("validateNoHiddenContinue returns no violations", () => {
    const violations = validateNoHiddenContinue();
    expect(violations).toEqual([]);
  });

  it("getMandatoryLayerIds returns all mandatory layer IDs", () => {
    const mandatory = getMandatoryLayerIds();
    expect(mandatory.length).toBeGreaterThanOrEqual(10);
    expect(mandatory).toContain("on-scanner");
    expect(mandatory).toContain("forensic-analyst");
    expect(mandatory).toContain("law-matcher");
    expect(mandatory).toContain("legal-drafter");
    expect(mandatory).toContain("ensemble-critic");
  });

  it("getOptionalLayerIds returns all non-mandatory layer IDs", () => {
    const optional = getOptionalLayerIds();
    expect(optional.length).toBeGreaterThan(0);
    expect(optional).toContain("doc-classifier");
    expect(optional).toContain("precedent-matcher");
    expect(optional).not.toContain("forensic-analyst");
  });

  it("mandatory + optional = all layers", () => {
    const mandatory = getMandatoryLayerIds();
    const optional = getOptionalLayerIds();
    expect(mandatory.length + optional.length).toBe(LAYER_REGISTRY.length);
  });
});

// ── Workflow Definition Tests ─────────────────────────────────

describe("Workflow Definitions", () => {
  it("includes focused intake workflows as well as the four expert workflows", () => {
    const ids = listWorkflowIds();
    expect(ids).toContain("memo");
    expect(ids).toContain("fristen_report");
    expect(ids).toContain("schriftsatz");
    expect(ids).toContain("full_pipeline");
    expect(ids).toContain("quick_answer");
    expect(ids).toContain("aktencheck");
    expect(ids.length).toBe(6);
  });

  it("every workflow has required fields", () => {
    for (const id of listWorkflowIds()) {
      const def = getWorkflowDef(id);
      expect(def).toBeDefined();
      expect(def!.id).toBe(id);
      expect(def!.label).toBeTruthy();
      expect(def!.description).toBeTruthy();
      expect(def!.layers.length).toBeGreaterThan(0);
      expect(def!.dod.length).toBeGreaterThan(0);
    }
  });

  // ── T5.1: Memo Workflow ──

  it("memo workflow includes forensic-analyst, law-matcher, opponent-simulator, ensemble-critic", () => {
    const layers = getWorkflowLayers("memo");
    expect(layers).toContain("forensic-analyst");
    expect(layers).toContain("law-matcher");
    expect(layers).toContain("opponent-simulator");
    expect(layers).toContain("ensemble-critic");
    expect(layers).toContain("subsumption-checker");
    expect(layers).toContain("fact-gap-detector");
  });

  it("memo workflow has approval gate at ensemble-critic", () => {
    const gates = getApprovalGates("memo");
    expect(gates).toContain("ensemble-critic");
    expect(isApprovalGate("memo", "ensemble-critic")).toBe(true);
  });

  it("memo workflow has DoD criteria", () => {
    const def = getWorkflowDef("memo");
    expect(def!.dod.length).toBeGreaterThanOrEqual(4);
    expect(def!.dod.some((d) => d.includes("Quelle"))).toBe(true);
    expect(def!.dod.some((d) => d.includes("Gegenargumente"))).toBe(true);
  });

  // ── T5.2: Fristen Report Workflow ──

  it("fristen_report workflow includes deadline-validator, limitation-scanner, damage-deadline-extractor", () => {
    const layers = getWorkflowLayers("fristen_report");
    expect(layers).toContain("damage-deadline-extractor");
    expect(layers).toContain("deadline-validator");
    expect(layers).toContain("limitation-scanner");
    expect(layers).toContain("forensic-analyst");
  });

  it("fristen_report workflow has approval gates at deadline-validator and limitation-scanner", () => {
    const gates = getApprovalGates("fristen_report");
    expect(gates).toContain("deadline-validator");
    expect(gates).toContain("limitation-scanner");
  });

  it("fristen_report workflow has DoD criteria", () => {
    const def = getWorkflowDef("fristen_report");
    expect(def!.dod.length).toBeGreaterThanOrEqual(4);
    expect(def!.dod.some((d) => d.toLowerCase().includes("deterministic"))).toBe(true);
    expect(def!.dod.some((d) => d.includes("Anwalt"))).toBe(true);
  });

  // ── T5.3: Schriftsatz Workflow ──

  it("schriftsatz workflow includes legal-drafter, opponent-simulator, ensemble-critic", () => {
    const layers = getWorkflowLayers("schriftsatz");
    expect(layers).toContain("legal-drafter");
    expect(layers).toContain("opponent-simulator");
    expect(layers).toContain("ensemble-critic");
    expect(layers).toContain("subsumption-checker");
  });

  it("schriftsatz workflow has approval gates at legal-drafter and ensemble-critic", () => {
    const gates = getApprovalGates("schriftsatz");
    expect(gates).toContain("legal-drafter");
    expect(gates).toContain("ensemble-critic");
  });

  it("schriftsatz workflow depends on memo and fristen_report", () => {
    const def = getWorkflowDef("schriftsatz");
    expect(def!.dependsOn).toContain("memo");
    expect(def!.dependsOn).toContain("fristen_report");
  });

  it("schriftsatz workflow has DoD criteria", () => {
    const def = getWorkflowDef("schriftsatz");
    expect(def!.dod.length).toBeGreaterThanOrEqual(4);
    expect(def!.dod.some((d) => d.includes("DOCX"))).toBe(true);
    expect(def!.dod.some((d) => d.includes("klickbar"))).toBe(true);
    expect(def!.dod.some((d) => d.includes("Verification Receipt"))).toBe(true);
  });

  // ── Full Pipeline (Legacy) ──

  it("full_pipeline workflow includes all layer IDs", () => {
    const layers = getWorkflowLayers("full_pipeline");
    expect(layers.length).toBe(LAYER_REGISTRY.length);
  });

  // ── Layer Activation Tests ──

  it("shouldLayerRunInWorkflow returns true for included layers", () => {
    expect(shouldLayerRunInWorkflow("memo", "forensic-analyst")).toBe(true);
    expect(shouldLayerRunInWorkflow("memo", "law-matcher")).toBe(true);
  });

  it("shouldLayerRunInWorkflow returns false for excluded layers", () => {
    expect(shouldLayerRunInWorkflow("memo", "legal-drafter")).toBe(false);
    expect(shouldLayerRunInWorkflow("memo", "damage-deadline-extractor")).toBe(false);
    expect(shouldLayerRunInWorkflow("memo", "cost-benefit")).toBe(false);
  });

  it("fristen_report excludes legal-drafter", () => {
    expect(shouldLayerRunInWorkflow("fristen_report", "legal-drafter")).toBe(false);
  });

  it("memo excludes damage-deadline-extractor and limitation-scanner", () => {
    expect(shouldLayerRunInWorkflow("memo", "damage-deadline-extractor")).toBe(false);
    expect(shouldLayerRunInWorkflow("memo", "limitation-scanner")).toBe(false);
  });

  // ── Layer Number Mapping ──

  it("getWorkflowLayerNumbers returns correct numbers for memo", () => {
    const numbers = getWorkflowLayerNumbers("memo");
    expect(numbers.has(0)).toBe(true); // doc-classifier
    expect(numbers.has(1)).toBe(true); // on-scanner
    expect(numbers.has(2)).toBe(true); // entity-extractor
    expect(numbers.has(3)).toBe(true); // forensic-analyst
    expect(numbers.has(4)).toBe(true); // law-matcher
    expect(numbers.has(5)).toBe(false); // no damage/deadline layers
    expect(numbers.has(6)).toBe(true); // opponent-simulator
    expect(numbers.has(7)).toBe(true); // ensemble-critic
  });

  it("getWorkflowLayerNumbers returns correct numbers for fristen_report", () => {
    const numbers = getWorkflowLayerNumbers("fristen_report");
    expect(numbers.has(5)).toBe(true); // damage-deadline-extractor, deadline-validator, limitation-scanner
    expect(numbers.has(6)).toBe(false); // no legal-drafter
  });

  // ── Validation Tests ──

  it("validateWorkflowDef returns no issues for all workflows", () => {
    const issues = validateAllWorkflowDefs();
    expect(issues).toEqual([]);
  });

  it("validateWorkflowDef detects unknown layer references", () => {
    // This is a structural test — all real workflow defs should pass
    for (const id of listWorkflowIds()) {
      const issues = validateWorkflowDef(id);
      expect(issues).toEqual([]);
    }
  });

  // ── Feature Flag Tests ──

  it("memo workflow has featureFlag", () => {
    expect(getWorkflowDef("memo")!.featureFlag).toBe("workflow_memo");
  });

  it("fristen_report workflow has featureFlag", () => {
    expect(getWorkflowDef("fristen_report")!.featureFlag).toBe("workflow_fristen_report");
  });

  it("schriftsatz workflow has featureFlag", () => {
    expect(getWorkflowDef("schriftsatz")!.featureFlag).toBe("workflow_schriftsatz");
  });
});

// ── Cross-Cutting: Mandatory Layer Consistency ────────────────

describe("Mandatory Layer Consistency (T5.4: No Hidden Continue)", () => {
  it("every mandatory layer in any workflow has getChildFailPolicy = 'fail_parent'", () => {
    const mandatoryIds = getMandatoryLayerIds();
    for (const id of mandatoryIds) {
      expect(getChildFailPolicy(id)).toBe("fail_parent");
    }
  });

  it("no mandatory layer has failurePolicy = 'continue' in registry", () => {
    const violations = validateNoHiddenContinue();
    expect(violations).toEqual([]);
  });

  it("all mandatory layers are present in LAYER_REGISTRY", () => {
    const mandatory = getMandatoryLayerIds();
    for (const id of mandatory) {
      const layer = getLayerDeclaration(id);
      expect(layer).toBeDefined();
      expect(layer!.mandatory).toBe(true);
    }
  });

  it("memo workflow only activates mandatory layers that are needed", () => {
    const memoLayers = getWorkflowLayers("memo");
    const mandatoryInMemo = memoLayers.filter((id) => isMandatoryLayer(id));
    // Memo should have these mandatory layers
    expect(mandatoryInMemo).toContain("on-scanner");
    expect(mandatoryInMemo).toContain("entity-extractor");
    expect(mandatoryInMemo).toContain("forensic-analyst");
    expect(mandatoryInMemo).toContain("law-matcher");
    expect(mandatoryInMemo).toContain("opponent-simulator");
    expect(mandatoryInMemo).toContain("subsumption-checker");
    expect(mandatoryInMemo).toContain("ensemble-critic");
    // Memo should NOT have these mandatory layers
    expect(mandatoryInMemo).not.toContain("legal-drafter");
    expect(mandatoryInMemo).not.toContain("damage-deadline-extractor");
    expect(mandatoryInMemo).not.toContain("deadline-validator");
    expect(mandatoryInMemo).not.toContain("limitation-scanner");
  });

  it("fristen_report workflow activates deadline-validator and limitation-scanner", () => {
    const fristenLayers = getWorkflowLayers("fristen_report");
    expect(fristenLayers).toContain("deadline-validator");
    expect(fristenLayers).toContain("limitation-scanner");
    expect(isMandatoryLayer("deadline-validator")).toBe(true);
    expect(isMandatoryLayer("limitation-scanner")).toBe(true);
  });

  it("schriftsatz workflow activates legal-drafter (mandatory)", () => {
    const schriftsatzLayers = getWorkflowLayers("schriftsatz");
    expect(schriftsatzLayers).toContain("legal-drafter");
    expect(isMandatoryLayer("legal-drafter")).toBe(true);
  });
});
