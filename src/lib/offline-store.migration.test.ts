// @vitest-environment node

/**
 * DB-Upgrade-Test: simuliert eine bestehende v1-Installation (nur
 * "pages"-Store) und prueft, dass openDb() mit DB_VERSION=4 alle
 * spaeteren Stores per onupgradeneeded nachzieht — ohne diesen Test
 * braechte ein vergessener Store im Upgrade-Pfad produktive Alt-
 * Installationen still.
 */

import { indexedDB } from "fake-indexeddb";
import { test, expect, beforeAll } from "vitest";

// Offline data is bound to a signed-in person+firm (the "owner"); these
// tests run as one known owner stored on the device.
const storage = new Map<string, string>([["subsumio-offline-owner", "u1:scope"]]);
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  },
  configurable: true,
});

beforeAll(async () => {
  Object.defineProperty(globalThis, "indexedDB", {
    value: indexedDB,
    configurable: true,
  });
  // v1-Stand anlegen: nur der "pages"-Store existiert
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("subsumio-offline", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("pages", { keyPath: "key" });
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
});

import { getPendingMutations, getPendingFileUploads, loadChatHistory } from "./offline-store";

test("v1→v4 upgrade legt mutations/chat_history/file_uploads an", async () => {
  // openDb() laeuft lazy — der erste Zugriff triggert den Upgrade.
  await getPendingMutations();

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("subsumio-offline");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  expect([...db.objectStoreNames].sort()).toEqual(
    ["chat_history", "file_uploads", "mutations", "pages"].sort()
  );
  db.close();
});

test("alle Stores sind nach dem Upgrade benutzbar", async () => {
  expect(await getPendingMutations()).toEqual([]);
  expect(await getPendingFileUploads()).toEqual([]);
  expect(await loadChatHistory()).toEqual([]);
});
