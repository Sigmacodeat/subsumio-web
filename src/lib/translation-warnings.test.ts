import { describe, expect, it } from "vitest";
import { translationWarningText } from "./translation-warnings";

describe("translationWarningText", () => {
  it("turns engine codes into German text", () => {
    expect(
      translationWarningText("DOCUMENT_TRUNCATED_FOR_ANALYSIS: 150000 → 100000 chars")
    ).toMatch(/Nur der erste Teil wurde übersetzt/);
    expect(translationWarningText("TRANSLATION_INCOMPLETE: section 2 of 5")).toMatch(
      /nicht vollständig/
    );
    expect(translationWarningText("UNSTRUCTURED_OUTPUT: Model returned plain text")).not.toMatch(
      /Model returned/
    );
  });

  it("passes unknown text through", () => {
    expect(translationWarningText("Hinweis")).toBe("Hinweis");
  });
});
