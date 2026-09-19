import { describe, expect, test } from "vitest";
import { HANDBOOK, handbookChapterForRoute } from "./handbook";

describe("handbook", () => {
  test("chapter ids are unique", () => {
    const ids = HANDBOOK.flatMap((g) => g.chapters.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every dashboard route maps to an existing chapter", () => {
    expect(handbookChapterForRoute("/dashboard")?.id).toBe("uebersicht");
    expect(handbookChapterForRoute("/dashboard/fristenbuch")?.id).toBe("fristen");
    expect(handbookChapterForRoute("/dashboard/cases/legal/cases/x")?.id).toBe("akten");
    expect(handbookChapterForRoute("/dashboard/kollisionspruefung")?.title).toBe(
      "Kollisionsprüfung"
    );
    expect(handbookChapterForRoute("/dashboard/unknown")).toBeNull();
  });

  test("copy follows the house rules: Sie-Form, no engine jargon, Austria only", () => {
    const text = JSON.stringify(HANDBOOK);
    expect(text).not.toMatch(/\b(du|dein|deine|kannst)\b/i);
    expect(text).not.toMatch(/\b(Brain|Engine|Slug|Token|LLM|Embedding|Pipeline|Corpus)\b/);
    expect(text).not.toMatch(/\b(BRAO|beA|RVG|GoBD|DATEV|BGB|Klageerwiderung)\b/);
  });
});
