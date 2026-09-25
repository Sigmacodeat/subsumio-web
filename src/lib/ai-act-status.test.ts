import { describe, expect, it } from "vitest";
import { art14OversightStatus } from "./ai-act-status";
import { APPROVAL_DECIDER_ROLES } from "./approval-decision";

describe("art14OversightStatus (OPS-24)", () => {
  it("is compliant with the enforced decider roles (lawyer/admin only)", () => {
    expect([...APPROVAL_DECIDER_ROLES].sort()).toEqual(["admin", "lawyer"]);
    expect(art14OversightStatus()).toBe("compliant");
  });

  it("drops to partial as soon as an assistant may decide", () => {
    expect(art14OversightStatus(new Set(["admin", "lawyer", "assistant"]))).toBe("partial");
  });

  it("is never compliant without any decider", () => {
    expect(art14OversightStatus(new Set())).toBe("partial");
  });
});
