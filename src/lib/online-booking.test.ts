import { describe, test, expect } from "vitest";
import { generateSlots, checkBookingConflict, createBookingFrontmatter } from "./online-booking";

describe("online-booking", () => {
  describe("generateSlots", () => {
    test("generates slots for a working day", () => {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      date.setHours(0, 0, 0, 0);
      const slots = generateSlots(date, { start: "09:00", end: "10:00" }, 30, []);
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0]!.status).toBe("available");
    });

    test("marks existing bookings as booked", () => {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      date.setHours(0, 0, 0, 0);
      const bookingStart = new Date(date);
      bookingStart.setHours(9, 0, 0, 0);
      const bookingEnd = new Date(bookingStart.getTime() + 30 * 60_000);
      const existing = [{ start: bookingStart.toISOString(), end: bookingEnd.toISOString() }];
      const slots = generateSlots(date, { start: "09:00", end: "10:00" }, 30, existing);
      const booked = slots.filter((s) => s.status === "booked");
      expect(booked.length).toBeGreaterThan(0);
    });

    test("respects 2-hour buffer from now", () => {
      const now = new Date();
      const slots = generateSlots(now, { start: "00:00", end: "23:59" }, 60, []);
      const allInPast = slots.every(
        (s) => new Date(s.start) > new Date(Date.now() + 1.5 * 3600000)
      );
      expect(allInPast).toBe(true);
    });
  });

  describe("checkBookingConflict", () => {
    test("returns conflict for non-existent slot", () => {
      const result = checkBookingConflict(
        {
          kanzlei_slug: "k1",
          slot_id: "nonexistent",
          client_name: "Test",
          client_email: "t@t.de",
          matter: "X",
        },
        []
      );
      expect(result.hasConflict).toBe(true);
      expect(result.reason).toBe("slot_not_found");
    });

    test("returns no conflict for available slot", () => {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      date.setHours(0, 0, 0, 0);
      const slots = generateSlots(date, { start: "09:00", end: "10:00" }, 30, []);
      expect(slots.length).toBeGreaterThan(0);
      const result = checkBookingConflict(
        {
          kanzlei_slug: "k1",
          slot_id: slots[0]!.id,
          client_name: "Test",
          client_email: "t@t.de",
          matter: "X",
        },
        slots
      );
      expect(result.hasConflict).toBe(false);
    });
  });

  describe("createBookingFrontmatter", () => {
    test("creates frontmatter with booking data", () => {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      date.setHours(0, 0, 0, 0);
      const slots = generateSlots(date, { start: "09:00", end: "10:00" }, 30, []);
      expect(slots.length).toBeGreaterThan(0);
      const fm = createBookingFrontmatter(
        {
          kanzlei_slug: "k1",
          slot_id: slots[0]!.id,
          client_name: "Max",
          client_email: "max@test.de",
          matter: "Beratung",
        },
        slots[0]!
      );
      expect(fm.type).toBe("booking");
      expect(fm.client_name).toBe("Max");
      expect(fm.status).toBe("confirmed");
    });
  });
});
