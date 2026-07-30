import { describe, it, expect } from "vitest";
import {
  runConversationEval,
  formatConversationReport,
  mockSearchFn,
  type SearchFn,
  type ConversationReport,
} from "./conversation-runner.ts";
import { CONVERSATION_FIXTURES } from "./conversation-fixtures.ts";

// ── Mock search function that returns expected slugs ──────────────────

function perfectSearchFn(): SearchFn {
  return async (opts) => {
    // Search across ALL scenarios for matching turn text
    for (const scenario of CONVERSATION_FIXTURES) {
      const turn = scenario.turns.find((t) => t.speaker === "user" && t.text === opts.query);
      if (turn) {
        return { slugs: turn.expected_slugs ?? [], latency_ms: 10 };
      }
    }
    return { slugs: [], latency_ms: 10 };
  };
}

function failingSearchFn(): SearchFn {
  return async () => ({
    slugs: ["legal/statutes/de/bgb/p-999"],
    latency_ms: 10,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("runConversationEval", () => {
  it("evaluates scenarios with perfect search", async () => {
    const scenarios = CONVERSATION_FIXTURES.slice(0, 3);
    const report = await runConversationEval(scenarios, perfectSearchFn());

    expect(report.total_scenarios).toBe(3);
    expect(report.total_turns).toBeGreaterThan(0);
    expect(report.overall_turn_pass_rate).toBe(1.0);
  });

  it("evaluates scenarios with failing search", async () => {
    const scenarios = CONVERSATION_FIXTURES.slice(0, 2);
    const report = await runConversationEval(scenarios, failingSearchFn());

    expect(report.total_scenarios).toBe(2);
    expect(report.overall_turn_pass_rate).toBe(0);
  });

  it("tracks context retention for follow-up turns", async () => {
    const scenarios = CONVERSATION_FIXTURES.filter((s) => s.id === "conv-de-001");
    const report = await runConversationEval(scenarios, perfectSearchFn());

    expect(report.scenario_results.length).toBe(1);
    expect(report.scenario_results[0].context_retention_score).toBe(1.0);
  });

  it("calls onProgress callback", async () => {
    const progress: Array<{ current: number; total: number }> = [];
    const scenarios = CONVERSATION_FIXTURES.slice(0, 3);
    await runConversationEval(scenarios, perfectSearchFn(), (current, total) => {
      progress.push({ current, total });
    });

    expect(progress.length).toBe(3);
    expect(progress[0]).toEqual({ current: 1, total: 3 });
    expect(progress[2]).toEqual({ current: 3, total: 3 });
  });

  it("groups results by jurisdiction", async () => {
    const scenarios = CONVERSATION_FIXTURES.slice(0, 5);
    const report = await runConversationEval(scenarios, perfectSearchFn());

    expect(Object.keys(report.by_jurisdiction).length).toBeGreaterThan(0);
  });

  it("groups results by difficulty", async () => {
    const scenarios = CONVERSATION_FIXTURES.slice(0, 5);
    const report = await runConversationEval(scenarios, perfectSearchFn());

    expect(Object.keys(report.by_difficulty).length).toBeGreaterThan(0);
  });

  it("handles search errors gracefully", async () => {
    const errorSearchFn: SearchFn = async (_opts) => {
      throw new Error("Search API down");
    };
    const scenarios = CONVERSATION_FIXTURES.slice(0, 1);
    const report = await runConversationEval(scenarios, errorSearchFn);

    expect(report.total_scenarios).toBe(1);
    expect(report.overall_turn_pass_rate).toBe(0);
  });
});

describe("formatConversationReport", () => {
  it("formats a complete report", async () => {
    const scenarios = CONVERSATION_FIXTURES.slice(0, 3);
    const report = await runConversationEval(scenarios, perfectSearchFn());
    const text = formatConversationReport(report);

    expect(text).toContain("Conversation Evaluation Report");
    expect(text).toContain("Total scenarios: 3");
    expect(text).toContain("By Jurisdiction");
    expect(text).toContain("By Difficulty");
  });

  it("shows failed scenarios", async () => {
    const scenarios = CONVERSATION_FIXTURES.slice(0, 3);
    const report = await runConversationEval(scenarios, failingSearchFn());
    const text = formatConversationReport(report);

    expect(text).toContain("Failed Scenarios");
  });

  it("does not show failed scenarios when all pass", async () => {
    const scenarios = CONVERSATION_FIXTURES.slice(0, 1);
    const report = await runConversationEval(scenarios, perfectSearchFn());
    const text = formatConversationReport(report);

    expect(text).not.toContain("Failed Scenarios");
  });
});

describe("mockSearchFn", () => {
  it("returns slugs based on query keywords", async () => {
    const fn = mockSearchFn();
    const result = await fn({
      query: "Was regelt § 823 BGB die Schadensersatzpflicht",
      jurisdiction: "DE",
    });

    expect(result.slugs.length).toBeGreaterThan(0);
    expect(result.slugs[0]).toContain("legal/statutes/de/");
    expect(result.latency_ms).toBeGreaterThan(0);
  });
});
