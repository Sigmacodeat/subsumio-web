// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  TOOL_CONDITIONS,
  getAvailableTools,
  isToolAvailable,
  getToolList,
} from "./agent-conditionals";

describe("TOOL_CONDITIONS", () => {
  test("contains all expected tools", () => {
    const toolNames = Object.keys(TOOL_CONDITIONS);
    expect(toolNames).toContain("navigate");
    expect(toolNames).toContain("search_cases");
    expect(toolNames).toContain("deep_analysis");
    expect(toolNames).toContain("send_email");
  });

  test("every tool has a description", () => {
    for (const tool of Object.values(TOOL_CONDITIONS)) {
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
});

describe("getAvailableTools", () => {
  test("admin sees all basic tools", () => {
    const ctx = { role: "admin" };
    const tools = getAvailableTools(ctx);
    expect(tools).toContain("search_cases");
    expect(tools).toContain("navigate");
    expect(tools).toContain("send_email");
  });

  test("client_viewer sees only unrestricted tools", () => {
    const ctx = { role: "client_viewer" };
    const tools = getAvailableTools(ctx);
    expect(tools).toContain("navigate");
    expect(tools).toContain("translate_text");
    expect(tools).not.toContain("search_cases");
    expect(tools).not.toContain("send_email");
  });

  test("tools requiring case context are hidden without context", () => {
    const ctx = { role: "lawyer", hasCaseContext: false };
    const tools = getAvailableTools(ctx);
    expect(tools).not.toContain("case_summary");
    expect(tools).not.toContain("time_entry");
  });

  test("tools requiring case context are visible with context", () => {
    const ctx = { role: "lawyer", hasCaseContext: true };
    const tools = getAvailableTools(ctx);
    expect(tools).toContain("case_summary");
    expect(tools).toContain("time_entry");
  });

  test("feature-flagged tools require enabled feature", () => {
    const ctx = { role: "lawyer", hasCaseContext: true, features: {} };
    expect(getAvailableTools(ctx)).not.toContain("deep_analysis");
    expect(getAvailableTools(ctx)).not.toContain("precedent_search");
  });

  test("feature-flagged tools visible when feature enabled", () => {
    const ctx = {
      role: "lawyer",
      hasCaseContext: true,
      features: { deepAnalysis: true, precedentSearch: true },
    };
    const tools = getAvailableTools(ctx);
    expect(tools).toContain("deep_analysis");
    expect(tools).toContain("precedent_search");
  });
});

describe("isToolAvailable", () => {
  test("returns true for available tools", () => {
    expect(isToolAvailable("navigate", { role: "client_viewer" })).toBe(true);
  });

  test("returns false for unavailable tools", () => {
    expect(isToolAvailable("send_email", { role: "client_viewer" })).toBe(false);
  });

  test("returns false for unknown tools", () => {
    expect(isToolAvailable("unknown_tool", { role: "admin" })).toBe(false);
  });
});

describe("getToolList", () => {
  test("returns tool names with descriptions and context flag", () => {
    const list = getToolList({ role: "admin", hasCaseContext: true });
    const navigate = list.find((t) => t.name === "navigate");
    expect(navigate).toBeDefined();
    expect(navigate!.description).toBe(TOOL_CONDITIONS.navigate.description);
    expect(navigate!.requiresCaseContext).toBe(false);

    const caseSummary = list.find((t) => t.name === "case_summary");
    expect(caseSummary).toBeDefined();
    expect(caseSummary!.requiresCaseContext).toBe(true);
  });
});
