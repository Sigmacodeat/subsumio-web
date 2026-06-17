/**
 * Offline-Store für SigmaBrain Dashboard.
 * Cacht Brain-Daten (Akten, Fristen, Kontakte, Rechnungen) in IndexedDB.
 * Bei fehlender Internet-Verbindung → Fallback auf gecachte Daten.
 */

const DB_NAME = "sigmabrain-offline";
const DB_VERSION = 2;
const STORE_NAME = "pages";
const MUTATION_STORE = "mutations";

interface CacheEntry<T> {
  key: string;
  data: T;
  fetchedAt: string;
}

export interface QueuedMutation {
  id: string;
  type: "createPage" | "updatePage" | "deletePage";
  payload: Record<string, unknown>;
  createdAt: string;
}

type OfflineErrorReporter = (error: Error, context: string) => void;

let errorReporter: OfflineErrorReporter | null = null;

/** Set a global reporter so UI can react to IndexedDB / offline failures. */
export function setOfflineErrorReporter(reporter: OfflineErrorReporter | null): void {
  errorReporter = reporter;
}

function report(err: unknown, context: string): void {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error(`[offline] ${context}:`, error.message);
  if (errorReporter) errorReporter(error, context);
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(MUTATION_STORE)) {
        db.createObjectStore(MUTATION_STORE, { keyPath: "id", autoIncrement: true });
      }
      // v1 → v2 migration: create mutations store
      if (event.oldVersion < 2 && !db.objectStoreNames.contains(MUTATION_STORE)) {
        db.createObjectStore(MUTATION_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
  });
  return dbPromise;
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ key, data, fetchedAt: new Date().toISOString() } as CacheEntry<T>);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    report(e, "setCache");
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    const entry = await new Promise<CacheEntry<T> | undefined>((resolve) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
    return entry?.data ?? null;
  } catch (e) {
    report(e, "getCache");
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    report(e, "clearCache");
  }
}

/** Is the browser online? */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

/** Cache keys */
export const OFFLINE_KEYS = {
  cases: "dashboard:cases",
  deadlines: "dashboard:deadlines",
  contacts: "dashboard:contacts",
  invoices: "dashboard:invoices",
  vault: "dashboard:vault",
  contracts: "dashboard:contracts",
  research: "dashboard:research",
  notifications: "dashboard:notifications",
  settings: "dashboard:settings",
} as const;

// --- Mutation Queue ---

export async function enqueueMutation(mutation: Omit<QueuedMutation, "id" | "createdAt">): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(MUTATION_STORE, "readwrite");
    const store = tx.objectStore(MUTATION_STORE);
    store.put({ ...mutation, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    report(e, "enqueueMutation");
  }
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(MUTATION_STORE, "readonly");
    const store = tx.objectStore(MUTATION_STORE);
    const req = store.getAll();
    const entries = await new Promise<QueuedMutation[]>((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    return entries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch (e) {
    report(e, "getPendingMutations");
    return [];
  }
}

export async function removeMutation(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(MUTATION_STORE, "readwrite");
    const store = tx.objectStore(MUTATION_STORE);
    store.delete(id);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    report(e, "removeMutation");
  }
}

export async function clearMutations(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(MUTATION_STORE, "readwrite");
    tx.objectStore(MUTATION_STORE).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    report(e, "clearMutations");
  }
}
