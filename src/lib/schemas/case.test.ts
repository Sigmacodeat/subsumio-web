// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  caseStatusSchema,
  casePrioritySchema,
  caseFormSchema,
  type CaseFormData,
} from "./case";

describe("caseStatusSchema", () => {
  test("accepts all 7 valid statuses", () => {
    const valid = ["open", "pending", "settled", "won", "lost", "appealed", "dormant"];
    for (const s of valid) {
      expect(caseStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  test("rejects invalid status", () => {
    expect(caseStatusSchema.safeParse("closed").success).toBe(false);
    expect(caseStatusSchema.safeParse("active").success).toBe(false);
    expect(caseStatusSchema.safeParse("").success).toBe(false);
    expect(caseStatusSchema.safeParse("OPEN").success).toBe(false);
  });
});

describe("casePrioritySchema", () => {
  test("accepts all 4 valid priorities", () => {
    const valid = ["low", "medium", "high", "critical"];
    for (const p of valid) {
      expect(casePrioritySchema.safeParse(p).success).toBe(true);
    }
  });

  test("rejects invalid priority", () => {
    expect(casePrioritySchema.safeParse("urgent").success).toBe(false);
    expect(casePrioritySchema.safeParse("").success).toBe(false);
    expect(casePrioritySchema.safeParse("CRITICAL").success).toBe(false);
  });
});

describe("caseFormSchema — valid inputs", () => {
  test("minimal valid form (title + status + priority + portalEnabled)", () => {
    const data = {
      title: "Test Case",
      status: "open",
      priority: "medium",
      portalEnabled: false,
    };
    const result = caseFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("full valid form with all fields", () => {
    const data: CaseFormData = {
      title: "Musterfall GmbH vs. Schuldner AG",
      caseNumber: "2026-001",
      legalArea: "Zivilrecht",
      subArea: "Vertragsrecht",
      status: "pending",
      priority: "high",
      clientName: "Max Mustermann",
      clientSlug: "contact/max-mustermann",
      opponentName: "Gegner AG",
      opponentSlug: "contact/gegner-ag",
      courtName: "LG Wien",
      courtSlug: "contact/lg-wien",
      lawyerName: "Dr. Schmidt",
      lawyerSlug: "contact/dr-schmidt",
      facts: "Kläger begehrt Schadensersatz aus Vertrag vom 1.3.2024.",
      tags: "Vertragsbruch, Schadensersatz",
      portalEnabled: true,
    };
    const result = caseFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("empty optional fields are valid", () => {
    const data = {
      title: "Minimal Case",
      status: "open",
      priority: "low",
      clientName: "",
      opponentName: "",
      courtName: "",
      lawyerName: "",
      facts: "",
      tags: "",
      portalEnabled: false,
    };
    const result = caseFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe("caseFormSchema — invalid inputs", () => {
  test("missing title is invalid", () => {
    const result = caseFormSchema.safeParse({
      status: "open",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(false);
  });

  test("empty title is invalid", () => {
    const result = caseFormSchema.safeParse({
      title: "",
      status: "open",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(false);
  });

  test("title over 300 chars is invalid", () => {
    const result = caseFormSchema.safeParse({
      title: "A".repeat(301),
      status: "open",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(false);
  });

  test("missing status is invalid", () => {
    const result = caseFormSchema.safeParse({
      title: "Test",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(false);
  });

  test("missing priority is invalid", () => {
    const result = caseFormSchema.safeParse({
      title: "Test",
      status: "open",
      portalEnabled: false,
    });
    expect(result.success).toBe(false);
  });

  test("missing portalEnabled is invalid", () => {
    const result = caseFormSchema.safeParse({
      title: "Test",
      status: "open",
      priority: "medium",
    });
    expect(result.success).toBe(false);
  });

  test("invalid status value is rejected", () => {
    const result = caseFormSchema.safeParse({
      title: "Test",
      status: "closed",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(false);
  });

  test("caseNumber over 100 chars is invalid", () => {
    const result = caseFormSchema.safeParse({
      title: "Test",
      caseNumber: "X".repeat(101),
      status: "open",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(false);
  });

  test("facts over 10000 chars is invalid", () => {
    const result = caseFormSchema.safeParse({
      title: "Test",
      facts: "A".repeat(10001),
      status: "open",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(false);
  });

  test("legalArea over 100 chars is invalid", () => {
    const result = caseFormSchema.safeParse({
      title: "Test",
      legalArea: "X".repeat(101),
      status: "open",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(false);
  });

  test("clientName over 200 chars is invalid", () => {
    const result = caseFormSchema.safeParse({
      title: "Test",
      clientName: "X".repeat(201),
      status: "open",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("caseFormSchema — boundary values", () => {
  test("title of exactly 300 chars is valid", () => {
    const result = caseFormSchema.safeParse({
      title: "A".repeat(300),
      status: "open",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  test("caseNumber of exactly 100 chars is valid", () => {
    const result = caseFormSchema.safeParse({
      title: "Test",
      caseNumber: "X".repeat(100),
      status: "open",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  test("facts of exactly 10000 chars is valid", () => {
    const result = caseFormSchema.safeParse({
      title: "Test",
      facts: "A".repeat(10000),
      status: "open",
      priority: "medium",
      portalEnabled: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("caseFormSchema — type inference", () => {
  test("parsed data has correct shape", () => {
    const data = {
      title: "Test Case",
      status: "open" as const,
      priority: "medium" as const,
      portalEnabled: true,
    };
    const result = caseFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Test Case");
      expect(result.data.status).toBe("open");
      expect(result.data.priority).toBe("medium");
      expect(result.data.portalEnabled).toBe(true);
    }
  });
});
