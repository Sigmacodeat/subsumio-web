import { describe, expect, it } from "vitest";
import { daysUntil, inTimeWindow } from "./fristenbuch-window";

const NOW = new Date("2026-09-14T09:30:00Z");

describe("daysUntil", () => {
  it("counts calendar days independent of time of day", () => {
    expect(daysUntil("2026-09-14", NOW)).toBe(0);
    expect(daysUntil("2026-09-15", NOW)).toBe(1);
    expect(daysUntil("2026-09-11", NOW)).toBe(-3);
  });
});

describe("inTimeWindow", () => {
  it("always keeps open overdue deadlines on the control list", () => {
    expect(inTimeWindow({ due_date: "2026-09-01", status: "overdue" }, "today", NOW)).toBe(true);
  });

  it("drops completed past deadlines from the control list", () => {
    expect(inTimeWindow({ due_date: "2026-09-01", status: "done" }, "today", NOW)).toBe(false);
  });

  it("includes deadlines due today and within the horizon", () => {
    expect(inTimeWindow({ due_date: "2026-09-14", status: "critical" }, "today", NOW)).toBe(true);
    expect(inTimeWindow({ due_date: "2026-09-20", status: "pending" }, "7", NOW)).toBe(true);
    expect(inTimeWindow({ due_date: "2026-09-25", status: "pending" }, "7", NOW)).toBe(false);
    expect(inTimeWindow({ due_date: "2026-09-25", status: "pending" }, "14", NOW)).toBe(true);
  });

  it("includes open deadlines whose pre-deadline falls in the window", () => {
    const d = { due_date: "2026-10-01", vorfrist_date: "2026-09-14", status: "vorfrist" };
    expect(inTimeWindow(d, "today", NOW)).toBe(true);
    expect(inTimeWindow({ ...d, status: "done" }, "today", NOW)).toBe(false);
  });

  it("shows everything for the all window", () => {
    expect(inTimeWindow({ due_date: "2027-01-01", status: "pending" }, "all", NOW)).toBe(true);
  });
});
