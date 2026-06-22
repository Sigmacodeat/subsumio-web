// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  createSpendTracker,
  recordSpend,
  canSpend,
  resetSpendTracker,
  createLoopState,
  startLoop,
  pauseLoop,
  resumeLoop,
  stopLoop,
  completeIteration,
  failIteration,
  requiresApproval,
  requestApproval,
  grantApproval,
  denyApproval,
  checkSpendCap,
  getAuditLog,
  getAuditLogByAction,
  DEFAULT_LOOP_CONFIG,
  PROTECTED_ACTIONS,
  type BrainLoopConfig,
} from "@/lib/brain-loop";

function makeConfig(overrides: Partial<BrainLoopConfig> = {}): BrainLoopConfig {
  return { ...DEFAULT_LOOP_CONFIG, brain_id: "brain-1", ...overrides };
}

describe("createSpendTracker", () => {
  test("creates tracker with cap", () => {
    const tracker = createSpendTracker(10, "daily");
    expect(tracker.cap_usd).toBe(10);
    expect(tracker.spent_usd).toBe(0);
    expect(tracker.remaining_usd).toBe(10);
  });
});

describe("recordSpend", () => {
  test("records transaction", () => {
    const tracker = createSpendTracker(10, "daily");
    const {
      tracker: newTracker,
      exceeded,
      warning,
    } = recordSpend(tracker, {
      action: "sync",
      cost_usd: 2,
      model_id: "test",
      tokens_in: 100,
      tokens_out: 50,
      approved_by: "user-1",
    });
    expect(newTracker.spent_usd).toBe(2);
    expect(newTracker.remaining_usd).toBe(8);
    expect(exceeded).toBe(false);
    expect(warning).toBe(false);
  });

  test("exceeds cap", () => {
    const tracker = createSpendTracker(5, "daily");
    const { tracker: t1 } = recordSpend(tracker, {
      action: "sync",
      cost_usd: 4,
      model_id: "x",
      tokens_in: 0,
      tokens_out: 0,
      approved_by: "u",
    });
    const { exceeded } = recordSpend(t1, {
      action: "sync",
      cost_usd: 2,
      model_id: "x",
      tokens_in: 0,
      tokens_out: 0,
      approved_by: "u",
    });
    expect(exceeded).toBe(true);
  });

  test("warns at 80% usage", () => {
    const tracker = createSpendTracker(10, "daily");
    const { tracker: t1 } = recordSpend(tracker, {
      action: "sync",
      cost_usd: 8,
      model_id: "x",
      tokens_in: 0,
      tokens_out: 0,
      approved_by: "u",
    });
    const { warning } = recordSpend(t1, {
      action: "sync",
      cost_usd: 0.5,
      model_id: "x",
      tokens_in: 0,
      tokens_out: 0,
      approved_by: "u",
    });
    expect(warning).toBe(true);
  });
});

describe("canSpend", () => {
  test("within cap → true", () => {
    const tracker = createSpendTracker(10, "daily");
    expect(canSpend(tracker, 5)).toBe(true);
  });

  test("exceeds cap → false", () => {
    const tracker = createSpendTracker(5, "daily");
    expect(canSpend(tracker, 6)).toBe(false);
  });
});

describe("resetSpendTracker", () => {
  test("resets spent to 0", () => {
    const tracker = createSpendTracker(10, "daily");
    const { tracker: t1 } = recordSpend(tracker, {
      action: "sync",
      cost_usd: 5,
      model_id: "x",
      tokens_in: 0,
      tokens_out: 0,
      approved_by: "u",
    });
    const reset = resetSpendTracker(t1, "daily");
    expect(reset.spent_usd).toBe(0);
    expect(reset.remaining_usd).toBe(10);
  });
});

describe("createLoopState", () => {
  test("creates idle state", () => {
    const state = createLoopState("brain-1", makeConfig());
    expect(state.status).toBe("idle");
    expect(state.brain_id).toBe("brain-1");
    expect(state.spend_tracker.cap_usd).toBe(10);
  });
});

describe("loop lifecycle", () => {
  test("start → running", () => {
    const state = createLoopState("brain-1", makeConfig());
    const started = startLoop(state, "user-1");
    expect(started.status).toBe("running");
    expect(started.started_at).toBeTruthy();
  });

  test("pause → paused", () => {
    let state = createLoopState("brain-1", makeConfig());
    state = startLoop(state, "user-1");
    state = pauseLoop(state, "user-1", "maintenance");
    expect(state.status).toBe("paused");
  });

  test("resume → running", () => {
    let state = createLoopState("brain-1", makeConfig());
    state = startLoop(state, "user-1");
    state = pauseLoop(state, "user-1", "break");
    state = resumeLoop(state, "user-1");
    expect(state.status).toBe("running");
  });

  test("stop → stopped", () => {
    let state = createLoopState("brain-1", makeConfig());
    state = startLoop(state, "user-1");
    state = stopLoop(state, "user-1", "done");
    expect(state.status).toBe("stopped");
  });
});

describe("completeIteration", () => {
  test("increments iteration and records spend", () => {
    const state = createLoopState("brain-1", makeConfig());
    const started = startLoop(state, "user-1");
    const { state: completed } = completeIteration(started, "sync", "user-1", 1.5);
    expect(completed.current_iteration).toBe(2);
    expect(completed.spend_tracker.spent_usd).toBe(1.5);
    expect(completed.last_run_at).toBeTruthy();
  });

  test("stops on spend cap exceeded", () => {
    const config = makeConfig({ spend_cap_usd: 2 });
    let state = createLoopState("brain-1", config);
    state = startLoop(state, "user-1");
    const { state: completed, exceeded } = completeIteration(state, "sync", "user-1", 3);
    expect(exceeded).toBe(true);
    expect(completed.status).toBe("stopped");
  });

  test("warns near spend cap", () => {
    const config = makeConfig({ spend_cap_usd: 10 });
    let state = createLoopState("brain-1", config);
    state = startLoop(state, "user-1");
    state = completeIteration(state, "sync", "user-1", 8).state;
    const { state: warning } = completeIteration(state, "sync", "user-1", 0.5);
    expect(warning).toBe(true);
  });
});

describe("failIteration", () => {
  test("sets error state", () => {
    let state = createLoopState("brain-1", makeConfig());
    state = startLoop(state, "user-1");
    state = failIteration(state, "extract", "API error", "user-1");
    expect(state.status).toBe("error");
    expect(state.last_error).toBe("API error");
  });
});

describe("requiresApproval", () => {
  test("manual → always true", () => {
    const config = makeConfig({ oversight_level: "manual" });
    expect(requiresApproval(config, "sync")).toBe(true);
  });

  test("strict → true for non-auto actions", () => {
    const config = makeConfig({ oversight_level: "strict", auto_actions: ["sync"] });
    expect(requiresApproval(config, "sync")).toBe(false);
    expect(requiresApproval(config, "synthesize")).toBe(true);
  });

  test("light → true only for manual_approval_actions", () => {
    const config = makeConfig({
      oversight_level: "light",
      manual_approval_actions: ["synthesize"],
    });
    expect(requiresApproval(config, "sync")).toBe(false);
    expect(requiresApproval(config, "synthesize")).toBe(true);
  });

  test("none → always false", () => {
    const config = makeConfig({ oversight_level: "none" });
    expect(requiresApproval(config, "synthesize")).toBe(false);
  });
});

describe("approval flow", () => {
  test("request → awaiting_approval", () => {
    let state = createLoopState("brain-1", makeConfig());
    state = startLoop(state, "user-1");
    state = requestApproval(state, makeConfig(), "synthesize", "Protected action", 5);
    expect(state.status).toBe("awaiting_approval");
    expect(state.pending_approval).not.toBeNull();
    expect(state.pending_approval?.action).toBe("synthesize");
  });

  test("grant → running", () => {
    let state = createLoopState("brain-1", makeConfig());
    state = startLoop(state, "user-1");
    state = requestApproval(state, makeConfig(), "synthesize", "Protected", 5);
    state = grantApproval(state, "admin");
    expect(state.status).toBe("running");
    expect(state.pending_approval).toBeNull();
  });

  test("deny → paused", () => {
    let state = createLoopState("brain-1", makeConfig());
    state = startLoop(state, "user-1");
    state = requestApproval(state, makeConfig(), "synthesize", "Protected", 5);
    state = denyApproval(state, "admin", "Too expensive");
    expect(state.status).toBe("paused");
    expect(state.pending_approval).toBeNull();
  });
});

describe("checkSpendCap", () => {
  test("within cap → can proceed", () => {
    const state = createLoopState("brain-1", makeConfig({ spend_cap_usd: 10 }));
    const result = checkSpendCap(state, 5);
    expect(result.can_proceed).toBe(true);
  });

  test("exceeds cap → cannot proceed", () => {
    const state = createLoopState("brain-1", makeConfig({ spend_cap_usd: 5 }));
    const result = checkSpendCap(state, 6);
    expect(result.can_proceed).toBe(false);
    expect(result.reason).toContain("exceeded");
  });
});

describe("audit log", () => {
  test("entries are recorded", () => {
    let state = createLoopState("brain-1", makeConfig());
    state = startLoop(state, "user-1");
    const log = getAuditLog(state);
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].event).toBe("started");
  });

  test("filter by action", () => {
    let state = createLoopState("brain-1", makeConfig());
    state = startLoop(state, "user-1");
    state = completeIteration(state, "sync", "user-1", 1).state;
    const syncLog = getAuditLogByAction(state, "sync");
    expect(syncLog.every((e) => e.action === "sync")).toBe(true);
  });
});

describe("PROTECTED_ACTIONS", () => {
  test("includes consolidate, synthesize, patterns", () => {
    expect(PROTECTED_ACTIONS).toContain("consolidate");
    expect(PROTECTED_ACTIONS).toContain("synthesize");
    expect(PROTECTED_ACTIONS).toContain("patterns");
  });
});
