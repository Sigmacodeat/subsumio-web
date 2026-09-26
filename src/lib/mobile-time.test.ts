import { describe, expect, it } from "vitest";
import {
  IDLE_TIMER,
  buildMobileTimeEntry,
  pauseTimer,
  startTimer,
  timerElapsedSeconds,
} from "./mobile-time";

describe("mobile timer", () => {
  it("counts wall-clock time, so 10 minutes in the background are not lost", () => {
    const t0 = Date.UTC(2026, 8, 26, 8, 0, 0);
    const running = startTimer(IDLE_TIMER, t0);
    // No ticks happened while the app was in the background.
    expect(timerElapsedSeconds(running, t0 + 10 * 60_000)).toBe(600);
  });

  it("pause and resume add up the running phases only", () => {
    const t0 = 1_000_000;
    let s = startTimer(IDLE_TIMER, t0);
    s = pauseTimer(s, t0 + 60_000);
    expect(timerElapsedSeconds(s, t0 + 10 * 60_000)).toBe(60);
    s = startTimer(s, t0 + 10 * 60_000);
    expect(timerElapsedSeconds(s, t0 + 11 * 60_000)).toBe(120);
  });
});

describe("mobile time entry", () => {
  it("without a matter nothing is booked", () => {
    const r = buildMobileTimeEntry({
      caseSlug: "",
      description: "Telefonat",
      durationSecs: 600,
      at: new Date(),
      billable: true,
    });
    expect(r.ok).toBe(false);
  });

  it("books minutes, matter and billable like the desktop entry", () => {
    const r = buildMobileTimeEntry({
      caseSlug: "cases/a",
      description: " Telefonat ",
      durationSecs: 25 * 60 + 20,
      at: new Date("2026-09-26T08:00:00Z"),
      billable: true,
    });
    expect(r).toEqual({
      ok: true,
      body: {
        case_slug: "cases/a",
        description: "Telefonat",
        minutes: 25,
        date: "2026-09-26",
        billable: true,
        activity_type: "other",
      },
    });
  });

  it("at 00:30 Vienna time the local date is booked, not the UTC day before", () => {
    // 00:30 CEST on 26 Sep = 22:30 UTC on 25 Sep.
    const r = buildMobileTimeEntry({
      caseSlug: "cases/a",
      description: "",
      durationSecs: 60,
      at: new Date("2026-09-25T22:30:00Z"),
      billable: false,
    });
    expect(r.ok && r.body.date).toBe("2026-09-26");
    expect(r.ok && r.body.billable).toBe(false);
  });
});
