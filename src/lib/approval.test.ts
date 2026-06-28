// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  ActionType,
  ApprovalStatus,
  REQUIRES_APPROVAL,
  requiresApproval,
  ACTION_LABELS,
  agentActionFrontmatter,
} from "./approval";

const ALL_ACTION_TYPES: ActionType[] = [
  "document_finalize",
  "deadline_create",
  "booking_create",
  "message_send",
  "case_create",
  "case_close",
  "invoice_create",
  "client_message_send",
  "document_request_send",
  "deadline_confirm",
  "time_entry_approval",
];

// ── REQUIRES_APPROVAL ───────────────────────────────────────────────────

describe("REQUIRES_APPROVAL", () => {
  test("contains all action types", () => {
    expect(REQUIRES_APPROVAL.size).toBe(ALL_ACTION_TYPES.length);
    for (const t of ALL_ACTION_TYPES) {
      expect(REQUIRES_APPROVAL.has(t)).toBe(true);
    }
  });

  test("is a ReadonlySet", () => {
    expect(REQUIRES_APPROVAL).toBeInstanceOf(Set);
  });
});

// ── requiresApproval ────────────────────────────────────────────────────

describe("requiresApproval", () => {
  test("returns true for document_finalize", () => {
    expect(requiresApproval("document_finalize")).toBe(true);
  });

  test("returns true for deadline_create", () => {
    expect(requiresApproval("deadline_create")).toBe(true);
  });

  test("returns true for booking_create", () => {
    expect(requiresApproval("booking_create")).toBe(true);
  });

  test("returns true for message_send", () => {
    expect(requiresApproval("message_send")).toBe(true);
  });

  test("returns true for ALL defined ActionTypes (all require approval)", () => {
    for (const t of ALL_ACTION_TYPES) {
      expect(requiresApproval(t)).toBe(true);
    }
  });
});

// ── ACTION_LABELS ───────────────────────────────────────────────────────

describe("ACTION_LABELS", () => {
  test("has a label for every ActionType", () => {
    for (const t of ALL_ACTION_TYPES) {
      expect(ACTION_LABELS[t]).toBeDefined();
      expect(typeof ACTION_LABELS[t]).toBe("string");
      expect(ACTION_LABELS[t].length).toBeGreaterThan(0);
    }
  });

  test("document_finalize → 'Schriftsatz freigeben'", () => {
    expect(ACTION_LABELS.document_finalize).toBe("Schriftsatz freigeben");
  });

  test("deadline_create → 'Frist notieren'", () => {
    expect(ACTION_LABELS.deadline_create).toBe("Frist notieren");
  });

  test("booking_create → 'Buchung anlegen'", () => {
    expect(ACTION_LABELS.booking_create).toBe("Buchung anlegen");
  });

  test("message_send → 'Nachricht versenden'", () => {
    expect(ACTION_LABELS.message_send).toBe("Nachricht versenden");
  });

  test("number of labels matches number of ActionTypes", () => {
    expect(Object.keys(ACTION_LABELS)).toHaveLength(ALL_ACTION_TYPES.length);
  });
});

// ── agentActionFrontmatter ──────────────────────────────────────────────

describe("agentActionFrontmatter", () => {
  test("creates pending frontmatter with required fields", () => {
    const fm = agentActionFrontmatter({
      action_type: "document_finalize",
      proposed_by: "agent-legal-drafting",
      summary: "Klageentwurf Akte 2026-014 freigeben",
    });

    expect(fm.type).toBe("agent_action");
    expect(fm.action_type).toBe("document_finalize");
    expect(fm.status).toBe("pending");
    expect(fm.proposed_by).toBe("agent-legal-drafting");
    expect(fm.summary).toBe("Klageentwurf Akte 2026-014 freigeben");
    expect(fm.proposed_at).toBeDefined();
    expect(typeof fm.proposed_at).toBe("string");
  });

  test("sets proposed_at as ISO string", () => {
    const fm = agentActionFrontmatter({
      action_type: "deadline_create",
      proposed_by: "ai-deadline-detect",
      summary: "Berufungsfrist 2026-07-01",
    });

    expect(fm.proposed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("uses custom date when provided", () => {
    const customDate = new Date("2026-06-15T10:30:00Z");
    const fm = agentActionFrontmatter({
      action_type: "booking_create",
      proposed_by: "datev-export-agent",
      summary: "DATEV-Buchung Juni 2026",
      at: customDate,
    });

    expect(fm.proposed_at).toBe("2026-06-15T10:30:00.000Z");
  });

  test("uses current date when 'at' is not provided", () => {
    const before = new Date().toISOString();
    const fm = agentActionFrontmatter({
      action_type: "message_send",
      proposed_by: "bea-agent",
      summary: "beA-Nachricht an Gericht",
    });
    const after = new Date().toISOString();

    expect(fm.proposed_at >= before).toBe(true);
    expect(fm.proposed_at <= after).toBe(true);
  });

  test("includes target_slug when provided", () => {
    const fm = agentActionFrontmatter({
      action_type: "document_finalize",
      proposed_by: "agent",
      summary: "test",
      target_slug: "cases/2026-014/drafts/klage",
    });

    expect(fm.target_slug).toBe("cases/2026-014/drafts/klage");
  });

  test("target_slug is undefined when not provided", () => {
    const fm = agentActionFrontmatter({
      action_type: "document_finalize",
      proposed_by: "agent",
      summary: "test",
    });

    expect(fm.target_slug).toBeUndefined();
  });

  test("does not include decided_at, decided_by, reject_reason (pending state)", () => {
    const fm = agentActionFrontmatter({
      action_type: "deadline_create",
      proposed_by: "agent",
      summary: "test",
    });

    expect(fm.decided_at).toBeUndefined();
    expect(fm.decided_by).toBeUndefined();
    expect(fm.reject_reason).toBeUndefined();
  });

  test("returns a plain object (Record<string, unknown>)", () => {
    const fm = agentActionFrontmatter({
      action_type: "booking_create",
      proposed_by: "agent",
      summary: "test",
    });

    expect(typeof fm).toBe("object");
    expect(fm.constructor).toBe(Object);
  });

  test("spreads frontmatter (returned object is a copy, not frozen)", () => {
    const fm = agentActionFrontmatter({
      action_type: "message_send",
      proposed_by: "agent",
      summary: "test",
    });

    // Should be mutable (not frozen)
    fm.status = "approved";
    expect(fm.status).toBe("approved");
  });

  test("works with all action types", () => {
    for (const action_type of ALL_ACTION_TYPES) {
      const fm = agentActionFrontmatter({
        action_type,
        proposed_by: "test-agent",
        summary: `Test ${action_type}`,
      });
      expect(fm.action_type).toBe(action_type);
      expect(fm.type).toBe("agent_action");
      expect(fm.status).toBe("pending");
    }
  });

  test("preserves unicode in summary", () => {
    const fm = agentActionFrontmatter({
      action_type: "document_finalize",
      proposed_by: "agent",
      summary: "Klageentwurf — Müller vs. Schmidt § 433 BGB",
    });

    expect(fm.summary).toBe("Klageentwurf — Müller vs. Schmidt § 433 BGB");
  });

  test("preserves unicode in proposed_by", () => {
    const fm = agentActionFrontmatter({
      action_type: "document_finalize",
      proposed_by: "Kanzlei-Müler-Agent",
      summary: "test",
    });

    expect(fm.proposed_by).toBe("Kanzlei-Müler-Agent");
  });

  test("handles empty summary", () => {
    const fm = agentActionFrontmatter({
      action_type: "document_finalize",
      proposed_by: "agent",
      summary: "",
    });

    expect(fm.summary).toBe("");
  });

  test("handles very long summary", () => {
    const longSummary = "A".repeat(10000);
    const fm = agentActionFrontmatter({
      action_type: "document_finalize",
      proposed_by: "agent",
      summary: longSummary,
    });

    expect(fm.summary).toBe(longSummary);
  });

  test("handles long target_slug", () => {
    const longSlug = "cases/" + "x".repeat(500);
    const fm = agentActionFrontmatter({
      action_type: "document_finalize",
      proposed_by: "agent",
      summary: "test",
      target_slug: longSlug,
    });

    expect(fm.target_slug).toBe(longSlug);
  });
});

// ── Type safety & invariants ────────────────────────────────────────────

describe("Type invariants", () => {
  test("ApprovalStatus has exactly 3 values", () => {
    const statuses: ApprovalStatus[] = ["pending", "approved", "rejected"];
    expect(new Set(statuses).size).toBe(3);
  });

  test("every ActionType has a matching label", () => {
    for (const t of ALL_ACTION_TYPES) {
      expect(ACTION_LABELS[t]).toBeTruthy();
    }
  });

  test("every ActionType requires approval (human oversight is mandatory)", () => {
    for (const t of ALL_ACTION_TYPES) {
      expect(requiresApproval(t)).toBe(true);
    }
  });

  test("agentActionFrontmatter always creates status=pending (never approved/rejected)", () => {
    for (const action_type of ALL_ACTION_TYPES) {
      const fm = agentActionFrontmatter({
        action_type,
        proposed_by: "test",
        summary: "test",
      });
      expect(fm.status).toBe("pending");
    }
  });
});
