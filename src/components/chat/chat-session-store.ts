/**
 * Chat Session Store — IndexedDB persistence for chat sessions and messages.
 * Supports multiple sessions with metadata, replacing the flat chat_history store.
 */

import type { ChatMessage, ChatSession } from "@/components/chat/chat-types";

const DB_NAME = "subsumio-chat";
const DB_VERSION = 1;
const SESSIONS_STORE = "sessions";
const MESSAGES_STORE = "messages";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("contextType", "contextType", { unique: false });
      }
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        const store = db.createObjectStore(MESSAGES_STORE, { keyPath: "id" });
        store.createIndex("sessionId", "sessionId", { unique: false });
      }
    };
  });
  return dbPromise;
}

interface StoredMessage extends ChatMessage {
  sessionId: string;
}

export async function createSession(session: ChatSession): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(SESSIONS_STORE, "readwrite");
    tx.objectStore(SESSIONS_STORE).put(session);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("[chat-session] createSession:", e);
  }
}

export async function updateSession(id: string, patch: Partial<ChatSession>): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(SESSIONS_STORE, "readwrite");
    const store = tx.objectStore(SESSIONS_STORE);
    const req = store.get(id);
    const existing = await new Promise<ChatSession | undefined>((resolve) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
    if (existing) {
      store.put({ ...existing, ...patch });
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.error("[chat-session] updateSession:", e);
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([SESSIONS_STORE, MESSAGES_STORE], "readwrite");
    tx.objectStore(SESSIONS_STORE).delete(id);
    const msgStore = tx.objectStore(MESSAGES_STORE);
    const idx = msgStore.index("sessionId");
    const cursorReq = idx.openCursor(IDBKeyRange.only(id));
    await new Promise<void>((resolve) => {
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.error("[chat-session] deleteSession:", e);
  }
}

export async function listSessions(): Promise<ChatSession[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(SESSIONS_STORE, "readonly");
    const req = tx.objectStore(SESSIONS_STORE).getAll();
    const sessions = await new Promise<ChatSession[]>((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    return sessions.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  } catch (e) {
    console.error("[chat-session] listSessions:", e);
    return [];
  }
}

export async function getSession(id: string): Promise<ChatSession | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(SESSIONS_STORE, "readonly");
    const req = tx.objectStore(SESSIONS_STORE).get(id);
    const session = await new Promise<ChatSession | undefined>((resolve) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
    return session ?? null;
  } catch (e) {
    console.error("[chat-session] getSession:", e);
    return null;
  }
}

export async function saveMessage(sessionId: string, msg: ChatMessage): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(MESSAGES_STORE, "readwrite");
    tx.objectStore(MESSAGES_STORE).put({ ...msg, sessionId });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("[chat-session] saveMessage:", e);
  }
}

export async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(MESSAGES_STORE, "readonly");
    const idx = tx.objectStore(MESSAGES_STORE).index("sessionId");
    const req = idx.getAll(IDBKeyRange.only(sessionId));
    const messages = await new Promise<StoredMessage[]>((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    return messages
      .map(({ sessionId: _sid, ...msg }) => msg)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch (e) {
    console.error("[chat-session] loadMessages:", e);
    return [];
  }
}

export async function clearAllSessions(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([SESSIONS_STORE, MESSAGES_STORE], "readwrite");
    tx.objectStore(SESSIONS_STORE).clear();
    tx.objectStore(MESSAGES_STORE).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.error("[chat-session] clearAllSessions:", e);
  }
}

export function generateSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function autoTitleFromQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length <= 50) return trimmed;
  return trimmed.slice(0, 47) + "…";
}

export async function pinSession(id: string): Promise<void> {
  await updateSession(id, { pinned: true });
}

export async function unpinSession(id: string): Promise<void> {
  await updateSession(id, { pinned: false });
}

export async function setSessionTags(id: string, tags: string[]): Promise<void> {
  await updateSession(id, { tags });
}

export async function getChatStats(): Promise<{
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  pinnedCount: number;
  taggedCount: number;
  tokensByDay: Array<{ date: string; tokens: number }>;
}> {
  try {
    const db = await openDb();
    const sessionsTx = db.transaction(SESSIONS_STORE, "readonly");
    const sessionsReq = sessionsTx.objectStore(SESSIONS_STORE).getAll();
    const sessions = await new Promise<ChatSession[]>((resolve) => {
      sessionsReq.onsuccess = () => resolve(sessionsReq.result || []);
      sessionsReq.onerror = () => resolve([]);
    });

    const messagesTx = db.transaction(MESSAGES_STORE, "readonly");
    const messagesReq = messagesTx.objectStore(MESSAGES_STORE).getAll();
    const messages = await new Promise<StoredMessage[]>((resolve) => {
      messagesReq.onsuccess = () => resolve(messagesReq.result || []);
      messagesReq.onerror = () => resolve([]);
    });

    const totalTokens = messages.reduce((sum, m) => sum + (m.tokensUsed ?? 0), 0);
    const pinnedCount = sessions.filter((s) => s.pinned).length;
    const taggedCount = sessions.filter((s) => (s.tags?.length ?? 0) > 0).length;

    const byDay = new Map<string, number>();
    for (const m of messages) {
      const day = m.createdAt.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + (m.tokensUsed ?? 0));
    }
    const tokensByDay = Array.from(byDay.entries())
      .map(([date, tokens]) => ({ date, tokens }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalSessions: sessions.length,
      totalMessages: messages.length,
      totalTokens,
      pinnedCount,
      taggedCount,
      tokensByDay,
    };
  } catch {
    return {
      totalSessions: 0,
      totalMessages: 0,
      totalTokens: 0,
      pinnedCount: 0,
      taggedCount: 0,
      tokensByDay: [],
    };
  }
}
