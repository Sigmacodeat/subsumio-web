// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  deadlineFormSchema,
  evidenceFormSchema,
  timeEntryFormSchema,
  expenseFormSchema,
} from "./case-detail";

describe("deadlineFormSchema", () => {
  test("accepts valid deadline", () => {
    const result = deadlineFormSchema.safeParse({
      title: "Frist",
      due_date: "2026-06-30",
      type: "deadline",
      status: "pending",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty title", () => {
    const result = deadlineFormSchema.safeParse({
      title: "",
      due_date: "2026-06-30",
      type: "deadline",
      status: "pending",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid type", () => {
    const result = deadlineFormSchema.safeParse({
      title: "Frist",
      due_date: "2026-06-30",
      type: "invalid",
      status: "pending",
    });
    expect(result.success).toBe(false);
  });
});

describe("evidenceFormSchema", () => {
  test("accepts valid evidence", () => {
    const result = evidenceFormSchema.safeParse({
      title: "Beweis",
      weight: 0.5,
    });
    expect(result.success).toBe(true);
  });

  test("rejects weight out of range", () => {
    const result = evidenceFormSchema.safeParse({
      title: "Beweis",
      weight: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("timeEntryFormSchema", () => {
  test("accepts valid time entry", () => {
    const result = timeEntryFormSchema.safeParse({
      description: "Recherche",
      minutes: "60",
      activity_type: "research",
      billable: true,
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty description", () => {
    const result = timeEntryFormSchema.safeParse({
      description: "",
      minutes: "60",
      activity_type: "research",
      billable: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("expenseFormSchema", () => {
  test("accepts valid expense", () => {
    const result = expenseFormSchema.safeParse({
      description: "Kosten",
      amount: "100",
      billable: true,
    });
    expect(result.success).toBe(true);
  });
});
