import { describe, expect, it } from "vitest";
import { disputeValueFromInput, formatDisputeValueInput } from "./dispute-value";

describe("disputeValueFromInput (W4-03)", () => {
  it("reads Austrian amounts", () => {
    expect(disputeValueFromInput("12.000")).toEqual({ ok: true, value: 12000 });
    expect(disputeValueFromInput("12.000,50 €")).toEqual({ ok: true, value: 12000.5 });
    expect(disputeValueFromInput("12000.50")).toEqual({ ok: true, value: 12000.5 });
  });
  it("empty clears, garbage and negatives are refused", () => {
    expect(disputeValueFromInput("  ")).toEqual({ ok: true, value: null });
    expect(disputeValueFromInput("zwölf")).toEqual({ ok: false });
    expect(disputeValueFromInput("-5")).toEqual({ ok: false });
  });
  it("formats the stored value for the field", () => {
    expect(formatDisputeValueInput(12000.5)).toBe("12.000,5");
    // What is shown is read back to the same number.
    expect(disputeValueFromInput(formatDisputeValueInput(1234567.25))).toEqual({
      ok: true,
      value: 1234567.25,
    });
    expect(formatDisputeValueInput(undefined)).toBe("");
  });
});
