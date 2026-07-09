// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/lib/realtime", () => ({
  useRealtime: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

import { requestNotificationPermission, isNotificationSupported } from "./review-inbox-realtime";

describe("review-inbox-realtime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("isNotificationSupported returns false when Notification API not available", () => {
    const result = isNotificationSupported();
    expect(result).toBe(false);
  });

  test("isNotificationSupported returns true when permission granted", () => {
    const originalNotification = (globalThis as unknown as { Notification?: unknown }).Notification;
    Object.defineProperty(globalThis, "Notification", {
      value: class MockNotification {
        static permission = "granted";
        constructor() {}
        close() {}
        onclick: (() => void) | null = null;
      },
      configurable: true,
    });
    expect(isNotificationSupported()).toBe(true);
    if (originalNotification) {
      Object.defineProperty(globalThis, "Notification", {
        value: originalNotification,
        configurable: true,
      });
    }
  });

  test("requestNotificationPermission returns false when not supported", async () => {
    // Ensure Notification is not defined for this test
    const original = (globalThis as { Notification?: unknown }).Notification;
    delete (globalThis as { Notification?: unknown }).Notification;
    const result = await requestNotificationPermission();
    expect(result).toBe(false);
    if (original) {
      (globalThis as { Notification?: unknown }).Notification = original;
    }
  });

  test("requestNotificationPermission returns true when already granted", async () => {
    Object.defineProperty(globalThis, "Notification", {
      value: class MockNotification {
        static permission = "granted";
        static requestPermission() {
          return Promise.resolve("granted");
        }
        constructor() {}
        close() {}
        onclick: (() => void) | null = null;
      },
      configurable: true,
    });
    const result = await requestNotificationPermission();
    expect(result).toBe(true);
    delete (globalThis as { Notification?: unknown }).Notification;
  });
});
