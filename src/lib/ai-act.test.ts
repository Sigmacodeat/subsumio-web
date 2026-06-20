import { describe, test, expect } from "vitest";
import { AI_NOTICE, AI_BADGE_LABEL, AI_FRONTMATTER } from "./ai-act";

describe("AI_NOTICE", () => {
  test("is a non-empty string", () => {
    expect(typeof AI_NOTICE).toBe("string");
    expect(AI_NOTICE.length).toBeGreaterThan(0);
  });

  test("contains EU AI Act reference", () => {
    expect(AI_NOTICE).toContain("EU AI Act");
    expect(AI_NOTICE).toContain("Art. 50");
  });

  test("mentions KI-generiert", () => {
    expect(AI_NOTICE).toContain("KI-generiert");
  });

  test("mentions anwaltlich prüfen", () => {
    expect(AI_NOTICE).toContain("anwaltlich");
    expect(AI_NOTICE).toContain("prüfen");
  });

  test("mentions Subsumio", () => {
    expect(AI_NOTICE).toContain("Subsumio");
  });
});

describe("AI_BADGE_LABEL", () => {
  test("is a non-empty string", () => {
    expect(typeof AI_BADGE_LABEL).toBe("string");
    expect(AI_BADGE_LABEL.length).toBeGreaterThan(0);
  });

  test("contains KI-generiert", () => {
    expect(AI_BADGE_LABEL).toContain("KI-generiert");
  });

  test("contains zu prüfen", () => {
    expect(AI_BADGE_LABEL).toContain("zu prüfen");
  });

  test("is shorter than AI_NOTICE", () => {
    expect(AI_BADGE_LABEL.length).toBeLessThan(AI_NOTICE.length);
  });
});

describe("AI_FRONTMATTER", () => {
  test("has ai_generated set to true", () => {
    expect(AI_FRONTMATTER.ai_generated).toBe(true);
  });

  test("has ai_notice matching AI_NOTICE", () => {
    expect(AI_FRONTMATTER.ai_notice).toBe(AI_NOTICE);
  });

  test("is frozen (as const)", () => {
    expect(Object.keys(AI_FRONTMATTER).sort()).toEqual(["ai_generated", "ai_notice"]);
  });
});
