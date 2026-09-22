import { describe, expect, test } from "vitest";
import {
  answerQuestionnaire,
  createQuestionnaire,
  QuestionnaireValidationError,
  readQuestionnaires,
  validateAnswers,
  type Questionnaire,
} from "./questionnaires";

const q: Questionnaire = {
  id: "qn-1",
  title: "Mandatsfragebogen",
  status: "sent",
  created_by: "a@k.at",
  created_at: "2026-09-22T10:00:00Z",
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "datum", label: "Datum", type: "date" },
    { key: "notizen", label: "Notizen", type: "textarea" },
  ],
};

describe("readQuestionnaires", () => {
  test("liest nur gültige Einträge", () => {
    expect(readQuestionnaires({ questionnaires: [q, null, { nope: 1 }] })).toHaveLength(1);
    expect(readQuestionnaires({})).toEqual([]);
    expect(readQuestionnaires(undefined)).toEqual([]);
  });
});

describe("validateAnswers", () => {
  test("wirft bei fehlendem Pflichtfeld", () => {
    expect(() => validateAnswers(q, { name: "" })).toThrow(QuestionnaireValidationError);
  });

  test("filtert unbekannte Schlüssel und begrenzt Länge", () => {
    const clean = validateAnswers(q, { name: "Muster", fremd: "x", notizen: "y".repeat(6000) });
    expect(clean).not.toHaveProperty("fremd");
    expect(clean.notizen).toHaveLength(5000);
  });
});

describe("answerQuestionnaire", () => {
  test("markiert als beantwortet und setzt Timestamp", () => {
    const out = answerQuestionnaire([q], "qn-1", { name: "Muster" });
    expect(out[0].status).toBe("answered");
    expect(out[0].answers?.name).toBe("Muster");
    expect(out[0].answered_at).toBeTruthy();
  });

  test("beantwortete Fragebögen sind immun gegen erneutes Beantworten", () => {
    const answered = answerQuestionnaire([q], "qn-1", { name: "A" });
    const again = answerQuestionnaire(answered, "qn-1", { name: "B" });
    expect(again[0].answers?.name).toBe("A");
  });
});

describe("createQuestionnaire", () => {
  test("erzeugt eindeutige IDs und Status sent", () => {
    const a = createQuestionnaire({ title: " T ", fields: [], createdBy: "u" });
    const b = createQuestionnaire({ title: "T", fields: [], createdBy: "u" });
    expect(a.id).not.toBe(b.id);
    expect(a.status).toBe("sent");
    expect(a.title).toBe("T");
  });
});
