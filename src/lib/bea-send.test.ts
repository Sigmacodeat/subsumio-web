import { describe, test, expect } from "vitest";
import {
  createFilingPackage,
  submitForApproval,
  approveFiling,
  sendFiling,
  confirmReceipt,
  retryFiling,
  cancelFiling,
  validateFilingPackage,
  canRetry,
  isTerminalStatus,
  getFilingStatusLabel,
  type FilingPackage,
  type FilingReceipt,
} from "./efiling-architecture";

describe("beA Send — Filing State Machine", () => {
  const baseParams = {
    case_slug: "legal/cases/2026-001",
    brain_id: "brain-1",
    org_id: "org-1",
    channel: "beA" as const,
    created_by: "ra.mueller@kanzlei.de",
  };

  test("createFilingPackage initializes with draft status", () => {
    const pkg = createFilingPackage(baseParams);
    expect(pkg.status).toBe("draft");
    expect(pkg.documents).toEqual([]);
    expect(pkg.receipts).toEqual([]);
    expect(pkg.retry_count).toBe(0);
    expect(pkg.max_retries).toBe(3);
    expect(pkg.audit_entries).toHaveLength(1);
    expect(pkg.audit_entries[0].action).toBe("created");
  });

  test("submitForApproval transitions draft → pending_approval", () => {
    const pkg = createFilingPackage(baseParams);
    const submitted = submitForApproval(pkg, "ra.mueller@kanzlei.de");
    expect(submitted.status).toBe("pending_approval");
    expect(submitted.audit_entries).toHaveLength(2);
    expect(submitted.audit_entries[1].action).toBe("submit_for_approval");
    expect(submitted.audit_entries[1].previous_status).toBe("draft");
    expect(submitted.audit_entries[1].new_status).toBe("pending_approval");
  });

  test("approveFiling transitions pending_approval → approved", () => {
    const pkg = createFilingPackage(baseParams);
    const approved = approveFiling(submitForApproval(pkg, "user"), "approver");
    expect(approved.status).toBe("approved");
    expect(approved.approved_by).toBe("approver");
    expect(approved.approved_at).toBeDefined();
  });

  test("sendFiling transitions approved → sending", () => {
    const pkg = createFilingPackage(baseParams);
    const approved = approveFiling(submitForApproval(pkg, "user"), "approver");
    const sending = sendFiling(approved, "middleware-ref-123");
    expect(sending.status).toBe("sending");
    expect(sending.middleware_reference).toBe("middleware-ref-123");
    expect(sending.sent_at).toBeDefined();
  });

  test("confirmReceipt with success transitions sending → sent", () => {
    const pkg = createFilingPackage(baseParams);
    const sending = sendFiling(approveFiling(submitForApproval(pkg, "user"), "approver"), "ref");
    const receipt: FilingReceipt = {
      receipt_id: "receipt-1",
      received_at: new Date().toISOString(),
      received_by: "middleware",
      confirmation_code: "CONF-2026-001",
      is_success: true,
    };
    const sent = confirmReceipt(sending, receipt);
    expect(sent.status).toBe("sent");
    expect(sent.receipts).toHaveLength(1);
    expect(sent.receipts[0].confirmation_code).toBe("CONF-2026-001");
  });

  test("confirmReceipt with failure transitions sending → failed", () => {
    const pkg = createFilingPackage(baseParams);
    const sending = sendFiling(approveFiling(submitForApproval(pkg, "user"), "approver"), "ref");
    const receipt: FilingReceipt = {
      receipt_id: "receipt-1",
      received_at: new Date().toISOString(),
      received_by: "middleware",
      confirmation_code: "",
      is_success: false,
      error_code: "REJECTED",
      error_message: "Invalid signature",
    };
    const failed = confirmReceipt(sending, receipt);
    expect(failed.status).toBe("failed");
    expect(failed.receipts[0].error_code).toBe("REJECTED");
  });

  test("retryFiling transitions failed → retrying and increments count", () => {
    const pkg = createFilingPackage(baseParams);
    const sending = sendFiling(approveFiling(submitForApproval(pkg, "user"), "approver"), "ref");
    const failed = confirmReceipt(sending, {
      receipt_id: "r1",
      received_at: new Date().toISOString(),
      received_by: "mw",
      confirmation_code: "",
      is_success: false,
    });
    const retrying = retryFiling(failed);
    expect(retrying).not.toBeNull();
    expect(retrying!.status).toBe("retrying");
    expect(retrying!.retry_count).toBe(1);
  });

  test("retryFiling returns null when max retries exceeded", () => {
    const pkg = createFilingPackage({ ...baseParams });
    const sending = sendFiling(approveFiling(submitForApproval(pkg, "user"), "approver"), "ref");
    let failed = confirmReceipt(sending, {
      receipt_id: "r1",
      received_at: new Date().toISOString(),
      received_by: "mw",
      confirmation_code: "",
      is_success: false,
    });
    // Exhaust retries
    for (let i = 0; i < 3; i++) {
      const r = retryFiling(failed);
      expect(r).not.toBeNull();
      failed = confirmReceipt(r!, {
        receipt_id: `r${i + 2}`,
        received_at: new Date().toISOString(),
        received_by: "mw",
        confirmation_code: "",
        is_success: false,
      });
    }
    expect(retryFiling(failed)).toBeNull();
  });

  test("cancelFiling transitions to cancelled", () => {
    const pkg = createFilingPackage(baseParams);
    const cancelled = cancelFiling(pkg, "user", "Manuell abgebrochen");
    expect(cancelled.status).toBe("cancelled");
  });
});

describe("beA Send — Validation", () => {
  test("validateFilingPackage rejects empty documents", () => {
    const pkg = createFilingPackage({
      case_slug: "case-1",
      brain_id: "brain-1",
      org_id: "org-1",
      channel: "beA",
      created_by: "user",
    });
    const validation = validateFilingPackage(pkg);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("At least one document is required");
  });

  test("validateFilingPackage requires approved_by for approved status", () => {
    const pkg = createFilingPackage({
      case_slug: "case-1",
      brain_id: "brain-1",
      org_id: "org-1",
      channel: "beA",
      created_by: "user",
    });
    const fakeApproved: FilingPackage = {
      ...pkg,
      status: "approved",
    };
    const validation = validateFilingPackage(fakeApproved);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("Approved filing must have approved_by");
  });

  test("validateFilingPackage requires deadline_date for fristgebunden", () => {
    const pkg = createFilingPackage({
      case_slug: "case-1",
      brain_id: "brain-1",
      org_id: "org-1",
      channel: "beA",
      priority: "fristgebunden",
      created_by: "user",
    });
    const validation = validateFilingPackage(pkg);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("Fristgebunden filing must have a deadline_date");
  });

  test("validateFilingPackage warns about unsigned main documents", () => {
    const pkg = createFilingPackage({
      case_slug: "case-1",
      brain_id: "brain-1",
      org_id: "org-1",
      channel: "beA",
      created_by: "user",
    });
    pkg.documents.push({
      id: "doc-1",
      title: "Klage",
      file_path: "/docs/klage.pdf",
      file_hash: "abc123",
      mime_type: "application/pdf",
      size_bytes: 50000,
      signature_status: "unsigned",
      is_main_document: true,
      is_attachment: false,
      sort_order: 0,
    });
    const validation = validateFilingPackage(pkg);
    expect(validation.warnings).toContain('Main document "Klage" is unsigned');
  });
});

describe("beA Send — Helpers", () => {
  test("canRetry returns true only for failed with remaining retries", () => {
    const pkg = createFilingPackage({
      case_slug: "c",
      brain_id: "b",
      org_id: "o",
      channel: "beA",
      created_by: "u",
    });
    expect(canRetry(pkg)).toBe(false); // draft, not failed

    const failed: FilingPackage = { ...pkg, status: "failed", retry_count: 0, max_retries: 3 };
    expect(canRetry(failed)).toBe(true);

    const exhausted: FilingPackage = { ...pkg, status: "failed", retry_count: 3, max_retries: 3 };
    expect(canRetry(exhausted)).toBe(false);
  });

  test("isTerminalStatus identifies sent and cancelled", () => {
    expect(isTerminalStatus("sent")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("draft")).toBe(false);
    expect(isTerminalStatus("approved")).toBe(false);
    expect(isTerminalStatus("sending")).toBe(false);
    expect(isTerminalStatus("failed")).toBe(false);
  });

  test("getFilingStatusLabel returns German labels", () => {
    expect(getFilingStatusLabel("draft")).toBe("Entwurf");
    expect(getFilingStatusLabel("sent")).toBe("Gesendet");
    expect(getFilingStatusLabel("failed")).toBe("Fehlgeschlagen");
    expect(getFilingStatusLabel("cancelled")).toBe("Abgebrochen");
  });
});
