import { describe, it, expect } from "vitest";
import { TOOL_CONDITIONS, type CopilotToolName } from "./agent-conditionals";
import {
  COPILOT_TOOL_NAME_PATTERN,
  COPILOT_TOOL_SCHEMAS,
  MAX_TOOL_DESCRIPTION_CHARS,
  MAX_TOOLS_PER_REQUEST,
  copilotToolDefinitions,
  copilotToolInputSchema,
  copilotToolSchema,
  offeredCopilotTools,
  toolArgsToAttrs,
} from "./copilot-tool-schemas";

const ALL_TOOLS = Object.keys(TOOL_CONDITIONS) as CopilotToolName[];

describe("copilot tool registry", () => {
  it("has a schema for every tool in the catalogue, and nothing else", () => {
    for (const name of ALL_TOOLS) {
      expect(COPILOT_TOOL_SCHEMAS[name], name).toBeDefined();
      expect(copilotToolSchema(name), name).toBeDefined();
    }
    expect(Object.keys(COPILOT_TOOL_SCHEMAS).sort()).toEqual([...ALL_TOOLS].sort());
  });

  it("every tool converts to a JSON-Schema object the engine accepts", () => {
    for (const name of ALL_TOOLS) {
      expect(name, name).toMatch(COPILOT_TOOL_NAME_PATTERN);
      const schema = copilotToolInputSchema(name);
      expect(schema.type, name).toBe("object");
      expect(schema.properties, name).toBeTypeOf("object");
      expect(schema.additionalProperties, name).toBe(false);
      expect(COPILOT_TOOL_SCHEMAS[name].description.length, name).toBeLessThanOrEqual(
        MAX_TOOL_DESCRIPTION_CHARS
      );
    }
  });

  it("marks required and optional arguments the way the marker parser treats them", () => {
    const created = copilotToolInputSchema("create_deadline");
    expect(created.required).toEqual(["title", "due_date"]);
    const properties = created.properties as Record<string, Record<string, unknown>>;
    expect(properties.case_slug.type).toBe("string");
    expect(properties.due_date.description).toContain("YYYY-MM-DD");

    const deadlines = copilotToolInputSchema("search_deadlines");
    expect(deadlines.required).toBeUndefined();
    const status = (deadlines.properties as Record<string, Record<string, unknown>>).status;
    expect(status.enum).toEqual(["open", "overdue", "critical", "all"]);
    expect(status.default).toBe("open");

    const task = copilotToolInputSchema("create_automation_rule");
    const within = (task.properties as Record<string, Record<string, unknown>>).within_days;
    expect(within.type).toBe("integer");
    expect(within.maximum).toBe(365);
  });

  it("never offers tools the chat cannot execute from an answer", () => {
    const offered = new Set(offeredCopilotTools());
    for (const never of ["send_email", "deep_analysis", "case_investigation", "rvg_calculate"]) {
      expect(offered.has(never as CopilotToolName), never).toBe(false);
    }
    expect(offered.has("search_cases")).toBe(true);
    expect(offered.has("create_task")).toBe(true);
  });

  it("filters definitions by role and matter context like the catalogue", () => {
    const viewer = copilotToolDefinitions({ role: "client_viewer" });
    expect(viewer.map((d) => d.name)).toEqual(["navigate", "search_knowledge", "translate_text"]);

    const lawyerNoCase = copilotToolDefinitions({ role: "lawyer", hasCaseContext: false });
    expect(lawyerNoCase.some((d) => d.name === "search_cases")).toBe(true);
    expect(lawyerNoCase.some((d) => d.name === "case_summary")).toBe(false);
    expect(lawyerNoCase.some((d) => d.name === "precedent_search")).toBe(false);

    const lawyerWithCase = copilotToolDefinitions({
      role: "lawyer",
      hasCaseContext: true,
      features: { precedentSearch: true },
    });
    expect(lawyerWithCase.some((d) => d.name === "case_summary")).toBe(true);
    expect(lawyerWithCase.some((d) => d.name === "precedent_search")).toBe(true);
    expect(lawyerWithCase.length).toBeLessThanOrEqual(MAX_TOOLS_PER_REQUEST);
    for (const def of lawyerWithCase) {
      expect(def.inputSchema.type).toBe("object");
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it("validates model arguments with defaults applied", () => {
    const parsed = copilotToolSchema("search_deadlines")!.safeParse({ case_slug: "cases/1" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.status).toBe("open");

    const wrong = copilotToolSchema("time_entry")!.safeParse({
      case_slug: "cases/1",
      description: "Aktenanalyse",
      hours: "viele",
    });
    expect(wrong.success).toBe(false);
  });

  it("bridges structured arguments into marker attributes (arrays joined with '; ')", () => {
    expect(
      toolArgsToAttrs({
        questions: ["Kündigungsfrist?", "Haftung?"],
        hours: 1.5,
        create_document: true,
        skip: undefined,
        gone: null,
      })
    ).toEqual({
      questions: "Kündigungsfrist?; Haftung?",
      hours: "1.5",
      create_document: "true",
    });
  });
});
