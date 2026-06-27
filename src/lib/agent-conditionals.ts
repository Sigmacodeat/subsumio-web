/**
 * Agent Conditionals — conditional tool routing for the Copilot.
 *
 * Filters available tools based on:
 * - User role (admin, lawyer, assistant, client_viewer)
 * - Feature flags (e.g. is WhatsApp enabled, is Deep Analysis available)
 * - Matter context (e.g. case-scoped tools only when a case is open)
 *
 * This prevents tools from being offered to users who can't use them,
 * reducing prompt noise and preventing permission errors at execution time.
 */

export type CopilotToolName =
  | "navigate"
  | "search_cases"
  | "search_deadlines"
  | "search_knowledge"
  | "create_case"
  | "case_summary"
  | "email_draft"
  | "deadline_extract"
  | "document_summary"
  | "conflict_check"
  | "time_entry"
  | "client_update"
  | "meeting_tasks"
  | "intake_create"
  | "rvg_calculate"
  | "document_request_create"
  | "precedent_search"
  | "translate_text"
  | "obligation_extract"
  | "tabular_review"
  | "deep_analysis"
  | "send_email";

export interface ToolConditionContext {
  role: string;
  hasCaseContext?: boolean;
  features?: {
    whatsapp?: boolean;
    deepAnalysis?: boolean;
    precedentSearch?: boolean;
  };
}

export interface ToolCondition {
  roles?: string[];
  requiresCaseContext?: boolean;
  featureFlag?: keyof NonNullable<ToolConditionContext["features"]>;
  description: string;
}

export const TOOL_CONDITIONS: Record<CopilotToolName, ToolCondition> = {
  navigate: {
    description: "Navigate to a dashboard page",
  },
  search_cases: {
    roles: ["admin", "lawyer", "assistant"],
    description: "Search case files by query",
  },
  search_deadlines: {
    roles: ["admin", "lawyer", "assistant"],
    description: "Search deadlines and fristen",
  },
  search_knowledge: {
    description: "Search the firm knowledge base (brain)",
  },
  create_case: {
    roles: ["admin", "lawyer", "assistant"],
    description: "Create a new case file",
  },
  case_summary: {
    roles: ["admin", "lawyer", "assistant"],
    requiresCaseContext: true,
    description: "Get a structured summary of a case",
  },
  email_draft: {
    roles: ["admin", "lawyer", "assistant"],
    description: "Draft a professional email",
  },
  deadline_extract: {
    roles: ["admin", "lawyer", "assistant"],
    description: "Extract deadlines from a document",
  },
  document_summary: {
    roles: ["admin", "lawyer", "assistant"],
    description: "Summarize a document with key points",
  },
  conflict_check: {
    roles: ["admin", "lawyer", "assistant"],
    description: "Run a conflict check (Kollisionsprüfung)",
  },
  time_entry: {
    roles: ["admin", "lawyer", "assistant"],
    requiresCaseContext: true,
    description: "Create a billable time entry",
  },
  client_update: {
    roles: ["admin", "lawyer", "assistant"],
    requiresCaseContext: true,
    description: "Generate a client update for a case",
  },
  meeting_tasks: {
    roles: ["admin", "lawyer", "assistant"],
    description: "Extract tasks from meeting notes",
  },
  intake_create: {
    roles: ["admin", "lawyer", "assistant"],
    description: "Create a new client intake with conflict check",
  },
  rvg_calculate: {
    description: "Calculate RVG legal costs",
  },
  document_request_create: {
    roles: ["admin", "lawyer", "assistant"],
    requiresCaseContext: true,
    description: "Create a document request for a client",
  },
  precedent_search: {
    roles: ["admin", "lawyer", "assistant"],
    featureFlag: "precedentSearch",
    description: "Search for legal precedents",
  },
  translate_text: {
    description: "Translate legal text between languages",
  },
  obligation_extract: {
    roles: ["admin", "lawyer", "assistant"],
    description: "Extract obligations from a document",
  },
  tabular_review: {
    roles: ["admin", "lawyer"],
    description: "Run a tabular review across multiple documents",
  },
  deep_analysis: {
    roles: ["admin", "lawyer"],
    featureFlag: "deepAnalysis",
    description: "Run a deep narrative analysis across Vault documents",
  },
  send_email: {
    roles: ["admin", "lawyer", "assistant"],
    description: "Send an email to one or more recipients",
  },
};

export function getAvailableTools(ctx: ToolConditionContext): CopilotToolName[] {
  return (Object.keys(TOOL_CONDITIONS) as CopilotToolName[]).filter((tool) => {
    const cond = TOOL_CONDITIONS[tool];
    if (cond.roles && !cond.roles.includes(ctx.role)) return false;
    if (cond.requiresCaseContext && !ctx.hasCaseContext) return false;
    if (cond.featureFlag && !ctx.features?.[cond.featureFlag]) return false;
    return true;
  });
}

export function isToolAvailable(tool: string, ctx: ToolConditionContext): boolean {
  const cond = TOOL_CONDITIONS[tool as CopilotToolName];
  if (!cond) return false;
  if (cond.roles && !cond.roles.includes(ctx.role)) return false;
  if (cond.requiresCaseContext && !ctx.hasCaseContext) return false;
  if (cond.featureFlag && !ctx.features?.[cond.featureFlag]) return false;
  return true;
}

export function getToolList(ctx: ToolConditionContext): Array<{
  name: CopilotToolName;
  description: string;
  requiresCaseContext: boolean;
}> {
  return getAvailableTools(ctx).map((name) => ({
    name,
    description: TOOL_CONDITIONS[name].description,
    requiresCaseContext: !!TOOL_CONDITIONS[name].requiresCaseContext,
  }));
}
