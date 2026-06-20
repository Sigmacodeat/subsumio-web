// @vitest-environment node

import { describe, test, expect, beforeEach } from "vitest";
// store.ts is a "use client" module but the Zustand store itself is testable
// in Node since it doesn't use React APIs directly at creation time.
import { useStore, type QueryMessage } from "./store";

describe("useStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useStore.setState({
      stats: null,
      recentQueries: [],
      searchResults: [],
      queryMessages: [],
      queryMode: "balanced",
      sidebarOpen: true,
    });
  });

  describe("stats", () => {
    test("starts as null", () => {
      expect(useStore.getState().stats).toBeNull();
    });

    test("setStats updates stats", () => {
      const stats = { totalCases: 10, totalDeadlines: 5 } as Record<string, unknown>;
      useStore.getState().setStats(stats as never);
      expect(useStore.getState().stats).toEqual(stats);
    });
  });

  describe("recentQueries", () => {
    test("starts empty", () => {
      expect(useStore.getState().recentQueries).toEqual([]);
    });

    test("setRecentQueries updates list", () => {
      const queries = [{ id: "1", query: "test", createdAt: new Date().toISOString() }] as unknown[];
      useStore.getState().setRecentQueries(queries as never);
      expect(useStore.getState().recentQueries).toEqual(queries);
    });
  });

  describe("searchResults", () => {
    test("starts empty", () => {
      expect(useStore.getState().searchResults).toEqual([]);
    });

    test("setSearchResults updates list", () => {
      const results = [{ slug: "cases/1", title: "Case 1" }] as unknown[];
      useStore.getState().setSearchResults(results as never);
      expect(useStore.getState().searchResults).toEqual(results);
    });
  });

  describe("queryMessages", () => {
    test("starts empty", () => {
      expect(useStore.getState().queryMessages).toEqual([]);
    });

    test("addMessage adds a message with id and createdAt", () => {
      const id = useStore.getState().addMessage({
        role: "user",
        content: "Hello",
      });
      expect(id).toBeTruthy();
      const messages = useStore.getState().queryMessages;
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Hello");
      expect(messages[0].role).toBe("user");
      expect(messages[0].createdAt).toBeInstanceOf(Date);
    });

    test("addMessage returns unique id", () => {
      const id1 = useStore.getState().addMessage({ role: "user", content: "A" });
      const id2 = useStore.getState().addMessage({ role: "user", content: "B" });
      expect(id1).not.toBe(id2);
    });

    test("addMessage preserves citations and gaps", () => {
      const id = useStore.getState().addMessage({
        role: "assistant",
        content: "Response",
        citations: [{ slug: "cases/1", title: "Case 1", quote: "...", confidence: 0.9 }],
        gaps: ["missing_doc"],
      });
      const msg = useStore.getState().queryMessages.find((m) => m.id === id);
      expect(msg?.citations).toHaveLength(1);
      expect(msg?.gaps).toEqual(["missing_doc"]);
    });

    test("updateMessage updates specific message", () => {
      const id = useStore.getState().addMessage({ role: "user", content: "Hello" });
      useStore.getState().updateMessage(id, { content: "Updated" });
      const msg = useStore.getState().queryMessages.find((m) => m.id === id);
      expect(msg?.content).toBe("Updated");
    });

    test("updateMessage does not affect other messages", () => {
      const id1 = useStore.getState().addMessage({ role: "user", content: "A" });
      const id2 = useStore.getState().addMessage({ role: "user", content: "B" });
      useStore.getState().updateMessage(id1, { content: "Updated A" });
      const msg2 = useStore.getState().queryMessages.find((m) => m.id === id2);
      expect(msg2?.content).toBe("B");
    });

    test("updateMessage with non-existent id is a no-op", () => {
      useStore.getState().addMessage({ role: "user", content: "A" });
      useStore.getState().updateMessage("nonexistent", { content: "X" });
      expect(useStore.getState().queryMessages).toHaveLength(1);
      expect(useStore.getState().queryMessages[0].content).toBe("A");
    });

    test("clearMessages removes all messages", () => {
      useStore.getState().addMessage({ role: "user", content: "A" });
      useStore.getState().addMessage({ role: "user", content: "B" });
      useStore.getState().clearMessages();
      expect(useStore.getState().queryMessages).toEqual([]);
    });

    test("addMessage appends to existing messages", () => {
      useStore.getState().addMessage({ role: "user", content: "First" });
      useStore.getState().addMessage({ role: "assistant", content: "Second" });
      const messages = useStore.getState().queryMessages;
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe("First");
      expect(messages[1].content).toBe("Second");
    });
  });

  describe("queryMode", () => {
    test("defaults to balanced", () => {
      expect(useStore.getState().queryMode).toBe("balanced");
    });

    test("setQueryMode updates mode", () => {
      useStore.getState().setQueryMode("conservative");
      expect(useStore.getState().queryMode).toBe("conservative");
    });

    test("setQueryMode to tokenmax", () => {
      useStore.getState().setQueryMode("tokenmax");
      expect(useStore.getState().queryMode).toBe("tokenmax");
    });
  });

  describe("sidebarOpen", () => {
    test("defaults to true", () => {
      expect(useStore.getState().sidebarOpen).toBe(true);
    });

    test("setSidebarOpen updates state", () => {
      useStore.getState().setSidebarOpen(false);
      expect(useStore.getState().sidebarOpen).toBe(false);
    });

    test("setSidebarOpen toggles back", () => {
      useStore.getState().setSidebarOpen(false);
      useStore.getState().setSidebarOpen(true);
      expect(useStore.getState().sidebarOpen).toBe(true);
    });
  });
});
