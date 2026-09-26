import { describe, expect, it } from "vitest";
import {
  appointmentStart,
  dueAppointmentReminders,
  reminderSentFields,
} from "./appointment-reminder-schedule";

// A calendar-editor appointment: no reminder_at, no WhatsApp.
const summer = { type: "appointment", date: "2026-07-15", time: "09:00", status: "scheduled" };
const winter = { type: "appointment", date: "2026-12-10", time: "09:00", status: "scheduled" };

describe("appointmentStart", () => {
  it("reads date/time as Vienna wall time in summer and winter", () => {
    expect(appointmentStart(summer)?.toISOString()).toBe("2026-07-15T07:00:00.000Z");
    expect(appointmentStart(winter)?.toISOString()).toBe("2026-12-10T08:00:00.000Z");
  });
});

describe("dueAppointmentReminders", () => {
  it("reminds a calendar appointment 24 h ahead (summer: 07:00 UTC the day before)", () => {
    expect(dueAppointmentReminders(summer, new Date("2026-07-14T06:59:00Z"))).toEqual([]);
    const due = dueAppointmentReminders(summer, new Date("2026-07-14T07:00:00Z"));
    expect(due.map((d) => d.stage)).toEqual(["main"]);
  });

  it("reminds 24 h ahead in winter time (08:00 UTC the day before)", () => {
    expect(dueAppointmentReminders(winter, new Date("2026-12-09T07:59:00Z"))).toEqual([]);
    expect(dueAppointmentReminders(winter, new Date("2026-12-09T08:00:00Z"))).toHaveLength(1);
  });

  it("honours the editor's reminder_minutes, and 0 switches reminders off", () => {
    const oneHour = { ...summer, reminder_minutes: 60 };
    expect(dueAppointmentReminders(oneHour, new Date("2026-07-15T05:30:00Z"))).toEqual([]);
    expect(dueAppointmentReminders(oneHour, new Date("2026-07-15T06:00:00Z"))).toHaveLength(1);
    const off = { ...summer, reminder_minutes: 0 };
    expect(dueAppointmentReminders(off, new Date("2026-07-15T06:30:00Z"))).toEqual([]);
  });

  it("keeps an explicit WhatsApp reminder_at", () => {
    const wa = { ...summer, reminder_at: "2026-07-15T05:00:00.000Z" };
    expect(dueAppointmentReminders(wa, new Date("2026-07-14T08:00:00Z"))).toEqual([]);
    expect(dueAppointmentReminders(wa, new Date("2026-07-15T05:00:00Z"))).toHaveLength(1);
  });

  it("never reminds after the start, for cancelled ones, or twice for the same time", () => {
    expect(dueAppointmentReminders(summer, new Date("2026-07-15T07:30:00Z"))).toEqual([]);
    expect(
      dueAppointmentReminders({ ...summer, status: "cancelled" }, new Date("2026-07-14T08:00:00Z"))
    ).toEqual([]);
    const now = new Date("2026-07-14T08:00:00Z");
    const sent = { ...summer, ...reminderSentFields("main", "2026-07-15T09:00", now) };
    expect(dueAppointmentReminders(sent, now)).toEqual([]);
    // Moved to the next day → reminded again for the new time.
    const moved = { ...sent, date: "2026-07-16" };
    expect(dueAppointmentReminders(moved, new Date("2026-07-15T08:00:00Z"))).toHaveLength(1);
  });

  it("adds an early reminder 7 days before a hearing", () => {
    const hearing = { ...summer, appointment_type: "hearing" };
    const early = dueAppointmentReminders(hearing, new Date("2026-07-08T07:00:00Z"));
    expect(early.map((d) => d.stage)).toEqual(["early"]);
    const afterEarly = {
      ...hearing,
      ...reminderSentFields("early", early[0].sentFor, new Date("2026-07-08T07:00:00Z")),
    };
    expect(dueAppointmentReminders(afterEarly, new Date("2026-07-10T07:00:00Z"))).toEqual([]);
    expect(
      dueAppointmentReminders(afterEarly, new Date("2026-07-14T07:00:00Z")).map((d) => d.stage)
    ).toEqual(["main"]);
  });
});
