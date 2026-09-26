// @vitest-environment node

/**
 * Offline data (caches, chat history, queued changes, queued uploads) is
 * bound to one person in one firm. A different owner never sees or replays
 * the previous owner's entries, and switching owner or logging out deletes
 * the database.
 */

import { indexedDB } from "fake-indexeddb";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

const storage = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(globalThis, "indexedDB", { value: indexedDB, configurable: true });
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
    configurable: true,
  });
});

import {
  clearOfflineData,
  currentOfflineOwner,
  enqueueFileUpload,
  enqueueMutation,
  getCache,
  getPendingFileUploads,
  getPendingMutations,
  loadChatHistory,
  offlineOwnerDiffersFromUser,
  saveChatMessage,
  setCache,
  setOfflineOwner,
} from "./offline-store";

beforeEach(async () => {
  await clearOfflineData();
});

async function fillAsOwnerA() {
  await setOfflineOwner("userA:firm1");
  await setCache("dashboard:cases", [{ slug: "akte-a" }]);
  await saveChatMessage({ id: "m1", role: "user", content: "A fragt", timestamp: "2026-09-26" });
  await enqueueMutation({ type: "deletePage", payload: { slug: "akte-a" } });
  await enqueueFileUpload({
    fileName: "a.pdf",
    fileSize: 1,
    fileType: "application/pdf",
    bytes: new ArrayBuffer(1),
    metadata: {},
  });
  expect(await getPendingMutations()).toHaveLength(1);
}

describe("offline data is bound to person and firm", () => {
  test("another person on the device sees and replays nothing of the previous one", async () => {
    await fillAsOwnerA();
    await setOfflineOwner("userB:firm1");
    expect(await getPendingMutations()).toEqual([]);
    expect(await getPendingFileUploads()).toEqual([]);
    expect(await getCache("dashboard:cases")).toBeNull();
    expect(await loadChatHistory()).toEqual([]);
  });

  test("the same person in another firm starts empty, and the old data is deleted", async () => {
    await fillAsOwnerA();
    await setOfflineOwner("userA:firm2");
    expect(await getPendingMutations()).toEqual([]);
    // Back to the first firm: the database was deleted, nothing returns.
    await setOfflineOwner("userA:firm1");
    expect(await getPendingMutations()).toEqual([]);
    expect(await getCache("dashboard:cases")).toBeNull();
  });

  test("logout deletes everything and nothing is queued without an owner", async () => {
    await fillAsOwnerA();
    await clearOfflineData();
    expect(currentOfflineOwner()).toBeNull();
    await enqueueMutation({ type: "deletePage", payload: { slug: "x" } });
    expect(await getPendingMutations()).toEqual([]);
    await setOfflineOwner("userA:firm1");
    expect(await getPendingMutations()).toEqual([]);
    expect(await loadChatHistory()).toEqual([]);
  });

  test("entries queued by a foreign owner are never returned for replay", async () => {
    await setOfflineOwner("userB:firm1");
    // Simulate a leftover entry of someone else in the same database.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("subsumio-offline", 4);
      req.onupgradeneeded = () => {
        for (const [name, keyPath] of [
          ["pages", "key"],
          ["mutations", "id"],
          ["chat_history", "id"],
          ["file_uploads", "id"],
        ] as const) {
          if (!req.result.objectStoreNames.contains(name)) {
            req.result.createObjectStore(name, { keyPath });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("mutations", "readwrite");
      tx.objectStore("mutations").put({
        id: "foreign",
        owner: "userA:firm1",
        type: "deletePage",
        payload: { slug: "akte-b" },
        createdAt: "2026-09-26T00:00:00Z",
      });
      tx.oncomplete = () => resolve();
    });
    db.close();
    expect(await getPendingMutations()).toEqual([]);
  });

  test("login check spots data of another person", async () => {
    await setOfflineOwner("userA:firm1");
    expect(offlineOwnerDiffersFromUser("userA")).toBe(false);
    expect(offlineOwnerDiffersFromUser("userB")).toBe(true);
  });
});
