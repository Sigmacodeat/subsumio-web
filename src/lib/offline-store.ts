/**
 * Offline-Store für Subsumio Dashboard.
 * Cacht Brain-Daten (Akten, Fristen, Kontakte, Rechnungen) in IndexedDB.
 * Bei fehlender Internet-Verbindung → Fallback auf gecachte Daten.
 *
 * Every entry belongs to one person in one firm (the "owner", set from
 * /api/auth/me). Reads and the replay queue only see the current owner's
 * entries; without a known owner nothing is read or written. Logout and a
 * change of person or firm on this device delete the whole database.
 */

const DB_NAME = "subsumio-offline";
const DB_VERSION = 4;
const STORE_NAME = "pages";
const MUTATION_STORE = "mutations";
const CHAT_STORE = "chat_history";
const FILE_UPLOAD_STORE = "file_uploads";

interface CacheEntry<T> {
  key: string;
  data: T;
  fetchedAt: string;
}

// --- Owner (person + firm) ---

const OWNER_STORAGE_KEY = "subsumio-offline-owner";
/** undefined = not read yet; null = nobody signed in on this device. */
let owner: string | null | undefined;

function readStoredOwner(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(OWNER_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

function writeStoredOwner(value: string | null): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (value) localStorage.setItem(OWNER_STORAGE_KEY, value);
    else localStorage.removeItem(OWNER_STORAGE_KEY);
  } catch {
    /* storage blocked — the in-memory owner still applies */
  }
}

/** The person+firm offline data currently belongs to (null: nobody). */
export function currentOfflineOwner(): string | null {
  if (owner === undefined) owner = readStoredOwner();
  return owner;
}

async function deleteOfflineDatabase(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (pending) {
    try {
      (await pending).close();
    } catch {
      /* never opened */
    }
  }
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      // Another tab still holds the database: the delete completes when it
      // closes; until then the owner filter keeps its entries unused.
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Binds offline data to a person in a firm. A different owner than the one
 * the stored data belongs to (another person, another firm, or data from
 * before owners were recorded) deletes everything first.
 */
export async function setOfflineOwner(scope: string): Promise<void> {
  if (!scope) return;
  if (currentOfflineOwner() === scope) return;
  owner = scope;
  writeStoredOwner(scope);
  await deleteOfflineDatabase();
}

/** Logout: delete every cache, queue and chat entry on this device. */
export async function clearOfflineData(): Promise<void> {
  owner = null;
  writeStoredOwner(null);
  await deleteOfflineDatabase();
}

/** True when stored offline data may belong to someone other than `userId`. */
export function offlineOwnerDiffersFromUser(userId: string): boolean {
  const current = currentOfflineOwner();
  return !!current && !current.startsWith(`${userId}:`);
}

function ownedKey(key: string): string | null {
  const o = currentOfflineOwner();
  return o ? `${o}|${key}` : null;
}

export interface QueuedMutation {
  id: string;
  /** Person+firm that queued it; the replay only runs the current owner's. */
  owner?: string;
  type: "createPage" | "updatePage" | "deletePage";
  payload: Record<string, unknown>;
  createdAt: string;
  retries?: number;
  /** Server-seitig geaenderte Seite erkannt — wartet auf User-Entscheidung
   *  (erneut senden / verwerfen), wird vom Replay uebersprungen. */
  conflicted?: boolean;
  /** Wann der Konflikt erkannt wurde — macht lang liegende Konflikte
   *  im Sync-Banner sichtbar ("seit n Tagen"). */
  conflictAt?: string;
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
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
        db.createObjectStore(CHAT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FILE_UPLOAD_STORE)) {
        db.createObjectStore(FILE_UPLOAD_STORE, { keyPath: "id" });
      }
      // v1 → v2 migration: create mutations store
      if (event.oldVersion < 2 && !db.objectStoreNames.contains(MUTATION_STORE)) {
        db.createObjectStore(MUTATION_STORE, { keyPath: "id", autoIncrement: true });
      }
      // v2 → v3 migration: create chat_history store
      if (event.oldVersion < 3 && !db.objectStoreNames.contains(CHAT_STORE)) {
        db.createObjectStore(CHAT_STORE, { keyPath: "id" });
      }
      // v3 → v4 migration: create file_uploads store
      if (event.oldVersion < 4 && !db.objectStoreNames.contains(FILE_UPLOAD_STORE)) {
        db.createObjectStore(FILE_UPLOAD_STORE, { keyPath: "id" });
      }
    };
  });
  return dbPromise;
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  const scoped = ownedKey(key);
  if (!scoped) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ key: scoped, data, fetchedAt: new Date().toISOString() } as CacheEntry<T>);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    report(e, "setCache");
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  const scoped = ownedKey(key);
  if (!scoped) return null;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(scoped);
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
  return typeof navigator !== "undefined" && navigator.onLine === true;
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
  chatHistory: "dashboard:chat-history",
  mobileDocPrefix: "mobile:doc:",
} as const;

// --- Mutation Queue ---

export async function enqueueMutation(
  mutation: Omit<QueuedMutation, "id" | "createdAt" | "owner">
): Promise<void> {
  const o = currentOfflineOwner();
  if (!o) {
    report(new Error("offline owner unknown — change not queued"), "enqueueMutation");
    return;
  }
  try {
    const db = await openDb();
    const tx = db.transaction(MUTATION_STORE, "readwrite");
    const store = tx.objectStore(MUTATION_STORE);
    store.put({
      ...mutation,
      owner: o,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    report(e, "enqueueMutation");
  }
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const o = currentOfflineOwner();
  if (!o) return [];
  try {
    const db = await openDb();
    const tx = db.transaction(MUTATION_STORE, "readonly");
    const store = tx.objectStore(MUTATION_STORE);
    const req = store.getAll();
    const entries = await new Promise<QueuedMutation[]>((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    // Never another person's or firm's queue.
    return entries
      .filter((m) => m.owner === o)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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

export async function incrementMutationRetries(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(MUTATION_STORE, "readwrite");
    const store = tx.objectStore(MUTATION_STORE);
    const req = store.get(id);
    await new Promise<void>((resolve) => {
      req.onsuccess = () => {
        const mut = req.result as QueuedMutation | undefined;
        if (mut) {
          mut.retries = (mut.retries ?? 0) + 1;
          store.put(mut);
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    report(e, "incrementMutationRetries");
  }
}

export async function setMutationConflicted(id: string, conflicted: boolean): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(MUTATION_STORE, "readwrite");
    const store = tx.objectStore(MUTATION_STORE);
    const req = store.get(id);
    await new Promise<void>((resolve) => {
      req.onsuccess = () => {
        const mut = req.result as QueuedMutation | undefined;
        if (mut) {
          mut.conflicted = conflicted;
          mut.conflictAt = conflicted ? new Date().toISOString() : undefined;
          store.put(mut);
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    report(e, "setMutationConflicted");
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

// --- Chat History ---

export interface ChatHistoryEntry {
  id: string;
  owner?: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: Array<{ slug: string; title: string }>;
  attachments?: Array<{ name: string; slug: string }>;
}

export async function saveChatMessage(msg: ChatHistoryEntry): Promise<void> {
  const o = currentOfflineOwner();
  if (!o) return;
  try {
    const db = await openDb();
    const tx = db.transaction(CHAT_STORE, "readwrite");
    tx.objectStore(CHAT_STORE).put({ ...msg, owner: o });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    report(e, "saveChatMessage");
  }
}

export async function loadChatHistory(): Promise<ChatHistoryEntry[]> {
  const o = currentOfflineOwner();
  if (!o) return [];
  try {
    const db = await openDb();
    const tx = db.transaction(CHAT_STORE, "readonly");
    const req = tx.objectStore(CHAT_STORE).getAll();
    const entries = await new Promise<ChatHistoryEntry[]>((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    return entries
      .filter((e) => e.owner === o)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } catch (e) {
    report(e, "loadChatHistory");
    return [];
  }
}

export async function clearChatHistory(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(CHAT_STORE, "readwrite");
    tx.objectStore(CHAT_STORE).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    report(e, "clearChatHistory");
  }
}

// --- File Upload Queue (C2) ---

export interface FileUploadEntry {
  id: string;
  owner?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  bytes: ArrayBuffer;
  metadata: {
    title?: string;
    source?: string;
    tags?: string[];
    case_slug?: string;
  };
  createdAt: string;
  retries?: number;
}

export async function enqueueFileUpload(
  entry: Omit<FileUploadEntry, "id" | "createdAt" | "owner">
): Promise<string> {
  const id = crypto.randomUUID();
  const o = currentOfflineOwner();
  if (!o) {
    report(new Error("offline owner unknown — upload not queued"), "enqueueFileUpload");
    return id;
  }
  try {
    const db = await openDb();
    const tx = db.transaction(FILE_UPLOAD_STORE, "readwrite");
    tx.objectStore(FILE_UPLOAD_STORE).put({
      ...entry,
      owner: o,
      id,
      createdAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    report(e, "enqueueFileUpload");
  }
  return id;
}

export async function getPendingFileUploads(): Promise<FileUploadEntry[]> {
  const o = currentOfflineOwner();
  if (!o) return [];
  try {
    const db = await openDb();
    const tx = db.transaction(FILE_UPLOAD_STORE, "readonly");
    const req = tx.objectStore(FILE_UPLOAD_STORE).getAll();
    const entries = await new Promise<FileUploadEntry[]>((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    return entries
      .filter((e) => e.owner === o)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch (e) {
    report(e, "getPendingFileUploads");
    return [];
  }
}

export async function removeFileUpload(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(FILE_UPLOAD_STORE, "readwrite");
    tx.objectStore(FILE_UPLOAD_STORE).delete(id);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    report(e, "removeFileUpload");
  }
}

export async function incrementFileUploadRetries(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(FILE_UPLOAD_STORE, "readwrite");
    const store = tx.objectStore(FILE_UPLOAD_STORE);
    const req = store.get(id);
    await new Promise<void>((resolve) => {
      req.onsuccess = () => {
        const entry = req.result as FileUploadEntry | undefined;
        if (entry) {
          entry.retries = (entry.retries ?? 0) + 1;
          store.put(entry);
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    report(e, "incrementFileUploadRetries");
  }
}
