// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// offline-store uses IndexedDB which is not available in Node.
// We test the error handling paths directly.

import {
  setOfflineErrorReporter,
  isOnline,
  OFFLINE_KEYS,
  setCache,
  getCache,
  clearCache,
  enqueueMutation,
  getPendingMutations,
  removeMutation,
  clearMutations,
  saveChatMessage,
  loadChatHistory,
  clearChatHistory,
  type ChatHistoryEntry,
} from "./offline-store";

describe("setOfflineErrorReporter", () => {
  test("sets a reporter function without error", () => {
    const reporter = vi.fn();
    expect(() => setOfflineErrorReporter(reporter)).not.toThrow();
  });

  test("can set null to clear reporter", () => {
    setOfflineErrorReporter(null);
    expect(() => setOfflineErrorReporter(null)).not.toThrow();
  });
});

describe("isOnline", () => {
  test("returns false in Node environment (no navigator)", () => {
    // In Node, navigator is undefined
    expect(isOnline()).toBe(false);
  });
});

describe("OFFLINE_KEYS", () => {
  test("has all expected cache keys", () => {
    expect(OFFLINE_KEYS.cases).toBe("dashboard:cases");
    expect(OFFLINE_KEYS.deadlines).toBe("dashboard:deadlines");
    expect(OFFLINE_KEYS.contacts).toBe("dashboard:contacts");
    expect(OFFLINE_KEYS.invoices).toBe("dashboard:invoices");
    expect(OFFLINE_KEYS.vault).toBe("dashboard:vault");
    expect(OFFLINE_KEYS.contracts).toBe("dashboard:contracts");
    expect(OFFLINE_KEYS.research).toBe("dashboard:research");
    expect(OFFLINE_KEYS.notifications).toBe("dashboard:notifications");
    expect(OFFLINE_KEYS.settings).toBe("dashboard:settings");
    expect(OFFLINE_KEYS.chatHistory).toBe("dashboard:chat-history");
  });

  test("all values are strings starting with dashboard:", () => {
    for (const key of Object.values(OFFLINE_KEYS)) {
      expect(typeof key).toBe("string");
      expect(key.startsWith("dashboard:")).toBe(true);
    }
  });
});

describe("IndexedDB operations (no IDB in Node — error paths)", () => {
  beforeEach(() => {
    setOfflineErrorReporter(null);
  });

  test("setCache does not throw without IDB", async () => {
    await expect(setCache("key", { data: 1 })).resolves.toBeUndefined();
  });

  test("getCache returns null without IDB", async () => {
    const result = await getCache("nonexistent");
    expect(result).toBeNull();
  });

  test("clearCache does not throw without IDB", async () => {
    await expect(clearCache()).resolves.toBeUndefined();
  });

  test("enqueueMutation does not throw without IDB", async () => {
    await expect(
      enqueueMutation({ type: "createPage", payload: { slug: "test" } }),
    ).resolves.toBeUndefined();
  });

  test("getPendingMutations returns empty array without IDB", async () => {
    const result = await getPendingMutations();
    expect(result).toEqual([]);
  });

  test("removeMutation does not throw without IDB", async () => {
    await expect(removeMutation("nonexistent")).resolves.toBeUndefined();
  });

  test("clearMutations does not throw without IDB", async () => {
    await expect(clearMutations()).resolves.toBeUndefined();
  });

  test("saveChatMessage does not throw without IDB", async () => {
    const msg: ChatHistoryEntry = {
      id: "msg-1",
      role: "user",
      content: "Hello",
      timestamp: new Date().toISOString(),
    };
    await expect(saveChatMessage(msg)).resolves.toBeUndefined();
  });

  test("loadChatHistory returns empty array without IDB", async () => {
    const result = await loadChatHistory();
    expect(result).toEqual([]);
  });

  test("clearChatHistory does not throw without IDB", async () => {
    await expect(clearChatHistory()).resolves.toBeUndefined();
  });
});

describe("error reporter integration", () => {
  test("setCache calls error reporter on failure", async () => {
    const reporter = vi.fn();
    setOfflineErrorReporter(reporter);
    await setCache("key", { data: 1 });
    // In Node without IDB, the error reporter should be called
    // (indexedDB is undefined, so openDb throws)
    expect(reporter).toHaveBeenCalled();
    setOfflineErrorReporter(null);
  });

  test("getCache calls error reporter on failure", async () => {
    const reporter = vi.fn();
    setOfflineErrorReporter(reporter);
    await getCache("key");
    expect(reporter).toHaveBeenCalled();
    setOfflineErrorReporter(null);
  });

  test("error reporter receives Error object and context string", async () => {
    const reporter = vi.fn();
    setOfflineErrorReporter(reporter);
    await setCache("key", "data");
    expect(reporter).toHaveBeenCalledOnce();
    const [error, context] = reporter.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(typeof context).toBe("string");
    setOfflineErrorReporter(null);
  });
});
