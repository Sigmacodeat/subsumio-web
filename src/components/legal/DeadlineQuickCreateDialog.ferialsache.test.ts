// @vitest-environment node
// Source guard for the quick-create dialog (Radix selects are not drivable in
// jsdom): the Ferialsache answer reaches the engine, an unanswered vhfZ
// extension blocks saving, and "heute" is the Vienna calendar day.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ferialsacheAnswerMissing,
  ferialsacheQuestionVisible,
} from "@/components/legal/ferialsache-field";
import { computeFrist } from "@/lib/legal/frist-options";

const src = readFileSync(
  path.join(process.cwd(), "src/components/legal/DeadlineQuickCreateDialog.tsx"),
  "utf8"
);

describe("DeadlineQuickCreateDialog — Ferialsache (FRI-3) und heute (FRI-16)", () => {
  it("passes the Ferialsache answer to computeFrist and blocks saving while it is open", () => {
    expect(src).toMatch(/ferialsache:\s*ferialsache === true/);
    expect(src).toMatch(/ferialsacheAnswerMissing\(fristCalc, ferialsache\)/);
    expect(src).toContain("<FerialsacheField");
  });

  it("defaults the date to the Vienna calendar day, not the UTC date", () => {
    expect(src).not.toContain('new Date().toISOString().split("T")[0]');
    expect(src).toContain("zonedDateString(new Date())");
  });

  it("§ 222 Abs 1/2 ZPO: the question is mandatory exactly when the vhfZ extends the period", () => {
    const inVhfz = computeFrist("rekurs", "2026-07-20", { country: "AT" });
    expect(ferialsacheQuestionVisible(inVhfz, null)).toBe(true);
    expect(ferialsacheAnswerMissing(inVhfz, null)).toBe(true);
    expect(ferialsacheAnswerMissing(inVhfz, false)).toBe(false);

    const outside = computeFrist("rekurs", "2026-03-02", { country: "AT" });
    expect(ferialsacheQuestionVisible(outside, null)).toBe(false);
    expect(ferialsacheAnswerMissing(outside, null)).toBe(false);

    const answeredYes = computeFrist("rekurs", "2026-07-20", { country: "AT", ferialsache: true });
    expect(ferialsacheQuestionVisible(answeredYes, true)).toBe(true);
    expect(ferialsacheAnswerMissing(answeredYes, true)).toBe(false);
  });
});
