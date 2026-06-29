// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  bundeslandSchema,
  deadlineRuleSchema,
  deadlineInputSchema,
  rvgInputSchema,
  deadlineDetectInputSchema,
  portalTokenInputSchema,
} from "./legal";

describe("bundeslandSchema", () => {
  test("accepts valid German and Austrian states", () => {
    expect(bundeslandSchema.safeParse("BY").success).toBe(true);
    expect(bundeslandSchema.safeParse("AT").success).toBe(true);
  });

  test("rejects invalid state", () => {
    expect(bundeslandSchema.safeParse("US").success).toBe(false);
  });
});

describe("deadlineRuleSchema", () => {
  test("accepts rule with days", () => {
    const result = deadlineRuleSchema.safeParse({
      key: "zpo-253",
      label: "Klageerwiderung",
      law: "ZPO",
      days: 14,
      description: "Frist zur Klageerwiderung",
    });
    expect(result.success).toBe(true);
  });

  test("rejects rule without days/months/years", () => {
    const result = deadlineRuleSchema.safeParse({
      key: "zpo-253",
      label: "Klageerwiderung",
      law: "ZPO",
      description: "Frist zur Klageerwiderung",
    });
    expect(result.success).toBe(false);
  });
});

describe("deadlineInputSchema", () => {
  test("accepts valid input", () => {
    const result = deadlineInputSchema.safeParse({
      rule: {
        key: "zpo-253",
        label: "Klageerwiderung",
        law: "ZPO",
        days: 14,
        description: "Frist",
      },
      startDate: "2026-06-28",
      state: "BY",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid startDate format", () => {
    const result = deadlineInputSchema.safeParse({
      rule: {
        key: "zpo-253",
        label: "Klageerwiderung",
        law: "ZPO",
        days: 14,
        description: "Frist",
      },
      startDate: "28.06.2026",
    });
    expect(result.success).toBe(false);
  });
});

describe("rvgInputSchema", () => {
  test("accepts non-negative streitwert", () => {
    expect(rvgInputSchema.safeParse({ streitwert: 10000 }).success).toBe(true);
  });

  test("rejects negative streitwert", () => {
    expect(rvgInputSchema.safeParse({ streitwert: -1 }).success).toBe(false);
  });
});

describe("deadlineDetectInputSchema", () => {
  test("accepts valid text", () => {
    expect(deadlineDetectInputSchema.safeParse({ text: "Frist bis 30.06.2026" }).success).toBe(
      true
    );
  });

  test("rejects empty text", () => {
    expect(deadlineDetectInputSchema.safeParse({ text: "" }).success).toBe(false);
  });
});

describe("portalTokenInputSchema", () => {
  test("accepts valid input", () => {
    const result = portalTokenInputSchema.safeParse({ caseSlug: "akte-1" });
    expect(result.success).toBe(true);
  });

  test("rejects ttlSeconds too large", () => {
    const result = portalTokenInputSchema.safeParse({
      caseSlug: "akte-1",
      ttlSeconds: 365 * 24 * 3600 + 1,
    });
    expect(result.success).toBe(false);
  });
});
