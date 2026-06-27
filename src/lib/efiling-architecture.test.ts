import { describe, it, expect } from "vitest";
import {
  ARCHITECTURE_OPTIONS,
  RECOMMENDED_OPTION,
  ARCHITECTURE_DECISION,
  createFilingPackage,
  createFilingDocument,
  submitForApproval,
  approveFiling,
  sendFiling,
  confirmReceipt,
  retryFiling,
  cancelFiling,
  validateFilingPackage,
  getFilingStatusLabel,
  getChannelLabel,
  isTerminalStatus,
  canRetry,
  getFilingDocumentsByType,
  type FilingPackage,
  type FilingReceipt,
  type ArchitectureOption,
} from "@/lib/efiling-architecture";

function createTestPackage(overrides: Partial<FilingPackage> = {}): FilingPackage {
  const pkg = createFilingPackage({
    case_slug: "legal/cases/123",
    brain_id: "brain-1",
    org_id: "org-1",
    channel: "beA",
    court: "LG Wien",
    created_by: "lawyer@test",
  });
  const doc = createFilingDocument({
    title: "Klage.pdf",
    file_path: "/vault/klage.pdf",
    file_hash: "abc123",
    mime_type: "application/pdf",
    size_bytes: 50000,
    is_main_document: true,
  });
  pkg.documents.push(doc);
  return { ...pkg, ...overrides };
}

function createTestReceipt(isSuccess: boolean = true): FilingReceipt {
  return {
    receipt_id: `r-${Date.now()}`,
    received_at: new Date().toISOString(),
    received_by: "middleware",
    confirmation_code: isSuccess ? "CONF-2026-001" : "ERR-001",
    is_success: isSuccess,
    error_code: isSuccess ? undefined : "DELIVERY_FAILED",
    error_message: isSuccess ? undefined : "Court system unavailable",
  };
}

describe("eFiling — Architecture Options (P1-EFILE-001)", () => {
  it("has 3 architecture options", () => {
    expect(Object.keys(ARCHITECTURE_OPTIONS)).toHaveLength(3);
  });

  it("all options have required fields", () => {
    for (const key of Object.keys(ARCHITECTURE_OPTIONS) as ArchitectureOption[]) {
      const opt = ARCHITECTURE_OPTIONS[key];
      expect(opt.title).toBeTruthy();
      expect(opt.description).toBeTruthy();
      expect(opt.pros.length).toBeGreaterThan(0);
      expect(opt.cons.length).toBeGreaterThan(0);
      expect(opt.effort).toBeTruthy();
      expect(opt.risk).toBeTruthy();
    }
  });

  it("recommended option is partner_adapter", () => {
    expect(RECOMMENDED_OPTION).toBe("partner_adapter");
  });

  it("partner_adapter has lowest risk", () => {
    expect(ARCHITECTURE_OPTIONS.partner_adapter.risk).toBe("low");
  });

  it("direct_send has highest risk", () => {
    expect(ARCHITECTURE_OPTIONS.direct_send.risk).toBe("high");
  });

  it("architecture decision has rationale", () => {
    expect(ARCHITECTURE_DECISION.rationale).toBeTruthy();
    expect(ARCHITECTURE_DECISION.recommended).toBe("partner_adapter");
    expect(ARCHITECTURE_DECISION.fallback).toBe("validated_export");
  });

  it("architecture decision has security requirements", () => {
    expect(ARCHITECTURE_DECISION.security_requirements.length).toBeGreaterThan(0);
    expect(ARCHITECTURE_DECISION.security_requirements.some((r) => r.includes("TLS"))).toBe(true);
  });

  it("architecture decision has audit requirements", () => {
    expect(ARCHITECTURE_DECISION.audit_requirements.length).toBeGreaterThan(0);
  });

  it("architecture decision has trust boundary", () => {
    expect(ARCHITECTURE_DECISION.trust_boundary).toBeTruthy();
  });
});

describe("eFiling — Filing Package Factory (P1-EFILE-002)", () => {
  it("creates package with correct defaults", () => {
    const pkg = createFilingPackage({
      case_slug: "legal/cases/123",
      brain_id: "brain-1",
      org_id: "org-1",
      channel: "beA",
      created_by: "lawyer@test",
    });
    expect(pkg.id).toBeTruthy();
    expect(pkg.status).toBe("draft");
    expect(pkg.priority).toBe("normal");
    expect(pkg.documents).toEqual([]);
    expect(pkg.receipts).toEqual([]);
    expect(pkg.retry_count).toBe(0);
    expect(pkg.max_retries).toBe(3);
    expect(pkg.audit_entries).toHaveLength(1);
    expect(pkg.audit_entries[0].action).toBe("created");
  });

  it("creates document with correct defaults", () => {
    const doc = createFilingDocument({
      title: "Test.pdf",
      file_path: "/test.pdf",
      file_hash: "hash123",
      mime_type: "application/pdf",
      size_bytes: 1000,
      is_main_document: true,
    });
    expect(doc.id).toBeTruthy();
    expect(doc.signature_status).toBe("unsigned");
    expect(doc.is_main_document).toBe(true);
    expect(doc.is_attachment).toBe(false);
  });
});

describe("eFiling — State Transitions", () => {
  it("submitForApproval changes status", () => {
    const pkg = createTestPackage();
    const updated = submitForApproval(pkg, "lawyer@test");
    expect(updated.status).toBe("pending_approval");
    expect(updated.audit_entries).toHaveLength(2);
  });

  it("approveFiling sets approved_by and status", () => {
    const pkg = createTestPackage({ status: "pending_approval" });
    const updated = approveFiling(pkg, "partner@test");
    expect(updated.status).toBe("approved");
    expect(updated.approved_by).toBe("partner@test");
    expect(updated.approved_at).toBeTruthy();
  });

  it("sendFiling sets middleware_reference and sent_at", () => {
    const pkg = createTestPackage({ status: "approved" });
    const updated = sendFiling(pkg, "mw-ref-123");
    expect(updated.status).toBe("sending");
    expect(updated.middleware_reference).toBe("mw-ref-123");
    expect(updated.sent_at).toBeTruthy();
  });

  it("confirmReceipt with success sets status to sent", () => {
    const pkg = createTestPackage({ status: "sending" });
    const receipt = createTestReceipt(true);
    const updated = confirmReceipt(pkg, receipt);
    expect(updated.status).toBe("sent");
    expect(updated.receipts).toHaveLength(1);
  });

  it("confirmReceipt with failure sets status to failed", () => {
    const pkg = createTestPackage({ status: "sending" });
    const receipt = createTestReceipt(false);
    const updated = confirmReceipt(pkg, receipt);
    expect(updated.status).toBe("failed");
    expect(updated.receipts).toHaveLength(1);
  });

  it("retryFiling increments retry_count", () => {
    const pkg = createTestPackage({ status: "failed", retry_count: 0 });
    const updated = retryFiling(pkg);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("retrying");
    expect(updated!.retry_count).toBe(1);
  });

  it("retryFiling returns null when max retries reached", () => {
    const pkg = createTestPackage({ status: "failed", retry_count: 3, max_retries: 3 });
    expect(retryFiling(pkg)).toBeNull();
  });

  it("cancelFiling sets status to cancelled", () => {
    const pkg = createTestPackage({ status: "draft" });
    const updated = cancelFiling(pkg, "lawyer@test", "Not needed");
    expect(updated.status).toBe("cancelled");
  });

  it("audit entries track status transitions", () => {
    let pkg = createTestPackage();
    pkg = submitForApproval(pkg, "lawyer@test");
    pkg = approveFiling(pkg, "partner@test");
    expect(pkg.audit_entries).toHaveLength(3);
    expect(pkg.audit_entries[1].previous_status).toBe("draft");
    expect(pkg.audit_entries[1].new_status).toBe("pending_approval");
    expect(pkg.audit_entries[2].previous_status).toBe("pending_approval");
    expect(pkg.audit_entries[2].new_status).toBe("approved");
  });
});

describe("eFiling — Validation", () => {
  it("validates a correct package", () => {
    const pkg = createTestPackage();
    const result = validateFilingPackage(pkg);
    expect(result.valid).toBe(true);
  });

  it("detects missing documents", () => {
    const pkg = createTestPackage();
    pkg.documents = [];
    const result = validateFilingPackage(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("document"))).toBe(true);
  });

  it("detects missing main document", () => {
    const pkg = createTestPackage();
    pkg.documents[0].is_main_document = false;
    pkg.documents[0].is_attachment = true;
    const result = validateFilingPackage(pkg);
    expect(result.valid).toBe(false);
  });

  it("detects fristgebunden without deadline", () => {
    const pkg = createTestPackage({ priority: "fristgebunden" });
    pkg.deadline_date = undefined;
    const result = validateFilingPackage(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("deadline"))).toBe(true);
  });

  it("warns about unsigned main document", () => {
    const pkg = createTestPackage();
    const result = validateFilingPackage(pkg);
    expect(result.warnings.some((w) => w.includes("unsigned"))).toBe(true);
  });

  it("detects sent without receipt", () => {
    const pkg = createTestPackage({ status: "sent" });
    const result = validateFilingPackage(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("receipt"))).toBe(true);
  });

  it("warns about beA without court", () => {
    const pkg = createTestPackage();
    pkg.court = undefined;
    const result = validateFilingPackage(pkg);
    expect(result.warnings.some((w) => w.includes("court"))).toBe(true);
  });
});

describe("eFiling — Helpers", () => {
  it("getFilingStatusLabel returns German labels", () => {
    expect(getFilingStatusLabel("draft")).toBe("Entwurf");
    expect(getFilingStatusLabel("sent")).toBe("Gesendet");
    expect(getFilingStatusLabel("failed")).toBe("Fehlgeschlagen");
  });

  it("getChannelLabel returns labels", () => {
    expect(getChannelLabel("beA")).toContain("beA");
    expect(getChannelLabel("ERV")).toContain("ERV");
  });

  it("isTerminalStatus identifies terminal states", () => {
    expect(isTerminalStatus("sent")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("draft")).toBe(false);
    expect(isTerminalStatus("failed")).toBe(false);
  });

  it("canRetry checks retry conditions", () => {
    expect(canRetry(createTestPackage({ status: "failed", retry_count: 0 }))).toBe(true);
    expect(canRetry(createTestPackage({ status: "failed", retry_count: 3, max_retries: 3 }))).toBe(
      false
    );
    expect(canRetry(createTestPackage({ status: "sent" }))).toBe(false);
  });

  it("getFilingDocumentsByType filters correctly", () => {
    const pkg = createTestPackage();
    const attachment = createFilingDocument({
      title: "Anlage.pdf",
      file_path: "/anlage.pdf",
      file_hash: "def456",
      mime_type: "application/pdf",
      size_bytes: 10000,
      is_main_document: false,
    });
    pkg.documents.push(attachment);
    expect(getFilingDocumentsByType(pkg, true)).toHaveLength(1);
    expect(getFilingDocumentsByType(pkg, false)).toHaveLength(1);
  });
});
