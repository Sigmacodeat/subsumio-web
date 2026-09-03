import { describe, expect, it } from "vitest";
import {
  buildWorkItems,
  attentionScore,
  isDueTodayOrOverdue,
  isOverdue,
  type WorkItem,
} from "./work-items";

const page = (slug: string, type: string, frontmatter: Record<string, unknown>) => ({
  slug,
  title: slug,
  type,
  content: "Zusammenfassung",
  frontmatter,
  created_at: "2026-08-24T10:00:00.000Z",
  updated_at: "2026-08-24T10:00:00.000Z",
});

describe("buildWorkItems", () => {
  it("handles malformed frontmatter without crashing", () => {
    const items = buildWorkItems({
      client_submission: [
        page("empty-fm", "client_submission", {}),
        page("null-fm", "client_submission", { extraction_status: null }),
        page("wrong-type", "client_submission", { extraction_status: 42 }),
        page("whitespace", "client_submission", { extraction_status: "  " }),
        page("unknown-status", "client_submission", { extraction_status: "unknown_value" }),
        page("empty-string", "client_submission", { extraction_status: "" }),
      ],
      pipeline_state: [
        page("bad-state", "pipeline_state", { status: "totally_invalid" }),
        page("null-state", "pipeline_state", { status: null }),
        page("empty-state", "pipeline_state", {}),
      ],
      chat_inbox: [
        page("no-fm", "chat_inbox", {}),
        page("unicode-title", "chat_inbox", { priority: "critical", summary: "🎉 <script>" }),
      ],
    });
    // No crash, all items returned with safe defaults.
    const slugs = items.map((i) => i.id);
    expect(slugs).toContain("empty-fm");
    expect(slugs).toContain("wrong-type");
    expect(slugs).toContain("unknown-status");
    expect(slugs).toContain("no-fm");
    expect(slugs).toContain("unicode-title");
    // Invalid pipeline_state pages are filtered out (no valid stage).
    expect(slugs).not.toContain("bad-state");
    expect(slugs).not.toContain("null-state");
    expect(slugs).not.toContain("empty-state");
    // Unknown extraction_status → defaults to "received" stage (actionable).
    const unknown = items.find((i) => i.id === "unknown-status");
    expect(unknown?.pipelineStage).toBe("received");
    // Null/whitespace/empty extraction_status → "received" or "stored".
    const nullFm = items.find((i) => i.id === "null-fm");
    expect(nullFm?.pipelineStage).toBe("received");
  });

  it("handles pages with missing frontmatter entirely", () => {
    const items = buildWorkItems({
      chat_inbox: [
        {
          slug: "no-frontmatter",
          title: "Test",
          type: "chat_inbox",
          content: "x",
          created_at: "",
          updated_at: "",
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.priority).toBe("low");
  });

  it("normalizes open legal work into one priority-sorted queue", () => {
    const items = buildWorkItems({
      chat_inbox: [page("wa-1", "chat_inbox", { read: false, priority: "high" })],
      client_submission: [
        page("doc-1", "client_submission", {
          extraction_status: "processing",
          original_persisted: true,
        }),
      ],
      pipeline_state: [
        page("pipe-1", "pipeline_state", {
          status: "awaiting_review",
          case_ref: "case-42",
          current_layer: 2,
        }),
      ],
      agent_action: [
        page("approval-1", "agent_action", { status: "pending", priority: "critical" }),
      ],
      legal_deadline: [
        page("deadline-1", "legal_deadline", { status: "open", due_date: "2026-08-25" }),
      ],
      appointment: [
        page("appointment-1", "appointment", { status: "scheduled", date: "2026-08-26" }),
      ],
    });

    expect(items.map((item) => item.kind)).toEqual([
      "approval",
      "communication",
      "case_analysis",
      "document_review",
      "deadline",
      "appointment",
    ]);
    const doc = items.find((item) => item.kind === "document_review");
    expect(doc?.pipelineStage).toBe("ocr");
    const analysis = items.find((item) => item.kind === "case_analysis");
    expect(analysis?.pipelineStage).toBe("awaiting_review");
    expect(analysis?.priority).toBe("high");
    expect(analysis?.currentLayer).toBe(2);
  });

  it("maps document lifecycle stages from real frontmatter fields", () => {
    const items = buildWorkItems({
      client_submission: [
        page("stored", "client_submission", { original_persisted: true }),
        page("ocr", "client_submission", {
          extraction_status: "processing",
          original_persisted: true,
        }),
        page("embedding", "client_submission", {
          extraction_status: "ready",
          embedding_status: "pending",
        }),
        page("embedded", "client_submission", {
          extraction_status: "ready",
          embedding_status: "ready",
        }),
        page("failed", "client_submission", {
          extraction_status: "failed",
          extraction_error_code: "password_required",
        }),
      ],
    });
    const bySlug = new Map(items.map((i) => [i.id, i]));
    expect(bySlug.get("stored")?.pipelineStage).toBe("stored");
    expect(bySlug.get("ocr")?.pipelineStage).toBe("ocr");
    expect(bySlug.get("embedding")?.pipelineStage).toBe("embedding");
    expect(bySlug.get("failed")?.pipelineStage).toBe("failed");
    expect(bySlug.get("failed")?.error).toBe("password_required");
    // Terminal "embedded" documents must NOT appear as work items.
    expect(bySlug.has("embedded")).toBe(false);
  });

  it("surfaces failed and review-pending pipeline_state pages with correct priority", () => {
    const items = buildWorkItems({
      pipeline_state: [
        page("ps-failed", "pipeline_state", { status: "failed", case_ref: "c1" }),
        page("ps-review", "pipeline_state", { status: "awaiting_review", case_ref: "c2" }),
        page("ps-human", "pipeline_state", { status: "needs_human_review", case_ref: "c3" }),
        page("ps-running", "pipeline_state", {
          status: "running",
          case_ref: "c4",
          current_layer: 4,
        }),
        page("ps-done", "pipeline_state", { status: "completed", case_ref: "c5" }),
        page("ps-warn", "pipeline_state", { status: "completed_with_warnings", case_ref: "c6" }),
      ],
    });
    const bySlug = new Map(items.map((i) => [i.id, i]));
    expect(bySlug.get("ps-failed")?.priority).toBe("critical");
    expect(bySlug.get("ps-review")?.priority).toBe("high");
    expect(bySlug.get("ps-human")?.priority).toBe("high");
    expect(bySlug.get("ps-running")?.priority).toBe("low");
    expect(bySlug.get("ps-running")?.currentLayer).toBe(4);
    // Terminal pipeline states must NOT appear.
    expect(bySlug.has("ps-done")).toBe(false);
    expect(bySlug.has("ps-warn")).toBe(false);
  });

  it("excludes terminal submissions, approvals, deadlines and appointments", () => {
    expect(
      buildWorkItems({
        client_submission: [
          page("doc", "client_submission", {
            extraction_status: "ready",
            embedding_status: "ready",
          }),
        ],
        agent_action: [page("approval", "agent_action", { status: "approved" })],
        legal_deadline: [page("deadline", "legal_deadline", { status: "done" })],
        appointment: [page("appointment", "appointment", { status: "cancelled" })],
      })
    ).toHaveLength(0);
  });
});

const baseItem = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  id: "test",
  kind: "communication",
  title: "Test",
  summary: "",
  sourceSlug: "src",
  priority: "low",
  status: "open",
  createdAt: "2026-08-24T10:00:00.000Z",
  ...overrides,
});

describe("attentionScore", () => {
  const today = new Date("2026-08-24T10:00:00.000Z");

  it("scores overdue items highest", () => {
    const overdue = baseItem({ kind: "deadline", priority: "critical", dueAt: "2026-08-20" });
    const todayItem = baseItem({ kind: "deadline", priority: "critical", dueAt: "2026-08-24" });
    expect(attentionScore(overdue, today)).toBeGreaterThan(attentionScore(todayItem, today));
  });

  it("scores failed pipelines above routine items", () => {
    const failed = baseItem({ kind: "document_review", pipelineStage: "failed", status: "failed" });
    const routine = baseItem({ kind: "communication", status: "open" });
    expect(attentionScore(failed, today)).toBeGreaterThan(attentionScore(routine, today));
  });

  it("scores approvals above deadlines (consequence weight)", () => {
    const approval = baseItem({ kind: "approval", priority: "high", dueAt: "2026-08-24" });
    const deadline = baseItem({ kind: "deadline", priority: "high", dueAt: "2026-08-24" });
    expect(attentionScore(approval, today)).toBeGreaterThan(attentionScore(deadline, today));
  });

  it("scores items due this week above items due later", () => {
    const thisWeek = baseItem({ kind: "deadline", dueAt: "2026-08-27" });
    const later = baseItem({ kind: "deadline", dueAt: "2026-12-31" });
    expect(attentionScore(thisWeek, today)).toBeGreaterThan(attentionScore(later, today));
  });

  it("scores items with no due date lowest", () => {
    const noDate = baseItem({ kind: "communication" });
    const withDate = baseItem({ kind: "communication", dueAt: "2026-12-31" });
    expect(attentionScore(noDate, today)).toBeLessThan(attentionScore(withDate, today));
  });

  it("critical priority boosts score above low priority", () => {
    const critical = baseItem({ kind: "deadline", priority: "critical", dueAt: "2026-08-24" });
    const low = baseItem({ kind: "deadline", priority: "low", dueAt: "2026-08-24" });
    expect(attentionScore(critical, today)).toBeGreaterThan(attentionScore(low, today));
  });
});

describe("isDueTodayOrOverdue", () => {
  const today = new Date("2026-08-24T10:00:00.000Z");

  it("returns true for overdue items", () => {
    expect(isDueTodayOrOverdue(baseItem({ dueAt: "2026-08-20" }), today)).toBe(true);
  });

  it("returns true for items due today", () => {
    expect(isDueTodayOrOverdue(baseItem({ dueAt: "2026-08-24" }), today)).toBe(true);
  });

  it("returns false for items due tomorrow", () => {
    expect(isDueTodayOrOverdue(baseItem({ dueAt: "2026-08-25" }), today)).toBe(false);
  });

  it("returns false for items without dueAt", () => {
    expect(isDueTodayOrOverdue(baseItem({}), today)).toBe(false);
  });
});

describe("isOverdue", () => {
  const today = new Date("2026-08-24T10:00:00.000Z");

  it("returns true for past dates", () => {
    expect(isOverdue(baseItem({ dueAt: "2026-08-20" }), today)).toBe(true);
  });

  it("returns false for today (not strictly overdue)", () => {
    expect(isOverdue(baseItem({ dueAt: "2026-08-24" }), today)).toBe(false);
  });

  it("returns false for future dates", () => {
    expect(isOverdue(baseItem({ dueAt: "2026-08-25" }), today)).toBe(false);
  });

  it("returns false for items without dueAt", () => {
    expect(isOverdue(baseItem({}), today)).toBe(false);
  });
});
