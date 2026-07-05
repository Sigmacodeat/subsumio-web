import { describe, test, expect } from "vitest";
import {
  createOutboundEntry,
  updateDeliveryStatus,
  filterOutboundByDateRange,
  exportOutboundRegister,
  CHANNEL_LABELS,
  DELIVERY_STATUS_LABELS,
} from "./outbound-register";

describe("outbound-register", () => {
  describe("createOutboundEntry", () => {
    test("creates entry with correct fields", () => {
      const entry = createOutboundEntry({
        channel: "email",
        recipient_name: "Gericht AG Berlin",
        recipient_address: "post@gericht.de",
        subject: "Klageerwiderung",
        sent_by: "RA Müller",
      });
      expect(entry.id).toMatch(/^out-/);
      expect(entry.channel).toBe("email");
      expect(entry.recipient_name).toBe("Gericht AG Berlin");
      expect(entry.delivery_status).toBe("sent");
      expect(entry.date).toBeTruthy();
    });
  });

  describe("updateDeliveryStatus", () => {
    test("updates status correctly", () => {
      const entry = createOutboundEntry({
        channel: "post",
        recipient_name: "Test",
        recipient_address: "Berlin",
        subject: "Test",
        sent_by: "RA Test",
      });
      const updated = updateDeliveryStatus(entry, "delivered");
      expect(updated.delivery_status).toBe("delivered");
    });
  });

  describe("filterOutboundByDateRange", () => {
    test("filters by date range", () => {
      const entries = [
        createOutboundEntry({
          channel: "email",
          recipient_name: "A",
          recipient_address: "a@b.de",
          subject: "X",
          sent_by: "Y",
        }),
        createOutboundEntry({
          channel: "email",
          recipient_name: "B",
          recipient_address: "b@c.de",
          subject: "X",
          sent_by: "Y",
        }),
      ];
      const from = new Date(Date.now() - 86400000).toISOString();
      const to = new Date(Date.now() + 86400000).toISOString();
      const filtered = filterOutboundByDateRange(entries, from, to);
      expect(filtered).toHaveLength(2);
    });

    test("returns empty for future range", () => {
      const entries = [
        createOutboundEntry({
          channel: "email",
          recipient_name: "A",
          recipient_address: "a@b.de",
          subject: "X",
          sent_by: "Y",
        }),
      ];
      const from = new Date(Date.now() + 365 * 86400000).toISOString();
      const to = new Date(Date.now() + 366 * 86400000).toISOString();
      const filtered = filterOutboundByDateRange(entries, from, to);
      expect(filtered).toHaveLength(0);
    });
  });

  describe("exportOutboundRegister", () => {
    test("generates CSV with headers", () => {
      const entries = [
        createOutboundEntry({
          channel: "email",
          recipient_name: "A",
          recipient_address: "a@b.de",
          subject: "X",
          sent_by: "Y",
        }),
      ];
      const csv = exportOutboundRegister(entries);
      expect(csv).toContain("Datum");
      expect(csv).toContain("Kanal");
      expect(csv).toContain("Empfänger");
      expect(csv).toContain("A");
    });
  });

  test("labels are defined", () => {
    expect(Object.keys(CHANNEL_LABELS).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(DELIVERY_STATUS_LABELS).length).toBeGreaterThanOrEqual(3);
  });
});
