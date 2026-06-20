import { describe, it, expect } from "vitest";
import {
  InMemoryNotificationStore,
  createNotificationRecord,
  validateNotificationRecord,
  sortByPriorityAndDate,
  filterByType,
  filterUnread,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_PRIORITY_LABELS,
  NOTIFICATION_PRIORITY_ORDER,
  NOTIFICATION_DDL,
  type NotificationType,
  type NotificationRecord,
} from "@/lib/notification-model";

function createTestNotification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    ...createNotificationRecord({
      user_id: "user-1",
      brain_id: "brain-1",
      org_id: "org-1",
      type: "deadline_alert",
      title: "Test Notification",
      body: "Test body",
    }),
    ...overrides,
  };
}

describe("Notification Model — Types & Labels", () => {
  it("has labels for all notification types", () => {
    const types: NotificationType[] = [
      "mention", "deadline_alert", "deadline_overdue", "approval_request",
      "approval_decision", "conflict_alert", "new_document", "case_update",
      "client_message", "system", "whatsapp_inbound", "fristen_briefing",
    ];
    for (const type of types) {
      expect(NOTIFICATION_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("has labels for all priorities", () => {
    expect(NOTIFICATION_PRIORITY_LABELS.urgent).toBe("Dringend");
    expect(NOTIFICATION_PRIORITY_LABELS.high).toBe("Hoch");
    expect(NOTIFICATION_PRIORITY_LABELS.normal).toBe("Normal");
    expect(NOTIFICATION_PRIORITY_LABELS.low).toBe("Niedrig");
  });

  it("has correct priority ordering", () => {
    expect(NOTIFICATION_PRIORITY_ORDER.urgent).toBeLessThan(NOTIFICATION_PRIORITY_ORDER.high);
    expect(NOTIFICATION_PRIORITY_ORDER.high).toBeLessThan(NOTIFICATION_PRIORITY_ORDER.normal);
    expect(NOTIFICATION_PRIORITY_ORDER.normal).toBeLessThan(NOTIFICATION_PRIORITY_ORDER.low);
  });
});

describe("Notification Model — Factory", () => {
  it("createNotificationRecord sets all required fields", () => {
    const record = createTestNotification();
    expect(record.id).toBeTruthy();
    expect(record.user_id).toBe("user-1");
    expect(record.brain_id).toBe("brain-1");
    expect(record.org_id).toBe("org-1");
    expect(record.type).toBe("deadline_alert");
    expect(record.priority).toBe("normal");
    expect(record.read_at).toBeNull();
    expect(record.archived).toBe(false);
    expect(record.channels).toEqual(["in_app"]);
    expect(record.created_at).toBeTruthy();
  });

  it("createNotificationRecord accepts overrides", () => {
    const record = createNotificationRecord({
      user_id: "user-2",
      brain_id: "brain-2",
      org_id: "org-2",
      type: "conflict_alert",
      priority: "urgent",
      title: "Konflikt",
      body: "Body",
      channels: ["in_app", "whatsapp"],
      case_slug: "legal/cases/123",
    });
    expect(record.user_id).toBe("user-2");
    expect(record.type).toBe("conflict_alert");
    expect(record.priority).toBe("urgent");
    expect(record.channels).toEqual(["in_app", "whatsapp"]);
    expect(record.case_slug).toBe("legal/cases/123");
  });
});

describe("Notification Model — InMemoryStore", () => {
  it("creates and retrieves notification", async () => {
    const store = new InMemoryNotificationStore();
    const record = createTestNotification();
    await store.create(record);
    const retrieved = await store.getById(record.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(record.id);
  });

  it("returns null for non-existent id", async () => {
    const store = new InMemoryNotificationStore();
    expect(await store.getById("nonexistent")).toBeNull();
  });

  it("lists notifications for user+brain", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1", title: "First" }));
    await store.create(createTestNotification({ id: "n2", title: "Second" }));
    await store.create(createTestNotification({ id: "n3", user_id: "other", brain_id: "other" }));

    const list = await store.list({ user_id: "user-1", brain_id: "brain-1" });
    expect(list).toHaveLength(2);
  });

  it("lists only unread notifications", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1" }));
    await store.create(createTestNotification({ id: "n2" }));
    await store.markRead("n1");

    const unread = await store.list({ user_id: "user-1", brain_id: "brain-1", unread_only: true });
    expect(unread).toHaveLength(1);
    expect(unread[0].id).toBe("n2");
  });

  it("filters by type", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1", type: "deadline_alert" }));
    await store.create(createTestNotification({ id: "n2", type: "conflict_alert" }));

    const filtered = await store.list({ user_id: "user-1", brain_id: "brain-1", type: "conflict_alert" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe("conflict_alert");
  });

  it("filters by priority", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1", priority: "urgent" }));
    await store.create(createTestNotification({ id: "n2", priority: "normal" }));

    const filtered = await store.list({ user_id: "user-1", brain_id: "brain-1", priority: "urgent" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].priority).toBe("urgent");
  });

  it("marks single notification as read", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1" }));
    const result = await store.markRead("n1");
    expect(result).toBe(true);
    const record = await store.getById("n1");
    expect(record!.read_at).not.toBeNull();
  });

  it("markRead returns false for non-existent", async () => {
    const store = new InMemoryNotificationStore();
    expect(await store.markRead("nonexistent")).toBe(false);
  });

  it("marks all notifications as read", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1" }));
    await store.create(createTestNotification({ id: "n2" }));
    const count = await store.markAllRead("user-1", "brain-1");
    expect(count).toBe(2);
  });

  it("archives notification", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1" }));
    expect(await store.archive("n1")).toBe(true);
    const record = await store.getById("n1");
    expect(record!.archived).toBe(true);
  });

  it("deletes notification", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1" }));
    expect(await store.delete("n1")).toBe(true);
    expect(await store.getById("n1")).toBeNull();
  });

  it("counts unread notifications", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1" }));
    await store.create(createTestNotification({ id: "n2" }));
    await store.create(createTestNotification({ id: "n3" }));
    await store.markRead("n1");
    const count = await store.getUnreadCount("user-1", "brain-1");
    expect(count).toBe(2);
  });

  it("returns stats", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1", type: "deadline_alert", priority: "high" }));
    await store.create(createTestNotification({ id: "n2", type: "conflict_alert", priority: "urgent" }));
    await store.markRead("n1");

    const stats = await store.getStats("user-1", "brain-1");
    expect(stats.total).toBe(2);
    expect(stats.unread).toBe(1);
    expect(stats.read).toBe(1);
    expect(stats.by_type["deadline_alert"]).toBe(1);
    expect(stats.by_type["conflict_alert"]).toBe(1);
    expect(stats.by_priority["high"]).toBe(1);
    expect(stats.by_priority["urgent"]).toBe(1);
    expect(stats.oldest_unread).not.toBeNull();
    expect(stats.newest).not.toBeNull();
  });

  it("respects limit and offset", async () => {
    const store = new InMemoryNotificationStore();
    for (let i = 0; i < 10; i++) {
      await store.create(createTestNotification({ id: `n${i}`, created_at: new Date(Date.now() + i).toISOString() }));
    }
    const page1 = await store.list({ user_id: "user-1", brain_id: "brain-1", limit: 3, offset: 0 });
    const page2 = await store.list({ user_id: "user-1", brain_id: "brain-1", limit: 3, offset: 3 });
    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(3);
    expect(page1[0].id).not.toBe(page2[0].id);
  });
});

describe("Notification Model — Validation", () => {
  it("validates a correct record", () => {
    const record = createTestNotification();
    const result = validateNotificationRecord(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing user_id", () => {
    const record = createTestNotification({ user_id: "" });
    const result = validateNotificationRecord(record);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("user_id"))).toBe(true);
  });

  it("detects missing action_slug for approval_request", () => {
    const record = createTestNotification({ type: "approval_request" });
    const result = validateNotificationRecord(record);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("action_slug"))).toBe(true);
  });

  it("warns about urgent priority for non-critical types", () => {
    const record = createTestNotification({ type: "new_document", priority: "urgent" });
    const result = validateNotificationRecord(record);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns about deadline alert without deadlineDate", () => {
    const record = createTestNotification({ type: "deadline_alert" });
    const result = validateNotificationRecord(record);
    expect(result.warnings.some((w) => w.includes("deadlineDate"))).toBe(true);
  });

  it("warns about no channels", () => {
    const record = createTestNotification({ channels: [] });
    const result = validateNotificationRecord(record);
    expect(result.warnings.some((w) => w.includes("channels"))).toBe(true);
  });
});

describe("Notification Model — Helpers", () => {
  it("sortByPriorityAndDate sorts urgent first", () => {
    const notifications = [
      createTestNotification({ id: "n1", priority: "normal", created_at: "2026-06-01T10:00:00Z" }),
      createTestNotification({ id: "n2", priority: "urgent", created_at: "2026-06-01T12:00:00Z" }),
      createTestNotification({ id: "n3", priority: "high", created_at: "2026-06-01T11:00:00Z" }),
    ];
    const sorted = sortByPriorityAndDate(notifications);
    expect(sorted[0].id).toBe("n2");
    expect(sorted[1].id).toBe("n3");
    expect(sorted[2].id).toBe("n1");
  });

  it("filterByType filters correctly", () => {
    const notifications = [
      createTestNotification({ id: "n1", type: "deadline_alert" }),
      createTestNotification({ id: "n2", type: "conflict_alert" }),
      createTestNotification({ id: "n3", type: "deadline_alert" }),
    ];
    const filtered = filterByType(notifications, ["deadline_alert"]);
    expect(filtered).toHaveLength(2);
  });

  it("filterUnread returns only unread", () => {
    const notifications = [
      createTestNotification({ id: "n1", read_at: null }),
      createTestNotification({ id: "n2", read_at: "2026-06-01T10:00:00Z" }),
      createTestNotification({ id: "n3", read_at: null }),
    ];
    const unread = filterUnread(notifications);
    expect(unread).toHaveLength(2);
  });
});

describe("Notification Model — DDL", () => {
  it("DDL contains table definition", () => {
    expect(NOTIFICATION_DDL).toContain("subsumio_notifications_v2");
    expect(NOTIFICATION_DDL).toContain("CREATE TABLE");
    expect(NOTIFICATION_DDL).toContain("CREATE INDEX");
  });

  it("DDL has indexes for user_brain, type, priority, case", () => {
    expect(NOTIFICATION_DDL).toContain("idx_notif_v2_user_brain");
    expect(NOTIFICATION_DDL).toContain("idx_notif_v2_type");
    expect(NOTIFICATION_DDL).toContain("idx_notif_v2_priority");
    expect(NOTIFICATION_DDL).toContain("idx_notif_v2_case");
  });
});
