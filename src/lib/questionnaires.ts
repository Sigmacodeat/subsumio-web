/**
 * Portal-Fragebögen (WP-3.13): die Kanzlei definiert Felder pro Akte,
 * der Mandant beantwortet sie im Portal, Antworten landen im
 * Akt-Frontmatter (`questionnaires[]` auf der legal_case-Seite).
 */

export type QuestionnaireFieldType = "text" | "textarea" | "date" | "select" | "checkbox";

export interface QuestionnaireField {
  key: string;
  label: string;
  type: QuestionnaireFieldType;
  required?: boolean;
  /** Für type=select — eine Option pro Eintrag. */
  options?: string[];
}

export interface Questionnaire {
  id: string;
  title: string;
  fields: QuestionnaireField[];
  status: "sent" | "answered";
  created_by: string;
  created_at: string;
  answered_at?: string;
  /** key → Antwort (string; checkbox = "ja"/"nein"). */
  answers?: Record<string, string>;
}

export const QUESTIONNAIRE_FIELD_TYPES: QuestionnaireFieldType[] = [
  "text",
  "textarea",
  "date",
  "select",
  "checkbox",
];

export function readQuestionnaires(
  frontmatter: Record<string, unknown> | undefined
): Questionnaire[] {
  const raw = frontmatter?.questionnaires;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (q): q is Questionnaire =>
      !!q &&
      typeof q === "object" &&
      typeof (q as Questionnaire).id === "string" &&
      Array.isArray((q as Questionnaire).fields)
  );
}

export function createQuestionnaire(input: {
  title: string;
  fields: QuestionnaireField[];
  createdBy: string;
}): Questionnaire {
  return {
    id: `qn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title.trim(),
    fields: input.fields,
    status: "sent",
    created_by: input.createdBy,
    created_at: new Date().toISOString(),
  };
}

export class QuestionnaireValidationError extends Error {
  constructor(public readonly missingKeys: string[]) {
    super("required_fields_missing");
  }
}

/** Pflichtfeld-Prüfung; wirft bei fehlenden Antworten. */
export function validateAnswers(
  q: Questionnaire,
  answers: Record<string, string>
): Record<string, string> {
  const allowed = new Set(q.fields.map((f) => f.key));
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers)) {
    if (allowed.has(k) && typeof v === "string") clean[k] = v.slice(0, 5000);
  }
  const missing = q.fields.filter((f) => f.required && !clean[f.key]?.trim()).map((f) => f.key);
  if (missing.length > 0) throw new QuestionnaireValidationError(missing);
  return clean;
}

/** Antworten in den Fragebogen schreiben (immutable Rückgabe). */
export function answerQuestionnaire(
  questionnaires: Questionnaire[],
  id: string,
  answers: Record<string, string>
): Questionnaire[] {
  return questionnaires.map((q) =>
    q.id === id && q.status === "sent"
      ? {
          ...q,
          status: "answered" as const,
          answers,
          answered_at: new Date().toISOString(),
        }
      : q
  );
}
