import { describe, test, expect, vi } from "vitest";

// Mock the api module
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      search: vi.fn(),
      getPages: vi.fn(),
      listPages: vi.fn(),
      createPage: vi.fn(),
      getPage: vi.fn(),
      updatePage: vi.fn(),
      deletePage: vi.fn(),
    },
  },
}));

import { api } from "@/lib/api";
import { inferMemoriesFromMessage } from "@/lib/copilot-memory";

describe("copilot-memory — regex fallback inference", () => {
  test("detects preference patterns", () => {
    const result = inferMemoriesFromMessage("Ich möchte kurze Antworten");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].type).toBe("preference");
  });

  test("detects instruction patterns", () => {
    const result = inferMemoriesFromMessage("Denk daran, dass ich immer RVG-Nummern brauche");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((r) => r.type === "instruction")).toBe(true);
  });

  test("detects fact patterns", () => {
    const result = inferMemoriesFromMessage("Ich arbeite als Fachanwalt für Mietrecht");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((r) => r.type === "fact")).toBe(true);
  });

  test("returns empty for non-informative messages", () => {
    const result = inferMemoriesFromMessage("Was ist BGB § 280?");
    expect(result.length).toBe(0);
  });
});

describe("copilot-memory — entity matching", () => {
  // Test the countEntityMatches logic indirectly through searchMemories
  test("entities are stored and parsed correctly", async () => {
    const mockPage = {
      slug: "copilot/memory/test-1",
      title: "Memory: test",
      content: "Ich arbeite mit Mietrecht",
      type: "copilot_memory",
      frontmatter: {
        type: "copilot_memory",
        memory_id: "test-1",
        memory_type: "fact",
        memory_key: "specialization",
        memory_value: "Ich arbeite mit Mietrecht",
        memory_source: "inferred",
        pinned: false,
        times_referenced: 0,
        entities: ["Mietrecht", "Fachanwalt"],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    vi.mocked(api.brain.search).mockResolvedValue([
      {
        slug: "copilot/memory/test-1",
        title: "Memory: test",
        snippet: "Ich arbeite mit Mietrecht",
        score: 0.95,
      },
    ]);

    vi.mocked(api.brain.getPages).mockResolvedValue({
      "copilot/memory/test-1": mockPage as never,
    });

    vi.mocked(api.brain.listPages).mockResolvedValue([]);

    const { searchMemories } = await import("@/lib/copilot-memory");
    const results = await searchMemories({ query: "Mietrecht Frage", limit: 5 });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entities).toEqual(["Mietrecht", "Fachanwalt"]);
  });
});

describe("copilot-memory — supersession filtering", () => {
  test("superseded memories are filtered out in search", async () => {
    const activePage = {
      slug: "copilot/memory/active-1",
      title: "Memory: active",
      content: "Ich bevorzuge detaillierte Antworten",
      type: "copilot_memory",
      frontmatter: {
        type: "copilot_memory",
        memory_id: "active-1",
        memory_type: "preference",
        memory_key: "answer_style",
        memory_value: "Ich bevorzuge detaillierte Antworten",
        memory_source: "inferred",
        pinned: false,
        times_referenced: 0,
        created_at: "2026-01-02T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      },
      created_at: "2026-01-02T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    };

    const supersededPage = {
      slug: "copilot/memory/old-1",
      title: "Memory: old",
      content: "Ich bevorzuge kurze Antworten",
      type: "copilot_memory",
      frontmatter: {
        type: "copilot_memory",
        memory_id: "old-1",
        memory_type: "preference",
        memory_key: "answer_style",
        memory_value: "Ich bevorzuge kurze Antworten",
        memory_source: "inferred",
        pinned: false,
        times_referenced: 0,
        superseded_by: "active-1",
        superseded_at: "2026-01-02T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    vi.mocked(api.brain.search).mockResolvedValue([
      {
        slug: "copilot/memory/active-1",
        title: "Memory: active",
        snippet: "detaillierte Antworten",
        score: 0.9,
      },
      {
        slug: "copilot/memory/old-1",
        title: "Memory: old",
        snippet: "kurze Antworten",
        score: 0.85,
      },
    ]);

    vi.mocked(api.brain.getPages).mockResolvedValue({
      "copilot/memory/active-1": activePage as never,
      "copilot/memory/old-1": supersededPage as never,
    });

    vi.mocked(api.brain.listPages).mockResolvedValue([]);

    const { searchMemories } = await import("@/lib/copilot-memory");
    const results = await searchMemories({ query: "Antwortstil", limit: 5 });

    // The superseded memory should be filtered out
    expect(results.find((r) => r.id === "old-1")).toBeUndefined();
    expect(results.find((r) => r.id === "active-1")).toBeDefined();
  });
});

describe("session-memory — 3-layer architecture", () => {
  test("createSessionMemory creates a new session", async () => {
    const { createSessionMemory, getSessionMemory } = await import("@/lib/session-memory");
    const session = createSessionMemory("test-session-1");
    expect(session.sessionId).toBe("test-session-1");
    expect(session.entries).toEqual([]);
    expect(getSessionMemory("test-session-1")).toBeDefined();
  });

  test("addToSessionMemory tracks topics", async () => {
    const { addToSessionMemory, getSessionMemory } = await import("@/lib/session-memory");
    addToSessionMemory("test-session-2", {
      key: "topic-1",
      value: "Mietrecht Kündigung",
      type: "topic",
    });
    const session = getSessionMemory("test-session-2");
    expect(session?.entries.length).toBe(1);
    expect(session?.topicHistory).toContain("Mietrecht Kündigung");
  });

  test("buildSessionContext returns formatted string", async () => {
    const { addToSessionMemory, buildSessionContext } = await import("@/lib/session-memory");
    addToSessionMemory("test-session-3", {
      key: "topic-1",
      value: "BGB § 280",
      type: "topic",
    });
    const ctx = buildSessionContext("test-session-3");
    expect(ctx).toContain("SESSION-KONTEXT");
    expect(ctx).toContain("BGB § 280");
  });

  test("buildSessionContext returns empty for non-existent session", async () => {
    const { buildSessionContext } = await import("@/lib/session-memory");
    const ctx = buildSessionContext("non-existent-session");
    expect(ctx).toBe("");
  });

  test("trackMessageInSession extracts topics from messages", async () => {
    const { trackMessageInSession, getSessionMemory } = await import("@/lib/session-memory");
    trackMessageInSession("test-session-4", "Ich habe eine Frage zum Mietrecht Kündigung");
    const session = getSessionMemory("test-session-4");
    expect(session).toBeDefined();
    expect(session?.topicHistory.length).toBeGreaterThan(0);
  });

  test("clearSessionMemory removes the session", async () => {
    const { createSessionMemory, clearSessionMemory, getSessionMemory } =
      await import("@/lib/session-memory");
    createSessionMemory("test-session-5");
    clearSessionMemory("test-session-5");
    expect(getSessionMemory("test-session-5")).toBeNull();
  });
});

describe("copilot-memory-llm — extraction module", () => {
  test("isLLMExtractionAvailable returns false without API key", async () => {
    const originalKey = process.env.OPENROUTER_API_KEY;
    const originalFallback = process.env.OPENROUTER_API_KEY_FALLBACK;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY_FALLBACK;
    const { isLLMExtractionAvailable } = await import("@/lib/copilot-memory-llm");
    expect(isLLMExtractionAvailable()).toBe(false);
    if (originalKey) process.env.OPENROUTER_API_KEY = originalKey;
    if (originalFallback) process.env.OPENROUTER_API_KEY_FALLBACK = originalFallback;
  });

  test("extractMemoriesWithLLM returns empty array without API key", async () => {
    const originalKey = process.env.OPENROUTER_API_KEY;
    const originalFallback = process.env.OPENROUTER_API_KEY_FALLBACK;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY_FALLBACK;
    const { extractMemoriesWithLLM } = await import("@/lib/copilot-memory-llm");
    const result = await extractMemoriesWithLLM("Ich bevorzuge kurze Antworten");
    expect(result).toEqual([]);
    if (originalKey) process.env.OPENROUTER_API_KEY = originalKey;
    if (originalFallback) process.env.OPENROUTER_API_KEY_FALLBACK = originalFallback;
  });
});
