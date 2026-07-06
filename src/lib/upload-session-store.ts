/**
 * IndexedDB-based upload session store — enables resumable multipart uploads.
 *
 * When a user uploads a large file (>100MB) via multipart, we persist the
 * upload session state (upload ID, completed parts, file metadata) to
 * IndexedDB. If the tab is closed or the page reloads, the client can
 * resume the upload from the last completed part instead of restarting.
 *
 * Sessions expire after 24 hours and are cleaned up on next access.
 */

const DB_NAME = "subsumio-uploads";
const STORE_NAME = "sessions";
const DB_VERSION = 1;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface UploadSession {
  id: string;
  filename: string;
  fileSize: number;
  fileType: string;
  uploadToken: string;
  uploadId: string;
  storagePath: string;
  partSize: number;
  partCount: number;
  completedParts: Array<{ part_number: number; etag: string }>;
  createdAt: number;
  updatedAt: number;
  options?: {
    title?: string;
    source?: string;
    tags?: string[];
    case_slug?: string;
    password?: string;
    pause_for_review?: boolean;
    jurisdiction?: string;
    doc_type?: string;
    defer_pipeline?: boolean;
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateSessionId(filename: string, fileSize: number, uploadToken: string): string {
  return `${uploadToken}-${filename}-${fileSize}`;
}

/**
 * Save or update an upload session.
 */
export async function saveUploadSession(session: UploadSession): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const id = generateSessionId(session.filename, session.fileSize, session.uploadToken);
    store.put({ ...session, id, updatedAt: Date.now() });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB might be unavailable (private browsing, quota) — silently skip
  }
}

/**
 * Get an existing upload session by file metadata.
 * Returns null if no session exists or it has expired.
 */
export async function getUploadSession(
  filename: string,
  fileSize: number,
  uploadToken: string
): Promise<UploadSession | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const id = generateSessionId(filename, fileSize, uploadToken);
    const request = store.get(id);
    const result = await new Promise<UploadSession | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as UploadSession | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();

    if (!result) return null;
    if (Date.now() - result.updatedAt > SESSION_TTL_MS) {
      await deleteUploadSession(filename, fileSize, uploadToken);
      return null;
    }
    return result as UploadSession;
  } catch {
    return null;
  }
}

/**
 * Update completed parts for an existing session.
 */
export async function updateSessionParts(
  session: UploadSession,
  completedParts: Array<{ part_number: number; etag: string }>
): Promise<void> {
  await saveUploadSession({ ...session, completedParts });
}

/**
 * Delete an upload session after completion or cancellation.
 */
export async function deleteUploadSession(
  filename: string,
  fileSize: number,
  uploadToken: string
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const id = generateSessionId(filename, fileSize, uploadToken);
    store.delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Silently ignore
  }
}

/**
 * Clean up all expired sessions. Called on app startup.
 */
export async function cleanupExpiredSessions(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    const allSessions = await new Promise<UploadSession[]>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as UploadSession[]) ?? []);
      request.onerror = () => reject(request.error);
    });
    for (const session of allSessions) {
      if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
        store.delete(session.id);
      }
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Silently ignore
  }
}
