import { describe, test, expect } from "vitest";
import {
  createInterview,
  evaluateCondition,
  getActiveQuestions,
  substituteVariables,
  createInterviewSession,
} from "./document-interviews";

describe("document-interviews", () => {
  describe("createInterview", () => {
    test("creates interview with correct fields", () => {
      const interview = createInterview({
        template_slug: "template-1",
        title: "Scheidungsfragebogen",
        description: "Fragen für Mandanten",
        questions: [{ id: "q1", type: "text", label: "Name", required: true, variable: "name" }],
      });
      expect(interview.id).toMatch(/^interview-/);
      expect(interview.template_slug).toBe("template-1");
      expect(interview.questions).toHaveLength(1);
      expect(interview.output_format).toBe("docx");
      expect(interview.review_status).toBe("unreviewed");
    });
  });

  describe("evaluateCondition", () => {
    test("evaluates eq condition", () => {
      const answers = new Map([["type", "contested"]]);
      expect(
        evaluateCondition({ field: "type", operator: "eq", value: "contested" }, answers)
      ).toBe(true);
      expect(
        evaluateCondition({ field: "type", operator: "eq", value: "uncontested" }, answers)
      ).toBe(false);
    });

    test("evaluates not_empty condition", () => {
      const answers = new Map([["name", "Max"]]);
      expect(evaluateCondition({ field: "name", operator: "not_empty", value: "" }, answers)).toBe(
        true
      );
      const empty = new Map([["name", ""]]);
      expect(evaluateCondition({ field: "name", operator: "not_empty", value: "" }, empty)).toBe(
        false
      );
    });
  });

  describe("getActiveQuestions", () => {
    test("returns all questions when no conditions", () => {
      const interview = createInterview({
        template_slug: "t1",
        title: "Test",
        description: "Test",
        questions: [
          { id: "q1", type: "text", label: "A", required: true, variable: "a" },
          { id: "q2", type: "text", label: "B", required: true, variable: "b" },
        ],
      });
      const active = getActiveQuestions(interview, []);
      expect(active).toHaveLength(2);
    });

    test("filters questions based on conditions", () => {
      const interview = createInterview({
        template_slug: "t1",
        title: "Test",
        description: "Test",
        questions: [
          { id: "q1", type: "text", label: "A", required: true, variable: "a" },
          {
            id: "q2",
            type: "text",
            label: "B",
            required: true,
            variable: "b",
            show_when: [{ field: "a", operator: "eq", value: "yes" }],
          },
        ],
      });
      const activeNoAnswer = getActiveQuestions(interview, []);
      expect(activeNoAnswer).toHaveLength(1);

      const activeWithYes = getActiveQuestions(interview, [
        { question_id: "q1", variable: "a", value: "yes" },
      ]);
      expect(activeWithYes).toHaveLength(2);
    });
  });

  describe("substituteVariables", () => {
    test("replaces variables in template", () => {
      const result = substituteVariables("Hallo {{name}}, Sie haben eine Akte {{case}}.", [
        { question_id: "q1", variable: "name", value: "Max" },
        { question_id: "q2", variable: "case", value: "A123" },
      ]);
      expect(result).toBe("Hallo Max, Sie haben eine Akte A123.");
    });

    test("handles array values", () => {
      const result = substituteVariables("Parteien: {{parties}}", [
        { question_id: "q1", variable: "parties", value: ["A", "B", "C"] },
      ]);
      expect(result).toBe("Parteien: A, B, C");
    });
  });

  describe("createInterviewSession", () => {
    test("creates session with correct defaults", () => {
      const session = createInterviewSession({
        interview_id: "interview-123",
        case_slug: "case-456",
      });
      expect(session.id).toMatch(/^session-/);
      expect(session.interview_id).toBe("interview-123");
      expect(session.case_slug).toBe("case-456");
      expect(session.status).toBe("in_progress");
      expect(session.answers).toEqual([]);
    });
  });
});
