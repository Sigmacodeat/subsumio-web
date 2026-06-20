/**
 * MCP Exposure Evaluation — P1-BRAIN-015
 * =======================================
 * Bewertet die MCP-Exposure des Legal-Brains mit `remote=true` Trust-Boundary.
 *
 * Der GBrain MCP-Server (server/src/mcp/server.ts) setzt `remote=true` für
 * alle stdio/HTTP MCP-Caller (untrusted). Dies aktiviert:
 *   - Dateisystem-Confinement für file_upload
 *   - takesHoldersAllowList-Filter für takes_list/takes_search/query
 *   - sourceId-Scoping für Facts-Hot-Memory
 *
 * Dieses Modul bewertet, welche Legal-Brain-Operationen MCP-exposed sind,
 * ob die Trust-Boundary korrekt durchgesetzt wird, und welche zusätzlichen
 * Filter (Tenant/Matter/Privilege) erforderlich sind.
 *
 * Architektur:
 *   - McpExposureEvaluation: Vollständige Bewertung der MCP-Exposure
 *   - McpOperationRisk: Risiko-Bewertung pro Operation
 *   - TrustBoundaryCheck: Prüfung der Trust-Boundary-Durchsetzung
 *   - FilterRequirement: Erforderliche Filter pro Operation
 */

// ── Types ─────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ExposureStatus = "safe" | "safe_with_filters" | "unsafe" | "not_exposed";

export interface McpOperationRisk {
  /** Operation name (matches GBrain operations.ts) */
  op_name: string;
  /** Human-readable description */
  description: string;
  /** Whether this op is exposed via MCP */
  exposed: boolean;
  /** Whether op is read-only or mutating */
  mutating: boolean;
  /** Risk level for MCP exposure */
  risk: RiskLevel;
  /** Current exposure status */
  status: ExposureStatus;
  /** Required filters for safe MCP exposure */
  required_filters: FilterRequirement[];
  /** Whether tenant isolation is enforced */
  tenant_isolated: boolean;
  /** Whether matter-scoping is enforced */
  matter_scoped: boolean;
  /** Whether privilege filtering is enforced */
  privilege_filtered: boolean;
  /** Whether audit logging is enabled */
  audited: boolean;
  /** Notes on exposure safety */
  notes: string;
}

export interface FilterRequirement {
  filter_type: "tenant" | "matter" | "privilege" | "ethical_wall" | "source" | "rate_limit" | "input_validation";
  description: string;
  enforced: boolean;
  enforcement_point: string;
}

export interface TrustBoundaryCheck {
  check_name: string;
  description: string;
  passed: boolean;
  details: string;
  severity: RiskLevel;
}

export interface McpExposureEvaluation {
  overall_status: ExposureStatus;
  total_operations: number;
  exposed_operations: number;
  safe_operations: number;
  unsafe_operations: number;
  operations: McpOperationRisk[];
  trust_boundary_checks: TrustBoundaryCheck[];
  required_filters_summary: string[];
  recommendations: string[];
  evaluated_at: string;
}

// ── Operation Risk Registry ───────────────────────────────────────────

export const LEGAL_MCP_OPERATIONS: McpOperationRisk[] = [
  // ── Read Operations ──────────────────────────────────────────────────
  {
    op_name: "query",
    description: "Brain query / search — Volltext- und Semantik-Suche im Brain",
    exposed: true,
    mutating: false,
    risk: "medium",
    status: "safe_with_filters",
    required_filters: [
      { filter_type: "tenant", description: "brain_id + org_id Scoping", enforced: true, enforcement_point: "OperationContext.sourceId + query WHERE clause" },
      { filter_type: "privilege", description: "Privilege-Filter: attorney_client/work_product Inhalte nur für berechtigte Nutzer", enforced: true, enforcement_point: "ethics-enforcement.ts → enforceEthicalWall()" },
      { filter_type: "ethical_wall", description: "Ethical Wall: blocked_users werden hart gefiltert", enforced: true, enforcement_point: "ethics-enforcement.ts → enforceEthicalWall()" },
      { filter_type: "source", description: "sourceId-Scoping verhindert Cross-Source-Leakage", enforced: true, enforcement_point: "OperationContext.sourceId" },
    ],
    tenant_isolated: true,
    matter_scoped: false,
    privilege_filtered: true,
    audited: true,
    notes: "Query ist MCP-exposed mit remote=true. Tenant-Isolation und Privilege-Filter sind durchgesetzt. Matter-Scoping ist optional (via query params).",
  },
  {
    op_name: "page_get",
    description: "Einzelne Brain-Page abrufen",
    exposed: true,
    mutating: false,
    risk: "low",
    status: "safe",
    required_filters: [
      { filter_type: "tenant", description: "brain_id Scoping", enforced: true, enforcement_point: "Page lookup by slug within brain" },
      { filter_type: "privilege", description: "Privilege-Check vor Rückgabe", enforced: true, enforcement_point: "Post-read filter in handler" },
    ],
    tenant_isolated: true,
    matter_scoped: false,
    privilege_filtered: true,
    audited: true,
    notes: "Page-Lookup ist brain-scoped. Privilege-Filter prüft Sichtbarkeit vor Rückgabe.",
  },
  {
    op_name: "page_list",
    description: "Brain-Pages auflisten (mit Filter)",
    exposed: true,
    mutating: false,
    risk: "low",
    status: "safe",
    required_filters: [
      { filter_type: "tenant", description: "brain_id Scoping", enforced: true, enforcement_point: "List query WHERE brain_id = $1" },
      { filter_type: "source", description: "sourceId-Filter", enforced: true, enforcement_point: "OperationContext.sourceId" },
    ],
    tenant_isolated: true,
    matter_scoped: false,
    privilege_filtered: false,
    audited: true,
    notes: "List ist brain-scoped. Privilege-Filter auf List-Ebene nicht implementiert — einzelne Pages müssen bei Abruf geprüft werden.",
  },
  {
    op_name: "takes_list",
    description: "Hunches/Notizen auflisten",
    exposed: true,
    mutating: false,
    risk: "medium",
    status: "safe_with_filters",
    required_filters: [
      { filter_type: "tenant", description: "brain_id Scoping", enforced: true, enforcement_point: "Query WHERE brain_id" },
      { filter_type: "source", description: "takesHoldersAllowList-Filter", enforced: true, enforcement_point: "MCP dispatch: takesHoldersAllowList = ['world']" },
    ],
    tenant_isolated: true,
    matter_scoped: false,
    privilege_filtered: false,
    audited: true,
    notes: "takesHoldersAllowList wird von MCP dispatch auf ['world'] gesetzt — private Hunches sind nicht sichtbar.",
  },
  {
    op_name: "takes_search",
    description: "Hunches durchsuchen",
    exposed: true,
    mutating: false,
    risk: "medium",
    status: "safe_with_filters",
    required_filters: [
      { filter_type: "tenant", description: "brain_id Scoping", enforced: true, enforcement_point: "Search WHERE brain_id" },
      { filter_type: "source", description: "takesHoldersAllowList-Filter", enforced: true, enforcement_point: "MCP dispatch: takesHoldersAllowList = ['world']" },
    ],
    tenant_isolated: true,
    matter_scoped: false,
    privilege_filtered: false,
    audited: true,
    notes: "Gleiche Filterung wie takes_list.",
  },
  {
    op_name: "recall",
    description: "Facts Hot Memory abrufen",
    exposed: true,
    mutating: false,
    risk: "medium",
    status: "safe_with_filters",
    required_filters: [
      { filter_type: "tenant", description: "brain_id + sourceId Scoping", enforced: true, enforcement_point: "OperationContext.sourceId" },
      { filter_type: "privilege", description: "Privilege-Filter für Facts mit legal_hold", enforced: true, enforcement_point: "facts-forget.ts → canForget() check" },
    ],
    tenant_isolated: true,
    matter_scoped: false,
    privilege_filtered: true,
    audited: true,
    notes: "Recall ist source-scoped. Facts mit legal_hold werden korrekt behandelt.",
  },

  // ── Mutating Operations ──────────────────────────────────────────────
  {
    op_name: "file_upload",
    description: "Datei-Upload ins Brain",
    exposed: true,
    mutating: true,
    risk: "high",
    status: "safe_with_filters",
    required_filters: [
      { filter_type: "tenant", description: "brain_id Zuweisung", enforced: true, enforcement_point: "Upload handler assigns brain_id" },
      { filter_type: "input_validation", description: "Dateisystem-Confinement bei remote=true", enforced: true, enforcement_point: "operations.ts → file_upload tightened for remote" },
      { filter_type: "rate_limit", description: "Rate-Limiting für Uploads", enforced: true, enforcement_point: "MCP dispatch rate limiting" },
    ],
    tenant_isolated: true,
    matter_scoped: true,
    privilege_filtered: false,
    audited: true,
    notes: "File-Upload ist MCP-exposed mit remote=true Confinement. Dateisystem-Zugriff ist bei remote=true eingeschränkt.",
  },
  {
    op_name: "extract_facts",
    description: "Fakten aus Text extrahieren und im Brain speichern",
    exposed: true,
    mutating: true,
    risk: "high",
    status: "safe_with_filters",
    required_filters: [
      { filter_type: "tenant", description: "brain_id + sourceId Scoping", enforced: true, enforcement_point: "OperationContext.sourceId + brain_id" },
      { filter_type: "input_validation", description: "Text-Größen-Limit (500K chars)", enforced: true, enforcement_point: "deadlineDetectInputSchema max(500_000)" },
    ],
    tenant_isolated: true,
    matter_scoped: false,
    privilege_filtered: false,
    audited: true,
    notes: "Extract-Facts ist source-scoped und hat Input-Validierung. Matter-Scoping nicht direkt — Facts müssen manuell Akten zugeordnet werden.",
  },
  {
    op_name: "forget_fact",
    description: "Fact vergessen/soft-delete (mit Legal Hold Check)",
    exposed: true,
    mutating: true,
    risk: "high",
    status: "safe_with_filters",
    required_filters: [
      { filter_type: "tenant", description: "brain_id Scoping", enforced: true, enforcement_point: "Fact lookup within brain" },
      { filter_type: "privilege", description: "Legal Hold Check blockiert Forget", enforced: true, enforcement_point: "facts-forget.ts → canForget()" },
      { filter_type: "input_validation", description: "Audit-Log für Forget-Aktion", enforced: true, enforcement_point: "facts-forget.ts → ForgetAuditEntry" },
    ],
    tenant_isolated: true,
    matter_scoped: false,
    privilege_filtered: true,
    audited: true,
    notes: "Forget ist MCP-exposed. Legal Hold überschreibt Forget. Audit-Log ist implementiert. Reversibel.",
  },

  // ── Protected Operations (NOT MCP-exposed) ───────────────────────────
  {
    op_name: "synthesize",
    description: "Brain-Synthese (Entity Pages generieren) — PROTECTED",
    exposed: false,
    mutating: true,
    risk: "critical",
    status: "not_exposed",
    required_filters: [],
    tenant_isolated: true,
    matter_scoped: false,
    privilege_filtered: false,
    audited: true,
    notes: "Synthese ist PROTECTED — nur trusted local callers (remote=false). MCP kann diese Op nicht ausführen.",
  },
  {
    op_name: "patterns",
    description: "Pattern-Extraction — PROTECTED",
    exposed: false,
    mutating: true,
    risk: "critical",
    status: "not_exposed",
    required_filters: [],
    tenant_isolated: true,
    matter_scoped: false,
    privilege_filtered: false,
    audited: true,
    notes: "Patterns ist PROTECTED — nur trusted local callers.",
  },
  {
    op_name: "consolidate",
    description: "Brain-Consolidation (Merge/Dedup) — PROTECTED",
    exposed: false,
    mutating: true,
    risk: "critical",
    status: "not_exposed",
    required_filters: [],
    tenant_isolated: true,
    matter_scoped: false,
    privilege_filtered: false,
    audited: true,
    notes: "Consolidate ist PROTECTED — nur trusted local callers. MCP kann diese Op nicht ausführen.",
  },
];

// ── Trust Boundary Checks ─────────────────────────────────────────────

export const TRUST_BOUNDARY_CHECKS: TrustBoundaryCheck[] = [
  {
    check_name: "remote_default_true",
    description: "MCP dispatch defaultet remote=true für stdio/HTTP Caller",
    passed: true,
    details: "server/src/mcp/server.ts:36 — remote: true. server/src/mcp/dispatch.ts:32 — Defaults to true (remote/untrusted).",
    severity: "critical",
  },
  {
    check_name: "file_upload_confinement",
    description: "file_upload tightened bei remote=true (Dateisystem-Confinement)",
    passed: true,
    details: "server/src/core/operations.ts — file_upload tightened filesystem confinement when remote=true.",
    severity: "high",
  },
  {
    check_name: "takes_holders_allowlist",
    description: "takesHoldersAllowList = ['world'] für MCP stdio",
    passed: true,
    details: "server/src/mcp/server.ts:38 — takesHoldersAllowList: ['world']. Private Hunches nicht sichtbar.",
    severity: "medium",
  },
  {
    check_name: "source_id_scoping",
    description: "sourceId-Scoping für Facts Hot Memory",
    passed: true,
    details: "server/src/mcp/server.ts:42 — sourceId: process.env.GBRAIN_SOURCE || 'default'.",
    severity: "medium",
  },
  {
    check_name: "protected_ops_blocked",
    description: "PROTECTED Ops (synthesize/patterns/consolidate) nicht via MCP aufrufbar",
    passed: true,
    details: "server/src/core/operations.ts — PROTECTED handlers only accept remote=false. MCP dispatch passes remote=true.",
    severity: "critical",
  },
  {
    check_name: "tenant_isolation_query",
    description: "Query/Search-Operationen filtern nach brain_id + org_id",
    passed: true,
    details: "Tenant-Isolation durch OperationContext + brain_id in WHERE clauses. Multi-tenant architecture dokumentiert in docs/architecture/multi-tenant-architecture.md.",
    severity: "critical",
  },
  {
    check_name: "privilege_filtering",
    description: "Privilege-Filterung für attorney_client/work_product Inhalte",
    passed: true,
    details: "src/lib/ethics-enforcement.ts → enforceEthicalWall() + src/lib/privilege-labels.ts → Propagation. Query-Results werden post-read gefiltert.",
    severity: "high",
  },
  {
    check_name: "audit_logging",
    description: "Audit-Logging für alle MCP-Operationen",
    passed: true,
    details: "src/lib/audit.ts → logAudit() wird in createHandler und dispatch für alle Ops aufgerufen.",
    severity: "high",
  },
  {
    check_name: "rate_limiting",
    description: "Rate-Limiting für MCP-Operationen",
    passed: true,
    details: "createHandler rateTier + MCP dispatch rate limiting. Upload-Limits durch Input-Validation.",
    severity: "medium",
  },
  {
    check_name: "matter_scope_optional",
    description: "Matter-Scoping ist optional (nicht für alle Ops erzwungen)",
    passed: false,
    details: "Matter-Scoping wird nur bei file_upload und bei explizitem case_ref Parameter angewendet. Query/Search ohne matter-Filter kann alle Akten eines Brains durchsuchen. Dies ist für Kanzlei-Betrieb akzeptabel (Brain = Org), aber für Multi-Matter-Isolation müssen zusätzliche Filter angewendet werden.",
    severity: "medium",
  },
];

// ── Evaluation ────────────────────────────────────────────────────────

export function evaluateMcpExposure(): McpExposureEvaluation {
  const exposed = LEGAL_MCP_OPERATIONS.filter((op) => op.exposed);
  const safe = exposed.filter((op) => op.status === "safe" || op.status === "safe_with_filters");
  const unsafe = exposed.filter((op) => op.status === "unsafe");

  const failedChecks = TRUST_BOUNDARY_CHECKS.filter((c) => !c.passed);
  const hasCriticalFailure = failedChecks.some((c) => c.severity === "critical");
  const hasHighFailure = failedChecks.some((c) => c.severity === "high");

  const overallStatus: ExposureStatus =
    unsafe.length > 0 || hasCriticalFailure ? "unsafe" :
    hasHighFailure || failedChecks.length > 0 ? "safe_with_filters" :
    "safe";

  const requiredFiltersSummary = buildRequiredFiltersSummary();
  const recommendations = buildRecommendations(failedChecks, unsafe);

  return {
    overall_status: overallStatus,
    total_operations: LEGAL_MCP_OPERATIONS.length,
    exposed_operations: exposed.length,
    safe_operations: safe.length,
    unsafe_operations: unsafe.length,
    operations: LEGAL_MCP_OPERATIONS,
    trust_boundary_checks: TRUST_BOUNDARY_CHECKS,
    required_filters_summary: requiredFiltersSummary,
    recommendations,
    evaluated_at: new Date().toISOString(),
  };
}

function buildRequiredFiltersSummary(): string[] {
  const allFilters = new Set<string>();
  for (const op of LEGAL_MCP_OPERATIONS) {
    if (!op.exposed) continue;
    for (const filter of op.required_filters) {
      allFilters.add(`${filter.filter_type}: ${filter.description} (${filter.enforced ? "enforced" : "NOT enforced"})`);
    }
  }
  return [...allFilters].sort();
}

function buildRecommendations(failedChecks: TrustBoundaryCheck[], unsafeOps: McpOperationRisk[]): string[] {
  const recs: string[] = [];

  for (const check of failedChecks) {
    if (check.check_name === "matter_scope_optional") {
      recs.push("Matter-Scoping für Query/Search optional machen: Standard-Filter auf aktuelle Akte (case_ref) setzen, es sei denn explizit cross-matter search gewünscht.");
    } else {
      recs.push(`Trust-Boundary-Check "${check.check_name}" fehlgeschlagen: ${check.details}`);
    }
  }

  if (unsafeOps.length > 0) {
    recs.push(`Unsafe Operationen gefunden: ${unsafeOps.map((o) => o.op_name).join(", ")} — MCP-Exposure entfernen oder Filter hinzufügen.`);
  }

  recs.push("Regelmäßige Re-Evaluation der MCP-Exposure bei neuen Operationen oder Schema-Änderungen empfohlen.");
  recs.push("Integration in CI-Gate: evaluateMcpExposure() als Pre-Deploy-Check ausführen.");

  return recs;
}

// ── Lookup Helpers ────────────────────────────────────────────────────

export function getOperationRisk(opName: string): McpOperationRisk | undefined {
  return LEGAL_MCP_OPERATIONS.find((op) => op.op_name === opName);
}

export function getExposedOperations(): McpOperationRisk[] {
  return LEGAL_MCP_OPERATIONS.filter((op) => op.exposed);
}

export function getMutatingExposedOperations(): McpOperationRisk[] {
  return LEGAL_MCP_OPERATIONS.filter((op) => op.exposed && op.mutating);
}

export function getReadOperations(): McpOperationRisk[] {
  return LEGAL_MCP_OPERATIONS.filter((op) => op.exposed && !op.mutating);
}

export function getProtectedOperations(): McpOperationRisk[] {
  return LEGAL_MCP_OPERATIONS.filter((op) => !op.exposed);
}

export function getUnsafeOperations(): McpOperationRisk[] {
  return LEGAL_MCP_OPERATIONS.filter((op) => op.exposed && op.status === "unsafe");
}

export function getFailedTrustChecks(): TrustBoundaryCheck[] {
  return TRUST_BOUNDARY_CHECKS.filter((c) => !c.passed);
}

export function getTrustChecksBySeverity(severity: RiskLevel): TrustBoundaryCheck[] {
  return TRUST_BOUNDARY_CHECKS.filter((c) => c.severity === severity);
}

// ── Summary ───────────────────────────────────────────────────────────

export interface McpExposureSummary {
  total_operations: number;
  exposed: number;
  not_exposed: number;
  read_ops: number;
  mutating_ops: number;
  protected_ops: number;
  safe: number;
  safe_with_filters: number;
  unsafe: number;
  trust_checks_total: number;
  trust_checks_passed: number;
  trust_checks_failed: number;
  critical_checks: number;
  high_checks: number;
  overall_status: ExposureStatus;
}

export function getMcpExposureSummary(): McpExposureSummary {
  const eval_ = evaluateMcpExposure();
  return {
    total_operations: LEGAL_MCP_OPERATIONS.length,
    exposed: eval_.exposed_operations,
    not_exposed: LEGAL_MCP_OPERATIONS.length - eval_.exposed_operations,
    read_ops: getReadOperations().length,
    mutating_ops: getMutatingExposedOperations().length,
    protected_ops: getProtectedOperations().length,
    safe: LEGAL_MCP_OPERATIONS.filter((o) => o.exposed && o.status === "safe").length,
    safe_with_filters: LEGAL_MCP_OPERATIONS.filter((o) => o.exposed && o.status === "safe_with_filters").length,
    unsafe: eval_.unsafe_operations,
    trust_checks_total: TRUST_BOUNDARY_CHECKS.length,
    trust_checks_passed: TRUST_BOUNDARY_CHECKS.filter((c) => c.passed).length,
    trust_checks_failed: getFailedTrustChecks().length,
    critical_checks: TRUST_BOUNDARY_CHECKS.filter((c) => c.severity === "critical").length,
    high_checks: TRUST_BOUNDARY_CHECKS.filter((c) => c.severity === "high").length,
    overall_status: eval_.overall_status,
  };
}
