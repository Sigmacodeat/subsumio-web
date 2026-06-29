// @vitest-environment node

import { describe, test, expect } from "vitest";
import { vaultReviewSchema } from "./vault";

describe("vaultReviewSchema", () => {
  test("accepts valid review questions", () => {
    const result = vaultReviewSchema.safeParse({
      questions: ["Was ist der Streitgegenstand?", "Welche Beweise gibt es?"],
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty questions array", () => {
    const result = vaultReviewSchema.safeParse({ questions: [] });
    expect(result.success).toBe(false);
  });

  test("rejects too many questions", () => {
    const result = vaultReviewSchema.safeParse({ questions: Array(9).fill("Frage?") });
    expect(result.success).toBe(false);
  });

  test("rejects empty question string", () => {
    const result = vaultReviewSchema.safeParse({ questions: [""] });
    expect(result.success).toBe(false);
  });
});
