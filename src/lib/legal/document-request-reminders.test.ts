// @vitest-environment node

import { describe, test, expect } from "vitest";

const REMINDER_INTERVAL_DAYS = 7;
const MAX_REMINDERS = 3;

interface ReminderCheckInput {
  status: string;
  sent_at: string | undefined;
  reminder_sent_at: string | undefined;
  reminder_count: number;
  items: Array<{ received_document_slug?: string }>;
  now: Date;
}

interface ReminderCheckResult {
  shouldRemind: boolean;
  reason: string;
}

function shouldSendReminder(input: ReminderCheckInput): ReminderCheckResult {
  if (input.status !== "sent" && input.status !== "partially_fulfilled") {
    return { shouldRemind: false, reason: "not_pending" };
  }

  if (!input.sent_at) {
    return { shouldRemind: false, reason: "no_sent_at" };
  }

  const sentAt = new Date(input.sent_at);
  const daysSinceSent = Math.floor(
    (input.now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (input.reminder_count >= MAX_REMINDERS) {
    return { shouldRemind: false, reason: "max_reminders_reached" };
  }

  if (input.reminder_sent_at) {
    const lastReminder = new Date(input.reminder_sent_at);
    const daysSinceReminder = Math.floor(
      (input.now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceReminder < REMINDER_INTERVAL_DAYS) {
      return { shouldRemind: false, reason: "too_soon_after_last_reminder" };
    }
  } else if (daysSinceSent < REMINDER_INTERVAL_DAYS) {
    return { shouldRemind: false, reason: "too_soon_after_sent" };
  }

  const openItems = input.items.filter((item) => !item.received_document_slug);
  if (openItems.length === 0) {
    return { shouldRemind: false, reason: "no_open_items" };
  }

  return { shouldRemind: true, reason: "ok" };
}

describe("document-request-reminder logic", () => {
  const now = new Date("2026-02-15T12:00:00Z");

  test("sends reminder after 7 days with no prior reminder", () => {
    const result = shouldSendReminder({
      status: "sent",
      sent_at: "2026-02-01T12:00:00Z",
      reminder_sent_at: undefined,
      reminder_count: 0,
      items: [{}, {}],
      now,
    });
    expect(result.shouldRemind).toBe(true);
    expect(result.reason).toBe("ok");
  });

  test("skips if sent less than 7 days ago and no prior reminder", () => {
    const result = shouldSendReminder({
      status: "sent",
      sent_at: "2026-02-12T12:00:00Z",
      reminder_sent_at: undefined,
      reminder_count: 0,
      items: [{}],
      now,
    });
    expect(result.shouldRemind).toBe(false);
    expect(result.reason).toBe("too_soon_after_sent");
  });

  test("sends reminder if last reminder was more than 7 days ago", () => {
    const result = shouldSendReminder({
      status: "sent",
      sent_at: "2026-01-01T12:00:00Z",
      reminder_sent_at: "2026-02-01T12:00:00Z",
      reminder_count: 1,
      items: [{}],
      now,
    });
    expect(result.shouldRemind).toBe(true);
    expect(result.reason).toBe("ok");
  });

  test("skips if last reminder was less than 7 days ago", () => {
    const result = shouldSendReminder({
      status: "sent",
      sent_at: "2026-01-01T12:00:00Z",
      reminder_sent_at: "2026-02-10T12:00:00Z",
      reminder_count: 1,
      items: [{}],
      now,
    });
    expect(result.shouldRemind).toBe(false);
    expect(result.reason).toBe("too_soon_after_last_reminder");
  });

  test("skips if max reminders reached", () => {
    const result = shouldSendReminder({
      status: "sent",
      sent_at: "2026-01-01T12:00:00Z",
      reminder_sent_at: "2026-02-01T12:00:00Z",
      reminder_count: 3,
      items: [{}],
      now,
    });
    expect(result.shouldRemind).toBe(false);
    expect(result.reason).toBe("max_reminders_reached");
  });

  test("skips if status is fulfilled", () => {
    const result = shouldSendReminder({
      status: "fulfilled",
      sent_at: "2026-01-01T12:00:00Z",
      reminder_sent_at: undefined,
      reminder_count: 0,
      items: [{}],
      now,
    });
    expect(result.shouldRemind).toBe(false);
    expect(result.reason).toBe("not_pending");
  });

  test("skips if status is expired", () => {
    const result = shouldSendReminder({
      status: "expired",
      sent_at: "2026-01-01T12:00:00Z",
      reminder_sent_at: undefined,
      reminder_count: 0,
      items: [{}],
      now,
    });
    expect(result.shouldRemind).toBe(false);
    expect(result.reason).toBe("not_pending");
  });

  test("skips if status is draft", () => {
    const result = shouldSendReminder({
      status: "draft",
      sent_at: "2026-01-01T12:00:00Z",
      reminder_sent_at: undefined,
      reminder_count: 0,
      items: [{}],
      now,
    });
    expect(result.shouldRemind).toBe(false);
    expect(result.reason).toBe("not_pending");
  });

  test("skips if all items are fulfilled", () => {
    const result = shouldSendReminder({
      status: "sent",
      sent_at: "2026-01-01T12:00:00Z",
      reminder_sent_at: undefined,
      reminder_count: 0,
      items: [{ received_document_slug: "doc-1" }, { received_document_slug: "doc-2" }],
      now,
    });
    expect(result.shouldRemind).toBe(false);
    expect(result.reason).toBe("no_open_items");
  });

  test("sends reminder for partially_fulfilled status with open items", () => {
    const result = shouldSendReminder({
      status: "partially_fulfilled",
      sent_at: "2026-01-01T12:00:00Z",
      reminder_sent_at: undefined,
      reminder_count: 0,
      items: [{ received_document_slug: "doc-1" }, {}],
      now,
    });
    expect(result.shouldRemind).toBe(true);
    expect(result.reason).toBe("ok");
  });

  test("skips if no sent_at", () => {
    const result = shouldSendReminder({
      status: "sent",
      sent_at: undefined,
      reminder_sent_at: undefined,
      reminder_count: 0,
      items: [{}],
      now,
    });
    expect(result.shouldRemind).toBe(false);
    expect(result.reason).toBe("no_sent_at");
  });

  test("sends second reminder after 7 days from first", () => {
    const result = shouldSendReminder({
      status: "sent",
      sent_at: "2026-01-01T12:00:00Z",
      reminder_sent_at: "2026-02-08T12:00:00Z",
      reminder_count: 1,
      items: [{}],
      now,
    });
    expect(result.shouldRemind).toBe(true);
    expect(result.reason).toBe("ok");
  });
});
