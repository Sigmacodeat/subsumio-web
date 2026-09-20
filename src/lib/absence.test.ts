import { describe, it, expect } from "vitest";
import { activeDelegateFor, createAbsence, type AbsenceRecord } from "@/lib/absence";

function absence(over: Partial<AbsenceRecord> = {}): AbsenceRecord {
  return {
    ...createAbsence({
      user_email: "huber@kanzlei.at",
      user_name: "Mag. Huber",
      delegate_email: "berger@kanzlei.at",
      delegate_name: "Dr. Berger",
      start_date: "2026-09-14",
      end_date: "2026-09-28",
    }),
    ...over,
  };
}

const DURING = new Date("2026-09-20T09:00:00Z");
const AFTER = new Date("2026-10-05T09:00:00Z");

describe("activeDelegateFor", () => {
  it("finds the stand-in by the lawyer's name", () => {
    expect(activeDelegateFor("Mag. Huber", [absence()], DURING)).toEqual({
      name: "Dr. Berger",
      email: "berger@kanzlei.at",
      until: "2026-09-28",
    });
  });

  it("finds the stand-in by e-mail, ignoring case and spacing", () => {
    expect(activeDelegateFor("  HUBER@kanzlei.at ", [absence()], DURING)?.name).toBe("Dr. Berger");
  });

  it("returns nothing outside the absence", () => {
    expect(activeDelegateFor("Mag. Huber", [absence()], AFTER)).toBeNull();
  });

  it("returns nothing for a cancelled absence", () => {
    expect(activeDelegateFor("Mag. Huber", [absence({ status: "cancelled" })], DURING)).toBeNull();
  });

  it("returns nothing for another lawyer or an empty name", () => {
    expect(activeDelegateFor("Dr. Berger", [absence()], DURING)).toBeNull();
    expect(activeDelegateFor("", [absence()], DURING)).toBeNull();
    expect(activeDelegateFor(undefined, [absence()], DURING)).toBeNull();
  });
});
