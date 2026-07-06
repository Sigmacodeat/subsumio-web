/**
 * insights-engine.test.ts — Tests for TODO 8: Insights-Engine
 */
import { describe, it, expect } from "vitest";
import {
  generateInsights,
  filterActiveInsights,
  type InsightInput,
  type Insight,
} from "@/lib/insights-engine";

const baseInput: InsightInput = {
  cases: [],
  judgements: [],
  recentDocuments: [],
};

describe("TODO 8: Insights-Engine", () => {
  it("returns empty array for empty input", () => {
    const insights = generateInsights(baseInput);
    expect(insights).toEqual([]);
  });

  it("generates judgement match insights when legal_area matches", () => {
    const input: InsightInput = {
      cases: [
        {
          slug: "case-1",
          title: "Müller v. Schmidt",
          frontmatter: {
            status: "open",
            legal_area: "Mietrecht",
            court: "AG Berlin",
          },
        },
      ],
      judgements: [
        {
          slug: "judgement-1",
          title: "BGH Urteil Mietrecht",
          frontmatter: {
            court: "AG Berlin",
            date: new Date().toISOString().split("T")[0],
            legal_area: "Mietrecht",
          },
        },
      ],
    };
    const insights = generateInsights(input);
    const jmInsights = insights.filter((i: Insight) => i.type === "judgement_match");
    expect(jmInsights.length).toBe(1);
    expect(jmInsights[0].caseSlug).toBe("case-1");
    expect(jmInsights[0].title).toBe("BGH Urteil Mietrecht");
  });

  it("skips judgement matches for closed cases", () => {
    const input: InsightInput = {
      cases: [
        {
          slug: "case-closed",
          title: "Closed Case",
          frontmatter: {
            status: "closed",
            legal_area: "Mietrecht",
          },
        },
      ],
      judgements: [
        {
          slug: "j-1",
          title: "Urteil",
          frontmatter: {
            legal_area: "Mietrecht",
            date: new Date().toISOString().split("T")[0],
          },
        },
      ],
    };
    const insights = generateInsights(input);
    expect(insights.filter((i: Insight) => i.type === "judgement_match")).toHaveLength(0);
  });

  it("generates playbook hint when case has timeline but no deadlines", () => {
    const input: InsightInput = {
      cases: [
        {
          slug: "case-2",
          title: "Test Case",
          frontmatter: {
            status: "open",
            timeline: [
              { date: "2026-07-01", title: "Klage eingereicht", type: "event" },
              { date: "2026-07-02", title: "Zustellung", type: "event" },
            ],
          },
        },
      ],
    };
    const insights = generateInsights(input);
    const pbInsights = insights.filter((i: Insight) => i.type === "playbook_hint");
    expect(pbInsights.length).toBe(1);
    expect(pbInsights[0].title).toBe("Keine Fristen gesetzt");
  });

  it("generates critical insight for Notfrist within 3 days", () => {
    const future = new Date();
    future.setDate(future.getDate() + 2);
    const dueDate = future.toISOString().split("T")[0];

    const input: InsightInput = {
      cases: [
        {
          slug: "case-notfrist",
          title: "Notfrist Case",
          frontmatter: {
            status: "open",
            deadlines: [
              {
                due_date: dueDate,
                is_notfrist: true,
                title: "Berufungsfrist",
                status: "pending",
              },
            ],
          },
        },
      ],
    };
    const insights = generateInsights(input);
    const notfristInsights = insights.filter(
      (i: Insight) => i.type === "playbook_hint" && i.title === "Notfrist droht zu verstreichen"
    );
    expect(notfristInsights.length).toBe(1);
    expect(notfristInsights[0].severity).toBe("critical");
  });

  it("generates extraction_issue insight for failed document analysis", () => {
    const input: InsightInput = {
      recentDocuments: [
        {
          slug: "doc-1",
          title: "Vertrag.pdf",
          frontmatter: {
            case_slug: "case-1",
            analysis_status: "failed",
          },
        },
      ],
    };
    const insights = generateInsights(input);
    const extInsights = insights.filter((i: Insight) => i.type === "extraction_issue");
    expect(extInsights.length).toBe(1);
    expect(extInsights[0].severity).toBe("critical");
  });

  it("generates deadline_risk insight for overdue deadlines", () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const dueDate = past.toISOString().split("T")[0];

    const input: InsightInput = {
      cases: [
        {
          slug: "case-overdue",
          title: "Overdue Case",
          frontmatter: {
            status: "open",
            deadlines: [
              {
                due_date: dueDate,
                status: "pending",
                title: "Klagefrist",
              },
            ],
          },
        },
      ],
    };
    const insights = generateInsights(input);
    const drInsights = insights.filter((i: Insight) => i.type === "deadline_risk");
    expect(drInsights.length).toBe(1);
    expect(drInsights[0].severity).toBe("critical");
    expect(drInsights[0].title).toBe("Frist versäumt");
  });

  it("sorts insights by severity (critical first)", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const future = new Date();
    future.setDate(future.getDate() + 2);

    const input: InsightInput = {
      cases: [
        {
          slug: "case-sort",
          title: "Sort Case",
          frontmatter: {
            status: "open",
            deadlines: [
              {
                due_date: past.toISOString().split("T")[0],
                status: "pending",
                title: "Overdue Frist",
              },
              {
                due_date: future.toISOString().split("T")[0],
                is_notfrist: true,
                status: "pending",
                title: "Notfrist",
              },
            ],
          },
        },
      ],
      recentDocuments: [
        {
          slug: "doc-fail",
          title: "Failed Doc",
          frontmatter: { analysis_status: "failed" },
        },
      ],
    };
    const insights = generateInsights(input);
    expect(insights.length).toBeGreaterThan(0);
    // Critical insights should come first
    const firstCritical = insights.findIndex((i: Insight) => i.severity === "critical");
    const firstWarning = insights.findIndex((i: Insight) => i.severity === "warning");
    if (firstCritical >= 0 && firstWarning >= 0) {
      expect(firstCritical).toBeLessThan(firstWarning);
    }
  });

  it("filterActiveInsights removes dismissed insights", () => {
    const insights = generateInsights({
      cases: [
        {
          slug: "c1",
          title: "Case",
          frontmatter: {
            status: "open",
            timeline: [{ date: "2026-07-01", title: "Event", type: "event" }],
          },
        },
      ],
    });
    expect(insights.length).toBeGreaterThan(0);
    const dismissed = insights.map((i: Insight) => ({ ...i, dismissed: true }));
    expect(filterActiveInsights(dismissed)).toHaveLength(0);
  });

  it("skips old judgements (>90 days)", () => {
    const old = new Date();
    old.setDate(old.getDate() - 100);
    const input: InsightInput = {
      cases: [
        {
          slug: "c1",
          title: "Case",
          frontmatter: { status: "open", legal_area: "Mietrecht" },
        },
      ],
      judgements: [
        {
          slug: "j-old",
          title: "Old Urteil",
          frontmatter: {
            legal_area: "Mietrecht",
            date: old.toISOString().split("T")[0],
          },
        },
      ],
    };
    const insights = generateInsights(input);
    expect(insights.filter((i: Insight) => i.type === "judgement_match")).toHaveLength(0);
  });
});
