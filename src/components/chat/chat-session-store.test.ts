import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import type { ChatSession, ChatMessage } from "./chat-types";
import {
  createSession,
  updateSession,
  deleteSession,
  listSessions,
  getSession,
  saveMessage,
  loadMessages,
  clearAllSessions,
  generateSessionId,
  generateMessageId,
  autoTitleFromQuery,
  pinSession,
  unpinSession,
  setSessionTags,
  getChatStats,
  resetChatDbCache,
} from "./chat-session-store";

beforeEach(async () => {
  resetChatDbCache();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("subsumio-chat");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

describe("chat-session-store", () => {
  const baseSession: ChatSession = {
    id: "s-1",
    title: "Test Session",
    contextType: "global",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
  };

  it("creates and retrieves a session", async () => {
    await createSession(baseSession);
    const found = await getSession(baseSession.id);
    expect(found).toMatchObject(baseSession);
  });

  it("lists sessions sorted by updatedAt with pinned first", async () => {
    const s1: ChatSession = {
      ...baseSession,
      id: "s-1",
      pinned: true,
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const s2: ChatSession = {
      ...baseSession,
      id: "s-2",
      pinned: false,
      updatedAt: "2026-01-02T00:00:00Z",
    };
    const s3: ChatSession = {
      ...baseSession,
      id: "s-3",
      pinned: false,
      updatedAt: "2026-01-03T00:00:00Z",
    };
    await createSession(s1);
    await createSession(s2);
    await createSession(s3);
    const list = await listSessions();
    expect(list.map((s) => s.id)).toEqual(["s-1", "s-3", "s-2"]);
  });

  it("filters sessions by caseSlug", async () => {
    const globalSession: ChatSession = { ...baseSession, id: "sg", contextType: "global" };
    const caseSession: ChatSession = {
      ...baseSession,
      id: "sc",
      contextType: "case",
      caseSlug: "case-a",
    };
    await createSession(globalSession);
    await createSession(caseSession);
    const list = await listSessions({ caseSlug: "case-a" });
    // Matter-context list also includes global sessions for easy switching
    expect(list.map((s) => s.id)).toEqual(["sc", "sg"]);
  });

  it("filters sessions by contextType", async () => {
    const s1: ChatSession = { ...baseSession, id: "c1", contextType: "case" };
    const s2: ChatSession = { ...baseSession, id: "g1", contextType: "global" };
    await createSession(s1);
    await createSession(s2);
    const list = await listSessions({ contextType: "case" });
    expect(list.map((s) => s.id)).toEqual(["c1"]);
  });

  it("updates session metadata", async () => {
    await createSession(baseSession);
    await updateSession(baseSession.id, { title: "Updated", messageCount: 5 });
    const found = await getSession(baseSession.id);
    expect(found?.title).toBe("Updated");
    expect(found?.messageCount).toBe(5);
  });

  it("pins and unpins a session", async () => {
    await createSession(baseSession);
    await pinSession(baseSession.id);
    let found = await getSession(baseSession.id);
    expect(found?.pinned).toBe(true);
    await unpinSession(baseSession.id);
    found = await getSession(baseSession.id);
    expect(found?.pinned).toBe(false);
  });

  it("tags a session", async () => {
    await createSession(baseSession);
    await setSessionTags(baseSession.id, ["fristen", "klage"]);
    const found = await getSession(baseSession.id);
    expect(found?.tags).toEqual(["fristen", "klage"]);
  });

  it("saves and loads messages for a session", async () => {
    const msg: ChatMessage = {
      id: generateMessageId(),
      role: "user",
      content: "Hallo",
      createdAt: new Date().toISOString(),
    };
    await createSession(baseSession);
    await saveMessage(baseSession.id, msg);
    const loaded = await loadMessages(baseSession.id);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe("Hallo");
    expect(loaded[0]).not.toHaveProperty("sessionId");
  });

  it("sorts loaded messages by createdAt", async () => {
    await createSession(baseSession);
    const m1: ChatMessage = {
      id: "m1",
      role: "user",
      content: "a",
      createdAt: "2026-01-02T00:00:00Z",
    };
    const m2: ChatMessage = {
      id: "m2",
      role: "user",
      content: "b",
      createdAt: "2026-01-01T00:00:00Z",
    };
    await saveMessage(baseSession.id, m1);
    await saveMessage(baseSession.id, m2);
    const loaded = await loadMessages(baseSession.id);
    expect(loaded.map((m) => m.id)).toEqual(["m2", "m1"]);
  });

  it("deletes a session and its messages", async () => {
    const msg: ChatMessage = {
      id: "m1",
      role: "user",
      content: "x",
      createdAt: new Date().toISOString(),
    };
    await createSession(baseSession);
    await saveMessage(baseSession.id, msg);
    await deleteSession(baseSession.id);
    const found = await getSession(baseSession.id);
    const messages = await loadMessages(baseSession.id);
    expect(found).toBeNull();
    expect(messages).toHaveLength(0);
  });

  it("clears all sessions and messages", async () => {
    await createSession(baseSession);
    await saveMessage(baseSession.id, {
      id: "m1",
      role: "user",
      content: "x",
      createdAt: new Date().toISOString(),
    });
    await clearAllSessions();
    const list = await listSessions();
    const messages = await loadMessages(baseSession.id);
    expect(list).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  it("generates deterministic-looking IDs and titles", () => {
    const id = generateSessionId();
    const msgId = generateMessageId();
    expect(id).toMatch(/^chat-\d+-[a-z0-9]+$/);
    expect(msgId).toMatch(/^msg-\d+-[a-z0-9]+$/);
    expect(autoTitleFromQuery("Kurze Frage")).toBe("Kurze Frage");
    expect(autoTitleFromQuery("a".repeat(60))).toHaveLength(48);
  });

  it("returns chat stats", async () => {
    const s1: ChatSession = { ...baseSession, id: "s1", pinned: true, tags: ["a"] };
    await createSession(s1);
    await saveMessage(s1.id, {
      id: "m1",
      role: "user",
      content: "x",
      createdAt: "2026-01-01T12:00:00Z",
      tokensUsed: 100,
    });
    await saveMessage(s1.id, {
      id: "m2",
      role: "assistant",
      content: "y",
      createdAt: "2026-01-01T13:00:00Z",
      tokensUsed: 50,
    });
    const stats = await getChatStats();
    expect(stats.totalSessions).toBe(1);
    expect(stats.totalMessages).toBe(2);
    expect(stats.totalTokens).toBe(150);
    expect(stats.pinnedCount).toBe(1);
    expect(stats.taggedCount).toBe(1);
    expect(stats.tokensByDay).toHaveLength(1);
    expect(stats.tokensByDay[0].tokens).toBe(150);
  });
});
