/**
 * Accessibility Baseline Audit — P1-A11Y-001
 * ============================================
 * axe-core/Playwright a11y-Baseline-Audit über Dashboard-Hauptflows
 * nach WCAG 2.2 AA.
 *
 * Definiert:
 *   - Audit-Pages (public + dashboard)
 *   - WCAG-Tags (wcag2a, wcag2aa, wcag21aa, wcag22aa)
 *   - Impact-Levels (critical, serious, moderate, minor)
 *   - Baseline-Report-Struktur für CI-Gate (P1-A11Y-002)
 *   - Known Issues (akzeptierte Violations mit Begründung)
 *
 * Bestehende Tests:
 *   - tests/e2e-playwright/a11y.spec.ts (6 public pages)
 *   - tests/e2e-playwright/accessibility.spec.ts (6 public + 47 dashboard routes)
 */

export type WcagTag = "wcag2a" | "wcag2aa" | "wcag21aa" | "wcag22aa";
export type ImpactLevel = "minor" | "moderate" | "serious" | "critical";

export interface AuditPage {
  path: string;
  category: "public" | "dashboard" | "auth";
  requires_auth: boolean;
  description: string;
}

export interface AuditRule {
  id: string;
  tag: WcagTag;
  impact: ImpactLevel;
  description: string;
  enabled: boolean;
}

export interface KnownIssue {
  id: string;
  page: string;
  rule_id: string;
  impact: ImpactLevel;
  reason: string;
  accepted_until: string | null;
  ticket?: string;
}

export interface A11yViolation {
  id: string;
  rule_id: string;
  impact: ImpactLevel;
  description: string;
  help: string;
  helpUrl: string;
  target: string;
  html: string;
  page: string;
  tags: WcagTag[];
}

export interface A11yBaselineReport {
  generated_at: string;
  total_pages_scanned: number;
  total_violations: number;
  by_impact: Record<ImpactLevel, number>;
  by_page: Record<string, number>;
  by_rule: Record<string, number>;
  known_issues_count: number;
  new_violations: number;
  passed: boolean;
  violations: A11yViolation[];
  pages_scanned: string[];
  wcag_tags: WcagTag[];
}

// ── Audit Pages ───────────────────────────────────────────────────────

export const PUBLIC_PAGES: AuditPage[] = [
  { path: "/", category: "public", requires_auth: false, description: "Landing (EN)" },
  { path: "/de", category: "public", requires_auth: false, description: "Landing (DE)" },
  { path: "/de/features", category: "public", requires_auth: false, description: "Features (DE)" },
  { path: "/de/pricing", category: "public", requires_auth: false, description: "Pricing (DE)" },
  { path: "/de/login", category: "auth", requires_auth: false, description: "Login (DE)" },
  { path: "/de/signup", category: "auth", requires_auth: false, description: "Signup (DE)" },
  { path: "/pricing", category: "public", requires_auth: false, description: "Pricing (EN)" },
  { path: "/features", category: "public", requires_auth: false, description: "Features (EN)" },
  { path: "/login", category: "auth", requires_auth: false, description: "Login (EN)" },
  { path: "/signup", category: "auth", requires_auth: false, description: "Signup (EN)" },
];

export const DASHBOARD_PAGES: AuditPage[] = [
  { path: "/dashboard", category: "dashboard", requires_auth: true, description: "Dashboard Home" },
  { path: "/dashboard/cases", category: "dashboard", requires_auth: true, description: "Akten" },
  { path: "/dashboard/deadlines", category: "dashboard", requires_auth: true, description: "Fristen" },
  { path: "/dashboard/brain", category: "dashboard", requires_auth: true, description: "Brain" },
  { path: "/dashboard/query", category: "dashboard", requires_auth: true, description: "Query" },
  { path: "/dashboard/vault", category: "dashboard", requires_auth: true, description: "Vault" },
  { path: "/dashboard/contacts", category: "dashboard", requires_auth: true, description: "Kontakte" },
  { path: "/dashboard/invoicing", category: "dashboard", requires_auth: true, description: "Rechnungen" },
  { path: "/dashboard/team", category: "dashboard", requires_auth: true, description: "Team" },
  { path: "/dashboard/settings", category: "dashboard", requires_auth: true, description: "Einstellungen" },
  { path: "/dashboard/agents", category: "dashboard", requires_auth: true, description: "Agenten" },
  { path: "/dashboard/compliance", category: "dashboard", requires_auth: true, description: "Compliance" },
  { path: "/dashboard/approvals", category: "dashboard", requires_auth: true, description: "Freigaben" },
  { path: "/dashboard/assistant", category: "dashboard", requires_auth: true, description: "Assistent" },
  { path: "/dashboard/audit", category: "dashboard", requires_auth: true, description: "Audit-Log" },
  { path: "/dashboard/whatsapp", category: "dashboard", requires_auth: true, description: "WhatsApp" },
  { path: "/dashboard/contracts", category: "dashboard", requires_auth: true, description: "Verträge" },
  { path: "/dashboard/drafting", category: "dashboard", requires_auth: true, description: "Drafting" },
  { path: "/dashboard/kollisionspruefung", category: "dashboard", requires_auth: true, description: "Konfliktsprüfung" },
  { path: "/dashboard/research", category: "dashboard", requires_auth: true, description: "Recherche" },
];

export const ALL_AUDIT_PAGES: AuditPage[] = [...PUBLIC_PAGES, ...DASHBOARD_PAGES];

// ── WCAG Tags ─────────────────────────────────────────────────────────

export const DEFAULT_WCAG_TAGS: WcagTag[] = ["wcag2a", "wcag2aa", "wcag21aa"];

export const WCAG_22_TAGS: WcagTag[] = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

// ── Impact Levels ─────────────────────────────────────────────────────

export const BLOCKING_IMPACTS: ImpactLevel[] = ["critical", "serious"];
export const ALL_IMPACTS: ImpactLevel[] = ["critical", "serious", "moderate", "minor"];

export const IMPACT_SEVERITY: Record<ImpactLevel, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

// ── Known Issues ──────────────────────────────────────────────────────

export const KNOWN_ISSUES: KnownIssue[] = [
  // Add known issues here as they are discovered and accepted
  // Format: { id, page, rule_id, impact, reason, accepted_until, ticket }
];

// ── Audit Rules ───────────────────────────────────────────────────────

export const AUDIT_RULES: AuditRule[] = [
  { id: "color-contrast", tag: "wcag2aa", impact: "serious", description: "Elements must meet minimum color contrast ratio", enabled: true },
  { id: "aria-valid-attr", tag: "wcag2a", impact: "critical", description: "ARIA attributes must conform to valid names", enabled: true },
  { id: "aria-valid-attr-value", tag: "wcag2a", impact: "critical", description: "ARIA attributes must conform to valid values", enabled: true },
  { id: "aria-roles", tag: "wcag2a", impact: "critical", description: "Elements must only use allowed ARIA roles", enabled: true },
  { id: "button-name", tag: "wcag2a", impact: "critical", description: "Buttons must have discernible text", enabled: true },
  { id: "image-alt", tag: "wcag2a", impact: "critical", description: "Images must have alternate text", enabled: true },
  { id: "input-button-name", tag: "wcag2a", impact: "critical", description: "Form buttons must have discernible text", enabled: true },
  { id: "label", tag: "wcag2a", impact: "critical", description: "Form elements must have labels", enabled: true },
  { id: "link-name", tag: "wcag2a", impact: "serious", description: "Links must have discernible text", enabled: true },
  { id: "list", tag: "wcag2a", impact: "serious", description: "<ul> and <ol> must only directly contain <li> elements", enabled: true },
  { id: "listitem", tag: "wcag2a", impact: "serious", description: "<li> elements must be contained in a <ul> or <ol>", enabled: true },
  { id: "tabindex", tag: "wcag2a", impact: "serious", description: "Elements should not have tabindex greater than zero", enabled: true },
  { id: "table-fake-caption", tag: "wcag2a", impact: "moderate", description: "Tables should use caption instead of cells with 'caption' role", enabled: true },
  { id: "td-headers", tag: "wcag2a", impact: "serious", description: "Table cells should use headers attribute", enabled: true },
  { id: "valid-lang", tag: "wcag2a", impact: "moderate", description: "lang attribute must have a valid value", enabled: true },
  { id: "document-title", tag: "wcag2a", impact: "serious", description: "Documents must have a title", enabled: true },
  { id: "html-has-lang", tag: "wcag2a", impact: "serious", description: "<html> element must have a lang attribute", enabled: true },
  { id: "landmark-one-main", tag: "wcag2aa", impact: "moderate", description: "Page must contain one main landmark", enabled: true },
  { id: "region", tag: "wcag2aa", impact: "moderate", description: "All page content must be contained by landmarks", enabled: true },
  { id: "focus-order-semantics", tag: "wcag2aa", impact: "moderate", description: "Focus order should follow visual order", enabled: true },
  { id: "heading-order", tag: "wcag2aa", impact: "moderate", description: "Heading levels should only increase by one", enabled: true },
  { id: "page-has-heading-one", tag: "wcag2aa", impact: "moderate", description: "Page must contain a level-one heading", enabled: true },
];

// ── Report Builder ────────────────────────────────────────────────────

export function buildBaselineReport(
  violations: A11yViolation[],
  pagesScanned: string[],
  knownIssues: KnownIssue[] = KNOWN_ISSUES,
): A11yBaselineReport {
  const knownIds = new Set(knownIssues.map((k) => `${k.page}:${k.rule_id}`));
  const newViolations = violations.filter((v) => !knownIds.has(`${v.page}:${v.rule_id}`));

  const byImpact: Record<ImpactLevel, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  const byPage: Record<string, number> = {};
  const byRule: Record<string, number> = {};

  for (const v of newViolations) {
    byImpact[v.impact]++;
    byPage[v.page] = (byPage[v.page] ?? 0) + 1;
    byRule[v.rule_id] = (byRule[v.rule_id] ?? 0) + 1;
  }

  const blockingViolations = newViolations.filter((v) => BLOCKING_IMPACTS.includes(v.impact));

  return {
    generated_at: new Date().toISOString(),
    total_pages_scanned: pagesScanned.length,
    total_violations: newViolations.length,
    by_impact: byImpact,
    by_page: byPage,
    by_rule: byRule,
    known_issues_count: knownIssues.length,
    new_violations: newViolations.length,
    passed: blockingViolations.length === 0,
    violations: newViolations,
    pages_scanned: pagesScanned,
    wcag_tags: DEFAULT_WCAG_TAGS,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

export function isKnownIssue(
  violation: A11yViolation,
  knownIssues: KnownIssue[] = KNOWN_ISSUES,
): boolean {
  return knownIssues.some(
    (k) => k.page === violation.page && k.rule_id === violation.rule_id,
  );
}

export function filterBlockingViolations(violations: A11yViolation[]): A11yViolation[] {
  return violations.filter((v) => BLOCKING_IMPACTS.includes(v.impact));
}

export function filterByImpact(violations: A11yViolation[], impacts: ImpactLevel[]): A11yViolation[] {
  return violations.filter((v) => impacts.includes(v.impact));
}

export function sortByImpact(violations: A11yViolation[]): A11yViolation[] {
  return [...violations].sort((a, b) => IMPACT_SEVERITY[a.impact] - IMPACT_SEVERITY[b.impact]);
}

export function getAuditPagesByCategory(category: AuditPage["category"]): AuditPage[] {
  return ALL_AUDIT_PAGES.filter((p) => p.category === category);
}

export function getEnabledRules(): AuditRule[] {
  return AUDIT_RULES.filter((r) => r.enabled);
}

export function getRuleById(id: string): AuditRule | undefined {
  return AUDIT_RULES.find((r) => r.id === id);
}

// ── CI Gate Config (P1-A11Y-002) ──────────────────────────────────────

export interface A11yCIGateConfig {
  blocking_impacts: ImpactLevel[];
  max_violations: number;
  wcag_tags: WcagTag[];
  pages_to_scan: AuditPage[];
  fail_on_known_issue_expiry: boolean;
  generate_html_report: boolean;
  output_dir: string;
}

export const DEFAULT_CI_GATE_CONFIG: A11yCIGateConfig = {
  blocking_impacts: BLOCKING_IMPACTS,
  max_violations: 0,
  wcag_tags: DEFAULT_WCAG_TAGS,
  pages_to_scan: ALL_AUDIT_PAGES,
  fail_on_known_issue_expiry: true,
  generate_html_report: true,
  output_dir: "test-results/a11y",
};

export function evaluateCIGate(report: A11yBaselineReport, config: A11yCIGateConfig = DEFAULT_CI_GATE_CONFIG): {
  passed: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const blocking = filterBlockingViolations(report.violations);

  if (blocking.length > 0) {
    reasons.push(`${blocking.length} blocking violations (critical/serious) found`);
  }

  if (report.new_violations > config.max_violations) {
    reasons.push(`${report.new_violations} new violations exceed max of ${config.max_violations}`);
  }

  // Check expired known issues
  const now = new Date();
  for (const issue of KNOWN_ISSUES) {
    if (issue.accepted_until && new Date(issue.accepted_until) < now) {
      if (config.fail_on_known_issue_expiry) {
        reasons.push(`Known issue ${issue.id} expired on ${issue.accepted_until}`);
      }
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}
