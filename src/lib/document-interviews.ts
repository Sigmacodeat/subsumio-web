/**
 * Dokumenten-Interviews — Guided Document Assembly
 * ==================================================
 * Interview definition (questions + conditions, JSON schema) on template.
 * Portal fill-out path. Answers → variable substitution → finished document.
 */

export type InterviewQuestionType =
  | "text"
  | "textarea"
  | "date"
  | "number"
  | "select"
  | "multiselect"
  | "boolean"
  | "party";

export interface InterviewCondition {
  field: string;
  operator: "eq" | "ne" | "contains" | "not_empty" | "gt" | "lt";
  value: string | number | boolean;
}

export interface InterviewQuestion {
  id: string;
  type: InterviewQuestionType;
  label: string;
  help_text?: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  default_value?: string | number | boolean;
  /** Show this question only when condition is met */
  show_when?: InterviewCondition[];
  /** Map answer to template variable */
  variable: string;
}

export interface InterviewDefinition {
  id: string;
  template_slug: string;
  title: string;
  description: string;
  questions: InterviewQuestion[];
  output_format: "docx" | "pdf" | "markdown";
  review_status: "unreviewed" | "reviewed" | "approved";
  created_at: string;
  updated_at: string;
}

export interface InterviewAnswer {
  question_id: string;
  variable: string;
  value: string | number | boolean | string[];
}

export interface InterviewSession {
  id: string;
  interview_id: string;
  case_slug: string;
  client_token?: string;
  answers: InterviewAnswer[];
  status: "in_progress" | "completed" | "filed";
  document_slug?: string;
  created_at: string;
  updated_at: string;
}

export function createInterview(input: {
  template_slug: string;
  title: string;
  description: string;
  questions: InterviewQuestion[];
  output_format?: InterviewDefinition["output_format"];
}): InterviewDefinition {
  const now = new Date().toISOString();
  return {
    id: `interview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    template_slug: input.template_slug,
    title: input.title,
    description: input.description,
    questions: input.questions,
    output_format: input.output_format ?? "docx",
    review_status: "unreviewed",
    created_at: now,
    updated_at: now,
  };
}

export function evaluateCondition(
  condition: InterviewCondition,
  answers: Map<string, string | number | boolean | string[]>
): boolean {
  const value = answers.get(condition.field);
  switch (condition.operator) {
    case "eq":
      return value === condition.value;
    case "ne":
      return value !== condition.value;
    case "contains":
      return typeof value === "string" && value.includes(String(condition.value));
    case "not_empty":
      return value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
    case "gt":
      return typeof value === "number" && value > Number(condition.value);
    case "lt":
      return typeof value === "number" && value < Number(condition.value);
    default:
      return false;
  }
}

export function getActiveQuestions(
  interview: InterviewDefinition,
  answers: InterviewAnswer[]
): InterviewQuestion[] {
  const answerMap = new Map(answers.map((a) => [a.variable, a.value]));

  return interview.questions.filter((q) => {
    if (!q.show_when || q.show_when.length === 0) return true;
    return q.show_when.every((cond) => evaluateCondition(cond, answerMap));
  });
}

export function substituteVariables(template: string, answers: InterviewAnswer[]): string {
  let result = template;
  for (const answer of answers) {
    const value = Array.isArray(answer.value) ? answer.value.join(", ") : String(answer.value);
    result = result.replaceAll(`{{${answer.variable}}}`, value);
    result = result.replaceAll(`{{ ${answer.variable} }}`, value);
  }
  return result;
}

export function createInterviewSession(input: {
  interview_id: string;
  case_slug: string;
  client_token?: string;
}): InterviewSession {
  const now = new Date().toISOString();
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    interview_id: input.interview_id,
    case_slug: input.case_slug,
    client_token: input.client_token,
    answers: [],
    status: "in_progress",
    created_at: now,
    updated_at: now,
  };
}
