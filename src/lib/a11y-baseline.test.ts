import { describe, it, expect } from "vitest";
import {
  PUBLIC_PAGES,
  DASHBOARD_PAGES,
  ALL_AUDIT_PAGES,
  DEFAULT_WCAG_TAGS,
  WCAG_22_TAGS,
  BLOCKING_IMPACTS,
  ALL_IMPACTS,
  IMPACT_SEVERITY,
  KNOWN_ISSUES,
  AUDIT_RULES,
  buildBaselineReport,
  isKnownIssue,
  filterBlockingViolations,
  filterByImpact,
  sortByImpact,
  getAuditPagesByCategory,
  getEnabledRules,
  getRuleById,
  DEFAULT_CI_GATE_CONFIG,
  evaluateCIGate,
  type A11yViolation,
  type KnownIssue,
} from "@/lib/a11y-baseline";

function createViolation(overrides: Partial<A11yViolation> = {}): A11yViolation {
  return {
    id: "v1",
    rule_id: "color-contrast",
    impact: "serious",
    description: "Element has insufficient color contrast",
    help: "Elements must meet minimum color contrast ratio",
    helpUrl: "https://dequeuniversity.com/rules/axe/color-contrast",
    target: "button.btn-primary",
    html: '<button class="btn-primary">Click</button>',
    page: "/dashboard",
    tags: ["wcag2aa"],
    ...overrides,
  };
}

describe("A11y Baseline — Pages", () => {
  it("has public pages defined", () => {
    expect(PUBLIC_PAGES.length).toBeGreaterThan(0);
    expect(PUBLIC_PAGES.every((p) => p.category === "public" || p.category === "auth")).toBe(true);
  });

  it("has dashboard pages defined", () => {
    expect(DASHBOARD_PAGES.length).toBeGreaterThan(10);
    expect(DASHBOARD_PAGES.every((p) => p.category === "dashboard")).toBe(true);
  });

  it("all audit pages combined", () => {
    expect(ALL_AUDIT_PAGES.length).toBe(PUBLIC_PAGES.length + DASHBOARD_PAGES.length);
  });

  it("getAuditPagesByCategory filters correctly", () => {
    const publicPages = getAuditPagesByCategory("public");
    expect(publicPages.every((p) => p.category === "public")).toBe(true);
    const dashPages = getAuditPagesByCategory("dashboard");
    expect(dashPages.every((p) => p.category === "dashboard")).toBe(true);
  });

  it("dashboard pages require auth", () => {
    expect(DASHBOARD_PAGES.every((p) => p.requires_auth)).toBe(true);
  });

  it("public pages do not require auth", () => {
    expect(PUBLIC_PAGES.every((p) => !p.requires_auth)).toBe(true);
  });
});

describe("A11y Baseline — WCAG Tags", () => {
  it("default tags include wcag2a, wcag2aa, wcag21aa", () => {
    expect(DEFAULT_WCAG_TAGS).toContain("wcag2a");
    expect(DEFAULT_WCAG_TAGS).toContain("wcag2aa");
    expect(DEFAULT_WCAG_TAGS).toContain("wcag21aa");
  });

  it("WCAG 2.2 tags include wcag22aa", () => {
    expect(WCAG_22_TAGS).toContain("wcag22aa");
  });
});

describe("A11y Baseline — Impact Levels", () => {
  it("blocking impacts are critical and serious", () => {
    expect(BLOCKING_IMPACTS).toContain("critical");
    expect(BLOCKING_IMPACTS).toContain("serious");
    expect(BLOCKING_IMPACTS).not.toContain("moderate");
    expect(BLOCKING_IMPACTS).not.toContain("minor");
  });

  it("all impacts has 4 levels", () => {
    expect(ALL_IMPACTS).toHaveLength(4);
  });

  it("impact severity orders correctly", () => {
    expect(IMPACT_SEVERITY.critical).toBeLessThan(IMPACT_SEVERITY.serious);
    expect(IMPACT_SEVERITY.serious).toBeLessThan(IMPACT_SEVERITY.moderate);
    expect(IMPACT_SEVERITY.moderate).toBeLessThan(IMPACT_SEVERITY.minor);
  });
});

describe("A11y Baseline — Rules", () => {
  it("has audit rules defined", () => {
    expect(AUDIT_RULES.length).toBeGreaterThan(10);
  });

  it("all rules have required fields", () => {
    for (const rule of AUDIT_RULES) {
      expect(rule.id).toBeTruthy();
      expect(rule.tag).toBeTruthy();
      expect(rule.impact).toBeTruthy();
      expect(rule.description).toBeTruthy();
    }
  });

  it("getEnabledRules returns only enabled rules", () => {
    const enabled = getEnabledRules();
    expect(enabled.every((r) => r.enabled)).toBe(true);
  });

  it("getRuleById finds rule", () => {
    const rule = getRuleById("color-contrast");
    expect(rule).toBeDefined();
    expect(rule!.id).toBe("color-contrast");
  });

  it("getRuleById returns undefined for unknown", () => {
    expect(getRuleById("nonexistent")).toBeUndefined();
  });
});

describe("A11y Baseline — Report Builder", () => {
  it("builds report with no violations", () => {
    const report = buildBaselineReport([], ["/", "/dashboard"]);
    expect(report.total_violations).toBe(0);
    expect(report.passed).toBe(true);
    expect(report.total_pages_scanned).toBe(2);
  });

  it("builds report with violations", () => {
    const violations = [
      createViolation({ id: "v1", impact: "critical", page: "/dashboard", rule_id: "button-name" }),
      createViolation({ id: "v2", impact: "serious", page: "/dashboard", rule_id: "color-contrast" }),
      createViolation({ id: "v3", impact: "moderate", page: "/", rule_id: "heading-order" }),
    ];
    const report = buildBaselineReport(violations, ["/", "/dashboard"]);
    expect(report.total_violations).toBe(3);
    expect(report.by_impact.critical).toBe(1);
    expect(report.by_impact.serious).toBe(1);
    expect(report.by_impact.moderate).toBe(1);
    expect(report.by_page["/dashboard"]).toBe(2);
    expect(report.by_page["/"]).toBe(1);
    expect(report.by_rule["button-name"]).toBe(1);
    expect(report.by_rule["color-contrast"]).toBe(1);
  });

  it("report fails when blocking violations exist", () => {
    const violations = [
      createViolation({ id: "v1", impact: "critical" }),
    ];
    const report = buildBaselineReport(violations, ["/dashboard"]);
    expect(report.passed).toBe(false);
  });

  it("report passes with only moderate/minor violations", () => {
    const violations = [
      createViolation({ id: "v1", impact: "moderate" }),
      createViolation({ id: "v2", impact: "minor" }),
    ];
    const report = buildBaselineReport(violations, ["/dashboard"]);
    expect(report.passed).toBe(true);
  });

  it("report excludes known issues from new_violations", () => {
    const knownIssues: KnownIssue[] = [
      { id: "k1", page: "/dashboard", rule_id: "color-contrast", impact: "serious", reason: "Design system limitation", accepted_until: null },
    ];
    const violations = [
      createViolation({ id: "v1", impact: "serious", page: "/dashboard", rule_id: "color-contrast" }),
    ];
    const report = buildBaselineReport(violations, ["/dashboard"], knownIssues);
    expect(report.new_violations).toBe(0);
    expect(report.known_issues_count).toBe(1);
    expect(report.passed).toBe(true);
  });
});

describe("A11y Baseline — Helpers", () => {
  it("isKnownIssue detects known issues", () => {
    const knownIssues: KnownIssue[] = [
      { id: "k1", page: "/dashboard", rule_id: "color-contrast", impact: "serious", reason: "Test", accepted_until: null },
    ];
    const violation = createViolation({ page: "/dashboard", rule_id: "color-contrast" });
    expect(isKnownIssue(violation, knownIssues)).toBe(true);
  });

  it("isKnownIssue returns false for unknown", () => {
    const violation = createViolation({ page: "/dashboard", rule_id: "button-name" });
    expect(isKnownIssue(violation)).toBe(false);
  });

  it("filterBlockingViolations keeps only critical/serious", () => {
    const violations = [
      createViolation({ id: "v1", impact: "critical" }),
      createViolation({ id: "v2", impact: "serious" }),
      createViolation({ id: "v3", impact: "moderate" }),
      createViolation({ id: "v4", impact: "minor" }),
    ];
    const blocking = filterBlockingViolations(violations);
    expect(blocking).toHaveLength(2);
  });

  it("filterByImpact filters by specified impacts", () => {
    const violations = [
      createViolation({ id: "v1", impact: "critical" }),
      createViolation({ id: "v2", impact: "moderate" }),
    ];
    const filtered = filterByImpact(violations, ["critical"]);
    expect(filtered).toHaveLength(1);
  });

  it("sortByImpact sorts by severity", () => {
    const violations = [
      createViolation({ id: "v1", impact: "minor" }),
      createViolation({ id: "v2", impact: "critical" }),
      createViolation({ id: "v3", impact: "moderate" }),
      createViolation({ id: "v4", impact: "serious" }),
    ];
    const sorted = sortByImpact(violations);
    expect(sorted[0].impact).toBe("critical");
    expect(sorted[1].impact).toBe("serious");
    expect(sorted[2].impact).toBe("moderate");
    expect(sorted[3].impact).toBe("minor");
  });
});

describe("A11y CI Gate — Config", () => {
  it("default config has blocking impacts", () => {
    expect(DEFAULT_CI_GATE_CONFIG.blocking_impacts).toContain("critical");
    expect(DEFAULT_CI_GATE_CONFIG.blocking_impacts).toContain("serious");
  });

  it("default config max violations is 0", () => {
    expect(DEFAULT_CI_GATE_CONFIG.max_violations).toBe(0);
  });

  it("default config scans all pages", () => {
    expect(DEFAULT_CI_GATE_CONFIG.pages_to_scan.length).toBe(ALL_AUDIT_PAGES.length);
  });
});

describe("A11y CI Gate — Evaluation", () => {
  it("passes with no violations", () => {
    const report = buildBaselineReport([], ["/", "/dashboard"]);
    const result = evaluateCIGate(report);
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("fails with blocking violations", () => {
    const violations = [createViolation({ impact: "critical" })];
    const report = buildBaselineReport(violations, ["/dashboard"]);
    const result = evaluateCIGate(report);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("blocking"))).toBe(true);
  });

  it("fails when violations exceed max", () => {
    const violations = [createViolation({ impact: "moderate" })];
    const report = buildBaselineReport(violations, ["/dashboard"]);
    const result = evaluateCIGate(report, { ...DEFAULT_CI_GATE_CONFIG, max_violations: 0 });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("exceed"))).toBe(true);
  });

  it("passes with only moderate violations and max=1", () => {
    const violations = [createViolation({ impact: "moderate" })];
    const report = buildBaselineReport(violations, ["/dashboard"]);
    const result = evaluateCIGate(report, { ...DEFAULT_CI_GATE_CONFIG, max_violations: 1 });
    expect(result.passed).toBe(true);
  });
});
