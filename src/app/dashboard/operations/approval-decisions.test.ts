// UIS-5-9: a bulk rejection needs a written reason like a single one; bulk
// approval and the "a" shortcut ask before executing.
import { describe, expect, it } from "vitest";
import { approveConfirmOptions, buildRejectRequests } from "./approval-decisions";

describe("buildRejectRequests", () => {
  it("refuses a blank reason — no placeholder text for bulk rejections", () => {
    expect(buildRejectRequests(["a", "b"], "")).toBeNull();
    expect(buildRejectRequests(["a", "b"], "   ")).toBeNull();
  });

  it("builds one request per selected approval with the user's reason", () => {
    expect(buildRejectRequests(["a", "b"], "  Frist falsch berechnet ")).toEqual([
      { actionSlug: "a", decision: "rejected", reason: "Frist falsch berechnet" },
      { actionSlug: "b", decision: "rejected", reason: "Frist falsch berechnet" },
    ]);
  });

  it("returns null without any selection", () => {
    expect(buildRejectRequests([], "Grund")).toBeNull();
  });
});

describe("approveConfirmOptions", () => {
  it("names the count and that actions run immediately", () => {
    const opts = approveConfirmOptions(3, "de");
    expect(opts.title).toBe("3 Aktionen freigeben?");
    expect(opts.message).toContain("sofort ausgeführt");
  });

  it("has a single-item variant for the keyboard shortcut", () => {
    expect(approveConfirmOptions(1, "de").title).toBe("Aktion freigeben?");
  });
});
