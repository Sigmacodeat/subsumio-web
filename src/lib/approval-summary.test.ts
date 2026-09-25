import { describe, expect, it } from "vitest";
import { buildApprovalSummary } from "./approval-summary";
import type { ReviewInboxItem } from "./review-inbox-items";

function inbox(type: ReviewInboxItem["type"], priority: ReviewInboxItem["priority"] = "medium") {
  return {
    type,
    priority,
    title: `${type}-${priority}`,
    description: "",
    caseTitle: "Akte A",
  } as ReviewInboxItem;
}

const page = (fm: Record<string, unknown>, title = "p") => ({
  slug: title,
  title,
  frontmatter: fm,
});

describe("buildApprovalSummary", () => {
  it("counts case scan results as their own review category", () => {
    const s = buildApprovalSummary({
      inbox: [inbox("case_scan_finding"), inbox("case_scan_finding")],
      agentActions: [],
      analyses: [],
      timeSuggestions: [],
      userEmail: "me@example.com",
    });
    const by = Object.fromEntries(s.categories.map((c) => [c.key, c]));
    expect(by.case_scans.count).toBe(2);
    expect(by.case_scans.href).toBe("/dashboard/communications?view=review");
    expect(s.total).toBe(2);
  });

  it("groups review-inbox items so each category matches the list it links to", () => {
    const s = buildApprovalSummary({
      inbox: [
        inbox("suggested_deadline", "high"),
        inbox("suggested_deadline"),
        inbox("client_submission"),
        inbox("suggested_party"),
        inbox("pending_fact"),
        inbox("document_request"),
      ],
      agentActions: [],
      analyses: [],
      timeSuggestions: [],
      userEmail: "me@example.com",
    });
    const by = Object.fromEntries(s.categories.map((c) => [c.key, c]));
    expect(by.deadlines.count).toBe(2);
    expect(by.deadlines.urgent).toBe(1);
    expect(by.deadlines.preview[0].urgent).toBe(true);
    expect(by.client_input.count).toBe(3);
    expect(by.requests.count).toBe(1);
    expect(s.total).toBe(6);
    expect(s.urgent).toBe(1);
    expect(s.unavailable).toEqual([]);
  });

  it("counts only pending agent actions and analyses awaiting review", () => {
    const s = buildApprovalSummary({
      inbox: [],
      agentActions: [page({ status: "pending" }), page({}), page({ status: "approved" })],
      analyses: [
        page({ status: "awaiting_review" }),
        page({ status: "needs_human_review" }),
        page({ status: "done" }),
      ],
      timeSuggestions: [],
      userEmail: "me@example.com",
    });
    const by = Object.fromEntries(s.categories.map((c) => [c.key, c]));
    expect(by.agent_actions.count).toBe(2);
    expect(by.analyses.count).toBe(2);
    expect(by.analyses.urgent).toBe(1);
  });

  it("counts only the user's own open time suggestions", () => {
    const s = buildApprovalSummary({
      inbox: [],
      agentActions: [],
      analyses: [],
      timeSuggestions: [
        page({ status: "suggested", user_email: "Me@Example.com", duration_minutes: 30 }),
        page({ status: "suggested", user_email: "colleague@example.com" }),
        page({ status: "accepted", user_email: "me@example.com" }),
      ],
      userEmail: "me@example.com",
    });
    expect(s.categories.find((c) => c.key === "time")?.count).toBe(1);
    expect(s.total).toBe(1);
  });

  it("reports unreadable sources instead of a silent zero", () => {
    const s = buildApprovalSummary({
      inbox: null,
      agentActions: [],
      analyses: null,
      timeSuggestions: [],
      userEmail: "me@example.com",
    });
    expect(s.unavailable).toEqual([
      "deadlines",
      "client_input",
      "requests",
      "case_scans",
      "analyses",
    ]);
  });

  it("caps the preview at three items", () => {
    const s = buildApprovalSummary({
      inbox: Array.from({ length: 5 }, () => inbox("suggested_deadline")),
      agentActions: [],
      analyses: [],
      timeSuggestions: [],
      userEmail: "me@example.com",
    });
    const d = s.categories.find((c) => c.key === "deadlines")!;
    expect(d.count).toBe(5);
    expect(d.preview).toHaveLength(3);
  });
});
