// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  PHASE_ORDER,
  canAdvancePhase,
  getNextPhases,
  getPhaseProgress,
  generateDefaultSteps,
  parseLitigationMatter,
  PHASE_LABELS_DE,
  PHASE_LABELS_EN,
  STEP_TYPE_LABELS_DE,
  STEP_STATUS_LABELS_DE,
  type LitigationPhase,
} from "./litigation-flow";

describe("PHASE_ORDER", () => {
  test("has 9 phases in expected order", () => {
    expect(PHASE_ORDER).toEqual([
      "pre_filing",
      "filing",
      "discovery",
      "pre_trial",
      "trial",
      "post_trial",
      "appeal",
      "enforcement",
      "closed",
    ]);
  });
});

describe("canAdvancePhase", () => {
  test("allows valid forward transitions", () => {
    expect(canAdvancePhase("pre_filing", "filing")).toBe(true);
    expect(canAdvancePhase("filing", "discovery")).toBe(true);
    expect(canAdvancePhase("trial", "post_trial")).toBe(true);
  });

  test("allows jump to closed from most phases", () => {
    expect(canAdvancePhase("pre_filing", "closed")).toBe(true);
    expect(canAdvancePhase("discovery", "closed")).toBe(true);
    expect(canAdvancePhase("enforcement", "closed")).toBe(true);
  });

  test("disallows invalid transitions", () => {
    expect(canAdvancePhase("closed", "trial")).toBe(false);
    expect(canAdvancePhase("filing", "appeal")).toBe(false);
    expect(canAdvancePhase("pre_filing", "enforcement")).toBe(false);
  });

  test("unknown phase returns false", () => {
    expect(canAdvancePhase("unknown" as LitigationPhase, "filing")).toBe(false);
  });
});

describe("getNextPhases", () => {
  test("returns possible next phases", () => {
    expect(getNextPhases("post_trial")).toEqual(["appeal", "enforcement", "closed"]);
  });

  test("returns empty array for unknown phase", () => {
    expect(getNextPhases("unknown" as LitigationPhase)).toEqual([]);
  });
});

describe("getPhaseProgress", () => {
  test("pre_filing is 0%", () => {
    expect(getPhaseProgress("pre_filing")).toBe(0);
  });

  test("closed is 100%", () => {
    expect(getPhaseProgress("closed")).toBe(100);
  });

  test("trial is roughly 50%", () => {
    expect(getPhaseProgress("trial")).toBe(50);
  });

  test("unknown phase is 0%", () => {
    expect(getPhaseProgress("unknown" as LitigationPhase)).toBe(0);
  });
});

describe("generateDefaultSteps", () => {
  test("generates default steps for a phase", () => {
    const steps = generateDefaultSteps("filing");
    expect(steps.length).toBe(3);
    expect(steps[0].type).toBe("filing");
    expect(steps[0].status).toBe("pending");
    expect(steps[0].title).toBe("Klageschrift");
  });

  test("returns empty array for unknown phase", () => {
    const steps = generateDefaultSteps("unknown" as LitigationPhase);
    expect(steps).toEqual([]);
  });

  test("generated steps have unique ids", () => {
    const steps = generateDefaultSteps("pre_filing");
    const ids = new Set(steps.map((s) => s.id));
    expect(ids.size).toBe(steps.length);
  });
});

describe("parseLitigationMatter", () => {
  test("parses valid litigation matter frontmatter", () => {
    const matter = parseLitigationMatter("lm-1", {
      type: "litigation_matter",
      case_slug: "case-1",
      case_title: "Test Case",
      phase: "discovery",
      court: "LG München",
      court_file_number: "1 O 123/26",
      instance: "1. Instanz",
    });
    expect(matter).not.toBeNull();
    expect(matter?.caseSlug).toBe("case-1");
    expect(matter?.phase).toBe("discovery");
    expect(matter?.court).toBe("LG München");
  });

  test("returns null for non-litigation-matter type", () => {
    const matter = parseLitigationMatter("lm-1", { type: "case" });
    expect(matter).toBeNull();
  });

  test("defaults missing fields", () => {
    const matter = parseLitigationMatter("lm-1", { type: "litigation_matter" });
    expect(matter?.phase).toBe("pre_filing");
    expect(matter?.instance).toBe("1. Instanz");
  });
});

describe("labels", () => {
  test("phase labels cover all phases", () => {
    for (const phase of PHASE_ORDER) {
      expect(PHASE_LABELS_DE[phase]).toBeDefined();
      expect(PHASE_LABELS_EN[phase]).toBeDefined();
    }
  });

  test("step type labels cover common types", () => {
    const types: import("./litigation-flow").StepType[] = [
      "task",
      "filing",
      "motion",
      "hearing",
      "deadline",
      "document",
      "communication",
      "evidence",
      "settlement",
      "enforcement",
    ];
    for (const type of types) {
      expect(STEP_TYPE_LABELS_DE[type]).toBeDefined();
    }
  });

  test("step status labels cover all statuses", () => {
    const statuses: import("./litigation-flow").StepStatus[] = [
      "pending",
      "in_progress",
      "completed",
      "blocked",
      "skipped",
    ];
    for (const status of statuses) {
      expect(STEP_STATUS_LABELS_DE[status]).toBeDefined();
    }
  });
});
