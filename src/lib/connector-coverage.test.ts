import { describe, it, expect } from "vitest";
import {
  CONNECTOR_COVERAGE_MATRIX,
  getCoverageMatrix,
  getConnectorById,
  getConnectorsByCategory,
  getConnectorsByStatus,
  getAvailableConnectors,
  getPlannedConnectors,
  getConnectorsByAuthMethod,
  getGoBdRelevantConnectors,
  getGdprRelevantConnectors,
  getMatterScopeConnectors,
  getConnectorByEngineService,
  getConnectorByDmsProvider,
  validateConnectorEntry,
  validateMatrix,
  getCoverageSummary,
  type ConnectorCoverageEntry,
} from "@/lib/connector-coverage";

describe("Connector Coverage Matrix — Structure", () => {
  it("has entries for all required categories", () => {
    const categories = new Set(CONNECTOR_COVERAGE_MATRIX.map((c) => c.category));
    expect(categories.has("dms")).toBe(true);
    expect(categories.has("microsoft_365")).toBe(true);
    expect(categories.has("google_workspace")).toBe(true);
    expect(categories.has("bea")).toBe(true);
    expect(categories.has("datev")).toBe(true);
    expect(categories.has("local_folder")).toBe(true);
    expect(categories.has("upload")).toBe(true);
  });

  it("has at least 10 connectors", () => {
    expect(CONNECTOR_COVERAGE_MATRIX.length).toBeGreaterThanOrEqual(10);
  });

  it("has unique ids", () => {
    const ids = CONNECTOR_COVERAGE_MATRIX.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every entry has required fields", () => {
    for (const entry of CONNECTOR_COVERAGE_MATRIX) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.category).toBeTruthy();
      expect(entry.status).toBeTruthy();
      expect(entry.content_types.length).toBeGreaterThan(0);
      expect(entry.sync_mode).toBeTruthy();
      expect(entry.auth_method).toBeTruthy();
      expect(entry.description).toBeTruthy();
    }
  });
});

describe("Connector Coverage Matrix — Lookup", () => {
  it("getConnectorById returns matching entry", () => {
    const entry = getConnectorById("google-drive");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("Google Drive");
  });

  it("getConnectorById returns undefined for unknown id", () => {
    expect(getConnectorById("non-existent")).toBeUndefined();
  });

  it("getConnectorsByCategory filters correctly", () => {
    const dms = getConnectorsByCategory("dms");
    expect(dms.length).toBeGreaterThanOrEqual(2);
    expect(dms.every((c) => c.category === "dms")).toBe(true);
  });

  it("getConnectorsByStatus filters correctly", () => {
    const available = getConnectorsByStatus("available");
    expect(available.length).toBeGreaterThan(0);
    expect(available.every((c) => c.status === "available")).toBe(true);
  });

  it("getAvailableConnectors returns only available", () => {
    const available = getAvailableConnectors();
    expect(available.every((c) => c.status === "available")).toBe(true);
  });

  it("getPlannedConnectors returns only planned", () => {
    const planned = getPlannedConnectors();
    expect(planned.every((c) => c.status === "planned")).toBe(true);
  });

  it("getConnectorsByAuthMethod filters correctly", () => {
    const oauth2 = getConnectorsByAuthMethod("oauth2");
    expect(oauth2.length).toBeGreaterThan(0);
    expect(oauth2.every((c) => c.auth_method === "oauth2")).toBe(true);
  });

  it("getGoBdRelevantConnectors returns GoBD-relevant only", () => {
    const gobd = getGoBdRelevantConnectors();
    expect(gobd.every((c) => c.gobd_relevant)).toBe(true);
  });

  it("getGdprRelevantConnectors returns GDPR-relevant only", () => {
    const gdpr = getGdprRelevantConnectors();
    expect(gdpr.every((c) => c.gdpr_relevant)).toBe(true);
  });

  it("getMatterScopeConnectors returns matter-scoped only", () => {
    const matter = getMatterScopeConnectors();
    expect(matter.every((c) => c.matter_scope)).toBe(true);
  });

  it("getConnectorByEngineService matches engine registry", () => {
    const drive = getConnectorByEngineService("google-drive");
    expect(drive).toBeDefined();
    expect(drive!.engine_service).toBe("google-drive");
  });

  it("getConnectorByDmsProvider matches DMS provider", () => {
    const imanager = getConnectorByDmsProvider("imanager");
    expect(imanager).toBeDefined();
    expect(imanager!.dms_provider).toBe("imanager");
  });
});

describe("Connector Coverage Matrix — Full Matrix", () => {
  it("getCoverageMatrix returns structured matrix", () => {
    const matrix = getCoverageMatrix();
    expect(matrix.total).toBe(CONNECTOR_COVERAGE_MATRIX.length);
    expect(matrix.by_category).toBeDefined();
    expect(matrix.by_status).toBeDefined();
    expect(matrix.coverage_gaps).toBeDefined();
  });

  it("getCoverageMatrix counts available correctly", () => {
    const matrix = getCoverageMatrix();
    expect(matrix.available_count).toBeGreaterThan(0);
    expect(matrix.available_count).toBe(getAvailableConnectors().length);
  });

  it("getCoverageMatrix counts planned correctly", () => {
    const matrix = getCoverageMatrix();
    expect(matrix.planned_count).toBe(getPlannedConnectors().length);
  });

  it("by_category groups all entries", () => {
    const matrix = getCoverageMatrix();
    const totalFromCategories = Object.values(matrix.by_category).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    expect(totalFromCategories).toBe(CONNECTOR_COVERAGE_MATRIX.length);
  });

  it("by_status groups all entries", () => {
    const matrix = getCoverageMatrix();
    const totalFromStatus = Object.values(matrix.by_status).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    expect(totalFromStatus).toBe(CONNECTOR_COVERAGE_MATRIX.length);
  });
});

describe("Connector Coverage Matrix — Coverage Gaps", () => {
  it("identifies Microsoft 365 as beta integration gap", () => {
    const matrix = getCoverageMatrix();
    const ms365Gap = matrix.coverage_gaps.find((g) => g.category === "microsoft_365");
    expect(ms365Gap).toBeDefined();
    expect(ms365Gap!.severity).toBe("medium");
    expect(ms365Gap!.missing_connectors).toHaveLength(0);
  });

  it("identifies DATEV as file-based limitation, not missing implementation", () => {
    const matrix = getCoverageMatrix();
    const datevGap = matrix.coverage_gaps.find((g) => g.category === "datev");
    expect(datevGap).toBeDefined();
    expect(datevGap!.severity).toBe("medium");
    expect(datevGap!.missing_connectors).toHaveLength(0);
  });

  it("identifies DMS push notification gap", () => {
    const matrix = getCoverageMatrix();
    const dmsGap = matrix.coverage_gaps.find((g) => g.category === "dms");
    expect(dmsGap).toBeDefined();
    expect(dmsGap!.severity).toBe("medium");
  });

  it("identifies beA file-based limitation", () => {
    const matrix = getCoverageMatrix();
    const beaGap = matrix.coverage_gaps.find((g) => g.category === "bea");
    expect(beaGap).toBeDefined();
    expect(beaGap!.severity).toBe("low");
  });

  it("has no high-severity connector gap after DATEV and Microsoft 365 hardening", () => {
    const matrix = getCoverageMatrix();
    expect(matrix.coverage_gaps.filter((g) => g.severity === "high")).toHaveLength(0);
  });
});

describe("Connector Coverage Matrix — Validation", () => {
  it("validates a correct entry", () => {
    const entry: ConnectorCoverageEntry = {
      id: "test-connector",
      name: "Test Connector",
      category: "upload",
      status: "available",
      engine_service: null,
      dms_provider: null,
      content_types: ["text/markdown"],
      sync_mode: "manual",
      auth_method: "manual_upload",
      tenant_isolated: true,
      matter_scope: false,
      gobd_relevant: false,
      gdpr_relevant: false,
      push_notifications: false,
      full_text_search: false,
      version_history: false,
      setup_difficulty: "easy",
      required_config: [],
      optional_config: [],
      description: "Test connector",
    };
    const result = validateConnectorEntry(entry);
    expect(result.valid).toBe(true);
  });

  it("rejects empty id", () => {
    const entry: ConnectorCoverageEntry = {
      id: "",
      name: "Test",
      category: "upload",
      status: "available",
      engine_service: null,
      dms_provider: null,
      content_types: ["text/markdown"],
      sync_mode: "manual",
      auth_method: "manual_upload",
      tenant_isolated: true,
      matter_scope: false,
      gobd_relevant: false,
      gdpr_relevant: false,
      push_notifications: false,
      full_text_search: false,
      version_history: false,
      setup_difficulty: "easy",
      required_config: [],
      optional_config: [],
      description: "Test",
    };
    const result = validateConnectorEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("id is required");
  });

  it("rejects empty content_types", () => {
    const entry: ConnectorCoverageEntry = {
      id: "test",
      name: "Test",
      category: "upload",
      status: "available",
      engine_service: null,
      dms_provider: null,
      content_types: [],
      sync_mode: "manual",
      auth_method: "manual_upload",
      tenant_isolated: true,
      matter_scope: false,
      gobd_relevant: false,
      gdpr_relevant: false,
      push_notifications: false,
      full_text_search: false,
      version_history: false,
      setup_difficulty: "easy",
      required_config: [],
      optional_config: [],
      description: "Test",
    };
    const result = validateConnectorEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("content_types must not be empty");
  });

  it("validateMatrix passes for all entries", () => {
    const result = validateMatrix();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("Connector Coverage Matrix — Summary", () => {
  it("getCoverageSummary returns aggregated stats", () => {
    const summary = getCoverageSummary();
    expect(summary.total).toBe(CONNECTOR_COVERAGE_MATRIX.length);
    expect(summary.by_category).toBeDefined();
    expect(summary.by_status).toBeDefined();
    expect(summary.by_auth_method).toBeDefined();
    expect(summary.by_sync_mode).toBeDefined();
  });

  it("summary counts GoBD-relevant connectors", () => {
    const summary = getCoverageSummary();
    expect(summary.gobd_relevant_count).toBe(getGoBdRelevantConnectors().length);
  });

  it("summary counts GDPR-relevant connectors", () => {
    const summary = getCoverageSummary();
    expect(summary.gdpr_relevant_count).toBe(getGdprRelevantConnectors().length);
  });

  it("summary counts matter-scoped connectors", () => {
    const summary = getCoverageSummary();
    expect(summary.matter_scope_count).toBe(getMatterScopeConnectors().length);
  });

  it("summary counts coverage gaps", () => {
    const matrix = getCoverageMatrix();
    const summary = getCoverageSummary();
    expect(summary.coverage_gaps_count).toBe(matrix.coverage_gaps.length);
  });

  it("summary counts high-severity gaps", () => {
    const matrix = getCoverageMatrix();
    const summary = getCoverageSummary();
    expect(summary.high_severity_gaps).toBe(
      matrix.coverage_gaps.filter((g) => g.severity === "high").length
    );
  });
});

describe("Connector Coverage Matrix — Specific Connector Checks", () => {
  it("Google Drive is available with OAuth2", () => {
    const drive = getConnectorById("google-drive");
    expect(drive!.status).toBe("available");
    expect(drive!.auth_method).toBe("oauth2");
    expect(drive!.engine_service).toBe("google-drive");
  });

  it("beA import is available with file_watch", () => {
    const bea = getConnectorById("bea-import");
    expect(bea!.status).toBe("available");
    expect(bea!.auth_method).toBe("file_watch");
    expect(bea!.gobd_relevant).toBe(true);
  });

  it("Manual upload supports all content types", () => {
    const upload = getConnectorById("manual-upload");
    expect(upload!.status).toBe("available");
    expect(upload!.content_types.length).toBeGreaterThan(5);
    expect(upload!.matter_scope).toBe(true);
  });

  it("iManage DMS is available", () => {
    const imanager = getConnectorById("dms-imanager");
    expect(imanager!.status).toBe("available");
    expect(imanager!.dms_provider).toBe("imanager");
    expect(imanager!.gobd_relevant).toBe(true);
  });

  it("DATEV import is available as file-based import", () => {
    const datev = getConnectorById("datev-import");
    expect(datev!.status).toBe("available");
    expect(datev!.auth_method).toBe("manual_upload");
    expect(datev!.category).toBe("datev");
  });

  it("Microsoft 365 connectors are beta engine connectors", () => {
    const ms365 = getConnectorsByCategory("microsoft_365");
    expect(ms365.every((c) => c.status === "beta")).toBe(true);
    expect(ms365.every((c) => c.engine_service?.startsWith("ms365-"))).toBe(true);
  });
});
