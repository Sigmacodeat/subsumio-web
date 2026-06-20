// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  canTransition,
  validateTransition,
  getAllowedTransitions,
  isTerminal,
  isActive,
  transitionDescription,
  validatePriority,
  suggestPriority,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES,
  STATUS_LABELS_DE,
  type CaseStatus,
} from "./case-status";

describe("canTransition — allowed transitions", () => {
  test("open → pending is allowed", () => {
    expect(canTransition("open", "pending")).toBe(true);
  });

  test("open → settled is allowed", () => {
    expect(canTransition("open", "settled")).toBe(true);
  });

  test("open → won is allowed", () => {
    expect(canTransition("open", "won")).toBe(true);
  });

  test("open → lost is allowed", () => {
    expect(canTransition("open", "lost")).toBe(true);
  });

  test("open → dormant is allowed", () => {
    expect(canTransition("open", "dormant")).toBe(true);
  });

  test("pending → open is allowed (reactivation)", () => {
    expect(canTransition("pending", "open")).toBe(true);
  });

  test("won → appealed is allowed", () => {
    expect(canTransition("won", "appealed")).toBe(true);
  });

  test("lost → appealed is allowed", () => {
    expect(canTransition("lost", "appealed")).toBe(true);
  });

  test("appealed → open is allowed (new instance)", () => {
    expect(canTransition("appealed", "open")).toBe(true);
  });

  test("appealed → won is allowed", () => {
    expect(canTransition("appealed", "won")).toBe(true);
  });

  test("appealed → lost is allowed", () => {
    expect(canTransition("appealed", "lost")).toBe(true);
  });

  test("dormant → open is allowed", () => {
    expect(canTransition("dormant", "open")).toBe(true);
  });

  test("dormant → pending is allowed", () => {
    expect(canTransition("dormant", "pending")).toBe(true);
  });
});

describe("canTransition — disallowed transitions", () => {
  test("settled → won is NOT allowed (case is final)", () => {
    expect(canTransition("settled", "won")).toBe(false);
  });

  test("settled → lost is NOT allowed", () => {
    expect(canTransition("settled", "lost")).toBe(false);
  });

  test("settled → open is NOT allowed (only dormant)", () => {
    expect(canTransition("settled", "open")).toBe(false);
  });

  test("won → open is NOT allowed (must go through appealed)", () => {
    expect(canTransition("won", "open")).toBe(false);
  });

  test("lost → open is NOT allowed", () => {
    expect(canTransition("lost", "open")).toBe(false);
  });

  test("open → appealed is NOT allowed (must have won/lost first)", () => {
    expect(canTransition("open", "appealed")).toBe(false);
  });
});

describe("validateTransition", () => {
  test("same status is allowed (no change)", () => {
    const result = validateTransition("open", "open");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("no_change");
  });

  test("valid transition returns allowed with no reason", () => {
    const result = validateTransition("open", "pending");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test("invalid transition returns reason", () => {
    const result = validateTransition("settled", "won");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("transition_settled_to_won_not_allowed");
  });
});

describe("getAllowedTransitions", () => {
  test("open allows 5 transitions", () => {
    const allowed = getAllowedTransitions("open");
    expect(allowed).toHaveLength(5);
    expect(allowed).toContain("pending");
    expect(allowed).toContain("settled");
    expect(allowed).toContain("won");
    expect(allowed).toContain("lost");
    expect(allowed).toContain("dormant");
  });

  test("settled only allows dormant", () => {
    expect(getAllowedTransitions("settled")).toEqual(["dormant"]);
  });

  test("dormant allows open and pending", () => {
    const allowed = getAllowedTransitions("dormant");
    expect(allowed).toEqual(["open", "pending"]);
  });
});

describe("isTerminal", () => {
  test("settled is terminal", () => {
    expect(isTerminal("settled")).toBe(true);
  });

  test("won is terminal", () => {
    expect(isTerminal("won")).toBe(true);
  });

  test("lost is terminal", () => {
    expect(isTerminal("lost")).toBe(true);
  });

  test("open is NOT terminal", () => {
    expect(isTerminal("open")).toBe(false);
  });

  test("appealed is NOT terminal", () => {
    expect(isTerminal("appealed")).toBe(false);
  });
});

describe("isActive", () => {
  test("open is active", () => {
    expect(isActive("open")).toBe(true);
  });

  test("pending is active", () => {
    expect(isActive("pending")).toBe(true);
  });

  test("appealed is active", () => {
    expect(isActive("appealed")).toBe(true);
  });

  test("dormant is NOT active", () => {
    expect(isActive("dormant")).toBe(false);
  });

  test("won is NOT active", () => {
    expect(isActive("won")).toBe(false);
  });
});

describe("TERMINAL_STATUSES & ACTIVE_STATUSES", () => {
  test("TERMINAL_STATUSES has 3 entries", () => {
    expect(TERMINAL_STATUSES).toHaveLength(3);
  });

  test("ACTIVE_STATUSES has 3 entries", () => {
    expect(ACTIVE_STATUSES).toHaveLength(3);
  });

  test("no overlap between terminal and active", () => {
    for (const s of ACTIVE_STATUSES) {
      expect(TERMINAL_STATUSES).not.toContain(s);
    }
  });
});

describe("STATUS_LABELS_DE", () => {
  test("all 7 statuses have labels", () => {
    const statuses: CaseStatus[] = ["open", "pending", "settled", "won", "lost", "appealed", "dormant"];
    for (const s of statuses) {
      expect(STATUS_LABELS_DE[s]).toBeTruthy();
      expect(STATUS_LABELS_DE[s].length).toBeGreaterThan(0);
    }
  });
});

describe("transitionDescription", () => {
  test("produces readable German description", () => {
    const desc = transitionDescription("open", "won");
    expect(desc).toContain("Offen");
    expect(desc).toContain("Gewonnen");
    expect(desc).toContain("→");
  });

  test("handles appealed transition", () => {
    const desc = transitionDescription("won", "appealed");
    expect(desc).toContain("Gewonnen");
    expect(desc).toContain("Berufung");
  });
});

describe("validatePriority", () => {
  test("valid priorities return the priority", () => {
    expect(validatePriority("low")).toBe("low");
    expect(validatePriority("medium")).toBe("medium");
    expect(validatePriority("high")).toBe("high");
    expect(validatePriority("critical")).toBe("critical");
  });

  test("invalid priority returns null", () => {
    expect(validatePriority("urgent")).toBeNull();
    expect(validatePriority("")).toBeNull();
    expect(validatePriority("HIGH")).toBeNull();
  });
});

describe("suggestPriority", () => {
  test("critical deadline → critical priority", () => {
    expect(suggestPriority("open", true, 1)).toBe("critical");
  });

  test("deadline within 3 days → high", () => {
    expect(suggestPriority("open", false, 2)).toBe("high");
  });

  test("deadline within 14 days → medium", () => {
    expect(suggestPriority("open", false, 10)).toBe("medium");
  });

  test("no deadlines → medium for open", () => {
    expect(suggestPriority("open", false, null)).toBe("medium");
  });

  test("dormant → low", () => {
    expect(suggestPriority("dormant", false, null)).toBe("low");
  });

  test("appealed → high regardless of deadlines", () => {
    expect(suggestPriority("appealed", false, null)).toBe("high");
  });

  test("appealed with critical deadline → still high (not critical)", () => {
    expect(suggestPriority("appealed", true, 1)).toBe("high");
  });
});
