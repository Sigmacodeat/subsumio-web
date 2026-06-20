import { describe, it, expect } from "vitest";
import {
  NotificationBellManager,
  DEFAULT_BELL_CONFIG,
  SSEConnectionManager,
  buildPushPayload,
  buildBellAriaLabel,
  getBellIconState,
  getBellBadgeColor,
  getBellBadgeText,
  handleBellKeyboard,
  type BellIconState,
} from "@/lib/notification-bell";
import {
  InMemoryNotificationStore,
  createNotificationRecord,
  type NotificationRecord,
} from "@/lib/notification-model";

function createTestNotification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    ...createNotificationRecord({
      user_id: "user-1",
      brain_id: "brain-1",
      org_id: "org-1",
      type: "deadline_alert",
      title: "Test",
      body: "Body",
    }),
    ...overrides,
  };
}

function createStoreWithNotifications(count: number, unread: number = count): InMemoryNotificationStore {
  const store = new InMemoryNotificationStore();
  for (let i = 0; i < count; i++) {
    const notif = createTestNotification({ id: `n${i}` });
    if (i >= unread) {
      notif.read_at = new Date().toISOString();
    }
    store.create(notif);
  }
  return store;
}

describe("Notification Bell — Manager State", () => {
  it("initializes with empty state", () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    const state = manager.getState();
    expect(state.unread_count).toBe(0);
    expect(state.notifications).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.dropdown_open).toBe(false);
  });

  it("refresh loads notifications and unread count", async () => {
    const store = createStoreWithNotifications(5, 3);
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    await manager.refresh();
    const state = manager.getState();
    expect(state.notifications).toHaveLength(5);
    expect(state.unread_count).toBe(3);
    expect(state.last_fetch_at).not.toBeNull();
  });

  it("refresh sets error on failure", async () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    // Simulate error by using a broken store
    const brokenStore = {
      ...store,
      list: async () => { throw new Error("DB connection failed"); },
      getUnreadCount: async () => 0,
    } as unknown as InMemoryNotificationStore;
    const brokenManager = new NotificationBellManager(brokenStore, "user-1", "brain-1");
    await brokenManager.refresh();
    expect(brokenManager.getState().error).not.toBeNull();
    expect(brokenManager.getState().loading).toBe(false);
  });
});

describe("Notification Bell — Manager Actions", () => {
  it("openDropdown sets dropdown_open true", () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    manager.openDropdown();
    expect(manager.getState().dropdown_open).toBe(true);
  });

  it("closeDropdown sets dropdown_open false", () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    manager.openDropdown();
    manager.closeDropdown();
    expect(manager.getState().dropdown_open).toBe(false);
  });

  it("toggleDropdown toggles state", () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    manager.toggleDropdown();
    expect(manager.getState().dropdown_open).toBe(true);
    manager.toggleDropdown();
    expect(manager.getState().dropdown_open).toBe(false);
  });

  it("markRead marks notification as read and refreshes", async () => {
    const store = createStoreWithNotifications(2, 2);
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    await manager.refresh();
    await manager.markRead("n0");
    expect(manager.getState().unread_count).toBe(1);
  });

  it("markAllRead marks all as read", async () => {
    const store = createStoreWithNotifications(3, 3);
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    await manager.refresh();
    await manager.markAllRead();
    expect(manager.getState().unread_count).toBe(0);
  });

  it("archive archives notification", async () => {
    const store = createStoreWithNotifications(2, 2);
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    await manager.refresh();
    await manager.archive("n0");
    expect(manager.getState().notifications.find((n) => n.id === "n0")?.archived).toBe(true);
  });

  it("auto_mark_seen_on_open marks all read when dropdown opens", async () => {
    const store = createStoreWithNotifications(3, 3);
    const manager = new NotificationBellManager(store, "user-1", "brain-1", {
      auto_mark_seen_on_open: true,
    });
    await manager.refresh();
    expect(manager.getState().unread_count).toBe(3);
    manager.openDropdown();
    // Wait for async markAllRead
    await new Promise((r) => setTimeout(r, 10));
    await manager.refresh();
    expect(manager.getState().unread_count).toBe(0);
  });
});

describe("Notification Bell — Start/Stop Polling", () => {
  it("start activates polling", () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1", {
      sse_enabled: false,
      polling_interval_ms: 1000,
    });
    manager.start();
    expect(manager.getState().polling_active).toBe(true);
    manager.stop();
  });

  it("stop deactivates polling", () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1", {
      sse_enabled: false,
    });
    manager.start();
    manager.stop();
    expect(manager.getState().polling_active).toBe(false);
  });

  it("start is idempotent", () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1", {
      sse_enabled: false,
    });
    manager.start();
    manager.start();
    expect(manager.getState().polling_active).toBe(true);
    manager.stop();
  });
});

describe("Notification Bell — Subscribe", () => {
  it("subscribe receives state updates", () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    let lastState: NotificationBellManager["getState"] extends () => infer S ? S : never | null = null;
    manager.subscribe((state) => { lastState = state; });
    manager.openDropdown();
    expect(lastState).not.toBeNull();
    expect(lastState!.dropdown_open).toBe(true);
  });

  it("unsubscribe stops receiving updates", () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    let callCount = 0;
    const unsub = manager.subscribe(() => { callCount++; });
    manager.openDropdown();
    const countAfterFirst = callCount;
    unsub();
    manager.closeDropdown();
    expect(callCount).toBe(countAfterFirst);
  });
});

describe("Notification Bell — Unread by Type/Priority", () => {
  it("getUnreadByType groups correctly", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1", type: "deadline_alert" }));
    await store.create(createTestNotification({ id: "n2", type: "conflict_alert" }));
    await store.create(createTestNotification({ id: "n3", type: "deadline_alert" }));
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    await manager.refresh();
    const byType = manager.getUnreadByType();
    expect(byType["deadline_alert"]).toBe(2);
    expect(byType["conflict_alert"]).toBe(1);
  });

  it("getUnreadByPriority groups correctly", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1", priority: "urgent" }));
    await store.create(createTestNotification({ id: "n2", priority: "high" }));
    await store.create(createTestNotification({ id: "n3", priority: "urgent" }));
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    await manager.refresh();
    const byPriority = manager.getUnreadByPriority();
    expect(byPriority["urgent"]).toBe(2);
    expect(byPriority["high"]).toBe(1);
  });

  it("hasUrgentUnread detects urgent notifications", async () => {
    const store = new InMemoryNotificationStore();
    await store.create(createTestNotification({ id: "n1", priority: "normal" }));
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    await manager.refresh();
    expect(manager.hasUrgentUnread()).toBe(false);

    await store.create(createTestNotification({ id: "n2", priority: "urgent" }));
    await manager.refresh();
    expect(manager.hasUrgentUnread()).toBe(true);
  });
});

describe("Notification Bell — Push", () => {
  it("enablePush sets push_subscribed true", async () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    await manager.enablePush({} as PushSubscription);
    expect(manager.getState().push_subscribed).toBe(true);
  });

  it("disablePush sets push_subscribed false", async () => {
    const store = new InMemoryNotificationStore();
    const manager = new NotificationBellManager(store, "user-1", "brain-1");
    await manager.enablePush({} as PushSubscription);
    await manager.disablePush();
    expect(manager.getState().push_subscribed).toBe(false);
  });

  it("buildPushPayload creates correct payload", () => {
    const notif = createTestNotification({ type: "approval_request", action_slug: "agent/123" });
    const payload = buildPushPayload(notif);
    expect(payload.title).toBe("Test");
    expect(payload.tag).toBe(notif.id);
    expect(payload.data?.["action_slug"]).toBe("agent/123");
    expect(payload.actions).toHaveLength(2);
    expect(payload.actions![0].action).toBe("approve");
  });

  it("buildPushPayload has no actions for non-approval notifications", () => {
    const notif = createTestNotification({ type: "deadline_alert" });
    const payload = buildPushPayload(notif);
    expect(payload.actions).toBeUndefined();
  });
});

describe("Notification Bell — Accessibility", () => {
  it("buildBellAriaLabel returns correct text for 0 unread", () => {
    expect(buildBellAriaLabel(0, false)).toContain("keine ungelesenen");
  });

  it("buildBellAriaLabel returns correct text for unread", () => {
    expect(buildBellAriaLabel(5, false)).toContain("5 ungelesen");
  });

  it("buildBellAriaLabel mentions urgent", () => {
    expect(buildBellAriaLabel(3, true)).toContain("dringende");
  });

  it("getBellIconState returns none for 0 unread", () => {
    expect(getBellIconState(0, false)).toBe("none");
  });

  it("getBellIconState returns urgent for urgent unread", () => {
    expect(getBellIconState(3, true)).toBe("urgent");
  });

  it("getBellIconState returns unread for non-urgent unread", () => {
    expect(getBellIconState(3, false)).toBe("unread");
  });

  it("getBellBadgeColor returns correct colors", () => {
    expect(getBellBadgeColor("urgent")).toContain("red");
    expect(getBellBadgeColor("unread")).toContain("blue");
    expect(getBellBadgeColor("none")).toBe("");
  });

  it("getBellBadgeText returns correct text", () => {
    expect(getBellBadgeText(0)).toBe("");
    expect(getBellBadgeText(5)).toBe("5");
    expect(getBellBadgeText(100)).toBe("99+");
  });
});

describe("Notification Bell — Keyboard Navigation", () => {
  it("Enter opens bell when closed", () => {
    const result = handleBellKeyboard(
      { key: "Enter" } as KeyboardEvent,
      false, 0, 0,
    );
    expect(result?.action).toBe("open");
  });

  it("Escape closes bell when open", () => {
    const result = handleBellKeyboard(
      { key: "Escape" } as KeyboardEvent,
      true, 5, 2,
    );
    expect(result?.action).toBe("close");
    expect(result?.newSelectedIndex).toBe(-1);
  });

  it("ArrowDown moves to next notification", () => {
    const result = handleBellKeyboard(
      { key: "ArrowDown" } as KeyboardEvent,
      true, 5, 2,
    );
    expect(result?.action).toBe("next");
    expect(result?.newSelectedIndex).toBe(3);
  });

  it("ArrowDown does not exceed bounds", () => {
    const result = handleBellKeyboard(
      { key: "ArrowDown" } as KeyboardEvent,
      true, 5, 4,
    );
    expect(result?.newSelectedIndex).toBe(4);
  });

  it("ArrowUp moves to previous notification", () => {
    const result = handleBellKeyboard(
      { key: "ArrowUp" } as KeyboardEvent,
      true, 5, 3,
    );
    expect(result?.action).toBe("previous");
    expect(result?.newSelectedIndex).toBe(2);
  });

  it("ArrowUp does not go below 0", () => {
    const result = handleBellKeyboard(
      { key: "ArrowUp" } as KeyboardEvent,
      true, 5, 0,
    );
    expect(result?.newSelectedIndex).toBe(0);
  });

  it("r marks current as read", () => {
    const result = handleBellKeyboard(
      { key: "r" } as KeyboardEvent,
      true, 5, 2,
    );
    expect(result?.action).toBe("mark_read");
  });

  it("R marks all as read", () => {
    const result = handleBellKeyboard(
      { key: "R" } as KeyboardEvent,
      true, 5, 2,
    );
    expect(result?.action).toBe("mark_all_read");
  });

  it("a archives current", () => {
    const result = handleBellKeyboard(
      { key: "a" } as KeyboardEvent,
      true, 5, 2,
    );
    expect(result?.action).toBe("archive");
  });

  it("unknown key returns null", () => {
    const result = handleBellKeyboard(
      { key: "x" } as KeyboardEvent,
      true, 5, 2,
    );
    expect(result).toBeNull();
  });
});
