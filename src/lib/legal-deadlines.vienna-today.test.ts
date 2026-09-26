// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { computeDeadlineStatus } from "./legal-deadlines";

describe("computeDeadlineStatus — „heute“ in Europe/Vienna (FRI-16)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("Winterzeit: 2026-03-10T23:30Z ist in Wien der 11.03. — eine Frist vom 10.03. ist überfällig", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T23:30:00Z"));
    expect(computeDeadlineStatus("2026-03-10")).toBe("overdue");
    expect(computeDeadlineStatus("2026-03-11")).toBe("critical");
  });

  test("Sommerzeit: 2026-07-14T22:30Z ist in Wien der 15.07.", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T22:30:00Z"));
    expect(computeDeadlineStatus("2026-07-14")).toBe("overdue");
  });

  test("Zeitumstellung: 2026-03-28T23:30Z ist in Wien der 29.03.", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28T23:30:00Z"));
    expect(computeDeadlineStatus("2026-03-28")).toBe("overdue");
  });

  test("Jahreswechsel: 2026-12-31T23:15Z ist in Wien der 01.01.2027", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:15:00Z"));
    expect(computeDeadlineStatus("2026-12-31")).toBe("overdue");
    expect(computeDeadlineStatus("2027-01-08")).toBe("warning");
    expect(computeDeadlineStatus("2027-01-09")).toBe("pending");
  });
});
