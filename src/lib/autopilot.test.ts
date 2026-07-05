import { describe, expect, it } from "vitest";
import {
  buildApprovalGatedJob,
  createPolicy,
  reserveAutopilotBudget,
  shouldPolicyFire,
} from "@/lib/autopilot";

const policy = createPolicy({
  name: "Test",
  description: "",
  trigger: "document_uploaded",
  action: "summarize_document",
  jobConfig: { prompt: "Summarize" },
  estimatedCostCents: 7,
});

describe("autopilot safety", () => {
  it("stops cleanly before exceeding the nightly budget", () => {
    expect(reserveAutopilotBudget({ capCents: 10, spentCents: 4 }, 7)).toEqual({
      allowed: false,
      budget: { capCents: 10, spentCents: 4 },
    });
  });

  it("forces every generated result through the approval gate", () => {
    expect(buildApprovalGatedJob(policy, "prompt", 20)).toMatchObject({
      output_type: "agent_action",
      approval_required: true,
      approval_status: "pending",
      may_finalize: false,
    });
  });

  it("recognizes all non-intake trigger sources", () => {
    for (const trigger of ["deadline_approaching", "document_uploaded", "rundown_stale"] as const) {
      const candidatePolicy = createPolicy({
        name: trigger,
        description: "",
        trigger,
        action: "create_task",
        jobConfig: { prompt: "test" },
      });
      expect(shouldPolicyFire(candidatePolicy, { trigger })).toBe(true);
    }
  });
});
