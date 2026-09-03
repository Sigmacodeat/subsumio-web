/**
 * EPIC 3 — Legal Data Factory Tests
 * Covers: source-lifecycle, license-registry, connector-reliability, dependency-graph, legal-source-coverage
 */

import { describe, it, expect } from "vitest";
import {
  isTransitionAllowed,
  isHumanApprovalRequired,
  evaluateTransition,
  getTransitionChecks,
  validateSourceRecord,
  stateProgress,
  STATE_ORDER,
  ALLOWED_TRANSITIONS,
  LIVE_STATES,
  MIN_EARLY_ACCESS_HOURS,
  type LifecycleState,
  type SourceRecord,
} from "../src/core/legal/source-lifecycle.js";

import {
  KNOWN_LICENSE_TERMS,
  validateLicenseReview,
  hashLicenseTerms,
  type LicenseReviewInput,
} from "../src/core/legal/license-registry.js";

import {
  logConnectorError,
  type QuarantineReason,
} from "../src/core/legal/connector-reliability.js";

import { computeClaimHash, type ReverifyStatus } from "../src/core/legal/dependency-graph.js";

import {
  LEGAL_SOURCE_COVERAGE_MATRIX,
  buildCoverageMatrix,
  getEntriesByJurisdiction,
  getAvailableEntries,
  getGapEntries,
  isCovered,
  getCoveragePercentage,
  LEGAL_AREA_LABELS_DE,
  SOURCE_TYPE_LABELS_DE,
} from "../../src/lib/legal-source-coverage.js";

// ── Source Lifecycle Tests ────────────────────────────────────────────

describe("Source Lifecycle", () => {
  const baseSource: SourceRecord = {
    id: "law-de",
    name: "Test",
    jurisdiction: "DE",
    source_type: "primary_legislation",
    lifecycle_state: "discovered",
    config: {},
    discovered_at: new Date().toISOString(),
    approved_by: null,
    approved_at: null,
    retired_at: null,
    retired_reason: null,
    metadata: {},
    rights_cleared_at: null,
    parser_ready_at: null,
    eval_passed_at: null,
    early_access_at: null,
    ga_at: null,
    degraded_at: null,
  };

  it("allows forward transitions", () => {
    expect(isTransitionAllowed("discovered", "rights_pending")).toBe(true);
    expect(isTransitionAllowed("rights_pending", "parser_pending")).toBe(true);
    expect(isTransitionAllowed("parser_pending", "eval_pending")).toBe(true);
    expect(isTransitionAllowed("eval_pending", "early_access")).toBe(true);
    expect(isTransitionAllowed("early_access", "general_availability")).toBe(true);
  });

  it("disallows backward transitions (except degraded→GA)", () => {
    expect(isTransitionAllowed("general_availability", "early_access")).toBe(false);
    expect(isTransitionAllowed("early_access", "eval_pending")).toBe(false);
    expect(isTransitionAllowed("discovered", "general_availability")).toBe(false);
  });

  it("allows degradation from any live state", () => {
    expect(isTransitionAllowed("parser_pending", "degraded")).toBe(true);
    expect(isTransitionAllowed("early_access", "degraded")).toBe(true);
    expect(isTransitionAllowed("general_availability", "degraded")).toBe(true);
  });

  it("allows retirement from any non-retired state", () => {
    expect(isTransitionAllowed("discovered", "retired")).toBe(true);
    expect(isTransitionAllowed("general_availability", "retired")).toBe(true);
    expect(isTransitionAllowed("degraded", "retired")).toBe(true);
  });

  it("disallows transitions from retired", () => {
    expect(ALLOWED_TRANSITIONS.retired).toEqual([]);
  });

  it("requires human approval for rights→parser transition", () => {
    expect(isHumanApprovalRequired("rights_pending", "parser_pending")).toBe(true);
  });

  it("requires human approval for early_access→GA transition", () => {
    expect(isHumanApprovalRequired("early_access", "general_availability")).toBe(true);
  });

  it("does not require human approval for degradation", () => {
    expect(isHumanApprovalRequired("general_availability", "degraded")).toBe(false);
  });

  it("blocks rights→parser without license approval", () => {
    const result = evaluateTransition("rights_pending", "parser_pending", baseSource, {
      licenseApproved: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.checks.some((c) => !c.passed && c.severity === "critical")).toBe(true);
  });

  it("allows rights→parser with license approval", () => {
    const result = evaluateTransition("rights_pending", "parser_pending", baseSource, {
      licenseApproved: true,
    });
    expect(result.allowed).toBe(true);
    expect(result.humanApprovalRequired).toBe(true);
  });

  it("blocks eval→early_access without eval pass", () => {
    const result = evaluateTransition("eval_pending", "early_access", baseSource, {
      evalPassed: false,
    });
    expect(result.allowed).toBe(false);
  });

  it("allows eval→early_access with eval pass", () => {
    const result = evaluateTransition("eval_pending", "early_access", baseSource, {
      evalPassed: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("warns on early_access→GA with insufficient time", () => {
    const result = evaluateTransition("early_access", "general_availability", baseSource, {
      earlyAccessHours: 2,
    });
    expect(result.allowed).toBe(true); // warning, not critical
    expect(result.checks.some((c) => c.severity === "warning")).toBe(true);
  });

  it("passes early_access→GA with sufficient time", () => {
    const result = evaluateTransition("early_access", "general_availability", baseSource, {
      earlyAccessHours: MIN_EARLY_ACCESS_HOURS + 1,
    });
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("blocks transition from retired source", () => {
    const retiredSource = { ...baseSource, lifecycle_state: "retired" as LifecycleState };
    const result = evaluateTransition("retired", "discovered", retiredSource);
    expect(result.allowed).toBe(false);
  });

  it("validates source records", () => {
    const errors = validateSourceRecord({
      id: "",
      name: "Test",
      jurisdiction: "DE",
      source_type: "primary_legislation",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("validates invalid jurisdiction", () => {
    const errors = validateSourceRecord({
      id: "test",
      name: "Test",
      jurisdiction: "XX" as never,
      source_type: "primary_legislation",
    });
    expect(errors.some((e) => e.includes("jurisdiction"))).toBe(true);
  });

  it("validates invalid source type", () => {
    const errors = validateSourceRecord({
      id: "test",
      name: "Test",
      jurisdiction: "DE",
      source_type: "invalid" as never,
    });
    expect(errors.some((e) => e.includes("source_type"))).toBe(true);
  });

  it("LIVE_STATES includes early_access and general_availability", () => {
    expect(LIVE_STATES).toContain("early_access");
    expect(LIVE_STATES).toContain("general_availability");
    expect(LIVE_STATES).not.toContain("discovered");
  });

  it("STATE_ORDER has 8 states", () => {
    expect(STATE_ORDER.length).toBe(8);
  });

  it("stateProgress returns 0 for discovered", () => {
    expect(stateProgress("discovered")).toBe(0);
  });

  it("stateProgress returns 100 for general_availability", () => {
    expect(stateProgress("general_availability")).toBe(100);
  });

  it("stateProgress returns 50 for degraded", () => {
    expect(stateProgress("degraded")).toBe(50);
  });
});

// ── License Registry Tests ────────────────────────────────────────────

describe("License Registry", () => {
  it("has documented terms for all known sources", () => {
    expect(KNOWN_LICENSE_TERMS.length).toBeGreaterThanOrEqual(7);
    for (const terms of KNOWN_LICENSE_TERMS) {
      expect(terms.source_id).toBeTruthy();
      expect(terms.official_url).toBeTruthy();
      expect(terms.terms_url).toBeTruthy();
    }
  });

  it("marks DE gesetze-im-internet as public", () => {
    const de = KNOWN_LICENSE_TERMS.find((t) => t.source_id === "law-de");
    expect(de).toBeDefined();
    expect(de!.license_type).toBe("public");
    expect(de!.scraping_allowed).toBe(true);
  });

  it("marks AT RIS as open", () => {
    const at = KNOWN_LICENSE_TERMS.find((t) => t.source_id === "law-at");
    expect(at).toBeDefined();
    expect(at!.license_type).toBe("open");
    expect(at!.api_usage_allowed).toBe(true);
  });

  it("marks CH Fedlex as open (CC0)", () => {
    const ch = KNOWN_LICENSE_TERMS.find((t) => t.source_id === "law-ch");
    expect(ch).toBeDefined();
    expect(ch!.license_type).toBe("open");
    expect(ch!.attribution_required).toBe(false);
  });

  it("validates license review input", () => {
    const input: LicenseReviewInput = {
      source_id: "law-de",
      reviewer_id: "user1",
      license_type: "public",
      approved: true,
    };
    expect(validateLicenseReview(input)).toHaveLength(0);
  });

  it("rejects pending license with approved=true", () => {
    const errors = validateLicenseReview({
      source_id: "test",
      reviewer_id: "user1",
      license_type: "pending",
      approved: true,
    });
    expect(errors.some((e) => e.includes("pending"))).toBe(true);
  });

  it("requires notes for restricted license", () => {
    const errors = validateLicenseReview({
      source_id: "test",
      reviewer_id: "user1",
      license_type: "restricted",
    });
    expect(errors.some((e) => e.includes("restricted"))).toBe(true);
  });

  it("rejects empty source_id", () => {
    const errors = validateLicenseReview({
      source_id: "",
      reviewer_id: "user1",
      license_type: "public",
    });
    expect(errors.some((e) => e.includes("source_id"))).toBe(true);
  });

  it("hashLicenseTerms produces deterministic 64-char hash", () => {
    const terms = KNOWN_LICENSE_TERMS[0]!;
    const h1 = hashLicenseTerms(terms);
    const h2 = hashLicenseTerms(terms);
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
  });
});

// ── Connector Reliability Tests ───────────────────────────────────────

describe("Connector Reliability", () => {
  it("logConnectorError produces structured log", () => {
    const log = logConnectorError("law-de", "item-123", "parse_error", "XML parsing failed");
    expect(log.source_id).toBe("law-de");
    expect(log.item_id).toBe("item-123");
    expect(log.reason).toBe("parse_error");
    expect(log.timestamp).toBeTruthy();
    expect(log.resolved).toBe(false);
  });

  it("logConnectorError with resolved=true", () => {
    const log = logConnectorError("law-de", "item-123", "rate_limited", "429", { resolved: true });
    expect(log.resolved).toBe(true);
  });

  it("logConnectorError with quarantined=true", () => {
    const log = logConnectorError("law-de", "item-123", "schema_drift", "structure changed", {
      quarantined: true,
    });
    expect(log.quarantined).toBe(true);
  });
});

// ── Dependency Graph Tests ────────────────────────────────────────────

describe("Dependency Graph", () => {
  it("computeClaimHash produces deterministic 64-char hash", () => {
    const h1 = computeClaimHash("§ 823 BGB schadensersatzpflicht");
    const h2 = computeClaimHash("§ 823 BGB schadensersatzpflicht");
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
  });

  it("computeClaimHash differs for different claims", () => {
    const h1 = computeClaimHash("claim A");
    const h2 = computeClaimHash("claim B");
    expect(h1).not.toBe(h2);
  });
});

// ── Legal Source Coverage Matrix Tests ───────────────────────────────

describe("Legal Source Coverage Matrix", () => {
  it("has entries for all 4 jurisdictions", () => {
    expect(getEntriesByJurisdiction("DE").length).toBeGreaterThan(0);
    expect(getEntriesByJurisdiction("AT").length).toBeGreaterThan(0);
    expect(getEntriesByJurisdiction("CH").length).toBeGreaterThan(0);
    expect(getEntriesByJurisdiction("EU").length).toBeGreaterThan(0);
  });

  it("has 8 source types per jurisdiction (except EU)", () => {
    const deTypes = new Set(getEntriesByJurisdiction("DE").map((e) => e.source_type));
    expect(deTypes.size).toBe(8);
    const atTypes = new Set(getEntriesByJurisdiction("AT").map((e) => e.source_type));
    expect(atTypes.size).toBe(8);
  });

  it("has available entries", () => {
    expect(getAvailableEntries().length).toBeGreaterThan(0);
  });

  it("has gap entries", () => {
    expect(getGapEntries().length).toBeGreaterThan(0);
  });

  it("buildCoverageMatrix returns summaries", () => {
    const matrix = buildCoverageMatrix();
    expect(matrix.by_jurisdiction.DE).toBeDefined();
    expect(matrix.by_jurisdiction.DE.total_sources).toBeGreaterThan(0);
    expect(matrix.gaps.length).toBeGreaterThan(0);
  });

  it("DE has primary_legislation available", () => {
    expect(isCovered("DE", "primary_legislation", "civil_law")).toBe(true);
  });

  it("AT has primary_legislation available", () => {
    expect(isCovered("AT", "primary_legislation", "civil_law")).toBe(true);
  });

  it("CH has primary_legislation available", () => {
    expect(isCovered("CH", "primary_legislation", "civil_law")).toBe(true);
  });

  it("DE does not have case_law_instance available (gap)", () => {
    expect(isCovered("DE", "case_law_instance", "civil_law")).toBe(false);
  });

  it("getCoveragePercentage returns number 0-100", () => {
    const pct = getCoveragePercentage("DE");
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it("has labels for all legal areas", () => {
    expect(Object.keys(LEGAL_AREA_LABELS_DE).length).toBe(13);
  });

  it("has labels for all source types", () => {
    expect(Object.keys(SOURCE_TYPE_LABELS_DE).length).toBe(8);
  });

  it("EU has eu_law covered", () => {
    expect(isCovered("EU", "primary_legislation", "eu_law")).toBe(true);
  });
});
