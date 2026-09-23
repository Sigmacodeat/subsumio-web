import { describe, expect, test } from "vitest";

// Altmodell: nur noch die Parser für die Übernahme (automation-migration.ts).
import { parseAutomationAction, parseAutomationTrigger } from "./automation-rules";

describe("parseAutomationTrigger / parseAutomationAction", () => {
  test("gültiger Trigger wird übernommen, days geclamped", () => {
    expect(parseAutomationTrigger({ type: "deadline_approaching", days: 3 })).toEqual({
      type: "deadline_approaching",
      days: 3,
    });
    expect(parseAutomationTrigger({ type: "deadline_approaching", days: 999 })).toEqual({
      type: "deadline_approaching",
    });
  });

  test("unbekannter Trigger → null", () => {
    expect(parseAutomationTrigger({ type: "bogus" })).toBeNull();
    expect(parseAutomationTrigger(null)).toBeNull();
  });

  test("set_status ohne Status → null", () => {
    expect(parseAutomationAction({ type: "set_status" })).toBeNull();
    expect(parseAutomationAction({ type: "set_status", status: "review" })).toEqual({
      type: "set_status",
      status: "review",
    });
  });
});
