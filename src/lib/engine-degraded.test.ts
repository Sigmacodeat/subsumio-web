import { describe, expect, test } from "vitest";
import { ASSISTANT_UNAVAILABLE_MESSAGE, isDegradedAnswer, lawyerFacingAnswer } from "./engine-degraded";

describe("engine degraded answers", () => {
  test("detects the engine stub", () => {
    expect(
      isDegradedAnswer(
        "(no LLM available — [chat(openrouter:anthropic/claude-sonnet-4.6)] Insufficient credits.)"
      )
    ).toBe(true);
    expect(isDegradedAnswer("Nach § 1295 ABGB haftet …")).toBe(false);
    expect(isDegradedAnswer(undefined)).toBe(false);
  });
  test("never passes provider diagnostics through", () => {
    const out = lawyerFacingAnswer("(no LLM available — set ANTHROPIC_API_KEY)");
    expect(out).toBe(ASSISTANT_UNAVAILABLE_MESSAGE);
    expect(out).not.toMatch(/LLM|openrouter|API_KEY/i);
  });
});
