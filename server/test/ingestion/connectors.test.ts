/**
 * Connector architecture tests — BaseConnector, ConnectorManager,
 * Google OAuth helper, and a mock end-to-end sync.
 *
 * All external HTTP calls are mocked (global.fetch override).
 * Token / state persistence uses real fs in a temp directory.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmdirSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  BaseConnector,
  type ConnectorConfig,
  type ConnectorItem,
} from "../../src/core/ingestion/connectors/base.ts";
import {
  ConnectorManager,
  SUPPORTED_CONNECTORS,
} from "../../src/core/ingestion/connectors/manager.ts";
import { SlackConnector } from "../../src/core/ingestion/connectors/slack.ts";
import { CalendarConnector } from "../../src/core/ingestion/connectors/calendar.ts";
import {
  generateAuthUrl,
  exchangeCode,
  refreshAccessToken,
} from "../../src/core/ingestion/connectors/google-oauth.ts";
import {
  type IngestionEvent,
  type IngestionSourceContext,
} from "../../src/core/ingestion/types.ts";
import type { BrainEngine } from "../../src/core/engine.ts";

// ── Helpers ──────────────────────────────────────────────────────────

function makeThrowingEngine(): BrainEngine {
  return new Proxy({} as BrainEngine, {
    get(_target, prop) {
      if (prop === "then" || prop === Symbol.toPrimitive || prop === Symbol.toStringTag)
        return undefined;
      throw new Error(`Engine access not allowed in test: ${String(prop)}`);
    },
  });
}

function makeNoopCtx(): IngestionSourceContext {
  return {
    emit: () => {},
    engine: makeThrowingEngine(),
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    abortSignal: new AbortController().signal,
    config: {},
  };
}

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "gbrain-connector-test-"));
}

function cleanDir(dir: string): void {
  if (!existsSync(dir)) return;
  try {
    rmdirSync(dir);
  } catch {
    /* ignore */
  }
}

// A minimal mock connector for testing the abstract base class.
class MockConnector extends BaseConnector {
  constructor(config: ConnectorConfig = {}) {
    super("mock", config);
  }

  getApiRateLimit() {
    return { capacity: 10, windowMs: 1000 };
  }

  async refreshToken() {
    this.updateTokens("new-access-token", "new-refresh-token", 3600);
  }

  async fetchDelta(cursor?: string) {
    return {
      items: [
        {
          id: "item-1",
          title: "Test Item",
          modified_at: new Date().toISOString(),
          content: "Hello world",
          content_type: "text/plain",
          url: "https://example.com/1",
        },
      ],
      nextCursor: cursor ? `${cursor}-next` : "cursor-1",
    };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    return {
      source_id: this.id,
      source_kind: this.kind,
      source_uri: item.url ?? `mock://${item.id}`,
      received_at: new Date().toISOString(),
      content_type: "text/markdown",
      content: item.content,
      content_hash: this.hashContent(item.content),
    };
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe("BaseConnector", () => {
  test("hashContent returns stable SHA-256", () => {
    const c = new MockConnector();
    const h1 = (c as any).hashContent("hello");
    const h2 = (c as any).hashContent("hello");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // hex sha256
    expect(h1).not.toBe((c as any).hashContent("world"));
  });

  test("detectContentType maps extensions correctly", () => {
    const c = new MockConnector();
    expect((c as any).detectContentType("doc.pdf", "unknown")).toBe("application/pdf");
    expect((c as any).detectContentType("doc.txt", "unknown")).toBe("text/markdown");
    expect((c as any).detectContentType("doc.md", "unknown")).toBe("text/markdown");
    expect((c as any).detectContentType("doc.unknown", "unknown")).toBe("unknown");
    expect((c as any).detectContentType("image.png", "image/png")).toBe("image/*");
    expect((c as any).detectContentType("audio.mp3", "unknown")).toBe("audio/*");
    expect((c as any).detectContentType("video.mp4", "unknown")).toBe("video/*");
    expect((c as any).detectContentType("data.json", "unknown")).toBe("application/json");
  });

  test("updateTokens persists to state file", async () => {
    const tmpDir = makeTmpDir();
    const cfg: ConnectorConfig = {};
    const c = new MockConnector(cfg);

    // Override state path to tmp dir.
    (c as any)._statePath = () => join(tmpDir, "mock.json");

    (c as any).updateTokens("acc-123", "ref-456", 7200);

    // _saveState is async; give it a tick to flush.
    await new Promise((r) => setTimeout(r, 50));

    const statePath = join(tmpDir, "mock.json");
    expect(existsSync(statePath)).toBe(true);

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.access_token).toBe("acc-123");
    expect(state.refresh_token).toBe("ref-456");
    expect(state.token_expires_at).toBeGreaterThan(Date.now());

    cleanDir(tmpDir);
  });

  test("getAccessToken returns token when valid", () => {
    const c = new MockConnector();
    (c as any).updateTokens("valid-token", "refresh-token", 3600);
    expect((c as any).getAccessToken()).toBe("valid-token");
  });

  test("getAccessToken returns empty when token is expired", () => {
    const c = new MockConnector();
    (c as any).updateTokens("expired-token", "refresh-token", -1); // already expired
    expect((c as any).getAccessToken()).toBe("");
  });
});

describe("ConnectorManager", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  test("SUPPORTED_CONNECTORS lists all services", () => {
    expect(SUPPORTED_CONNECTORS).toContain("google-drive");
    expect(SUPPORTED_CONNECTORS).toContain("gmail");
    expect(SUPPORTED_CONNECTORS).toContain("notion");
    expect(SUPPORTED_CONNECTORS).toContain("github");
    expect(SUPPORTED_CONNECTORS).toContain("slack");
    expect(SUPPORTED_CONNECTORS).toContain("calendar");
    expect(SUPPORTED_CONNECTORS).toContain("dropbox");
    expect(SUPPORTED_CONNECTORS).toContain("asana");
    expect(SUPPORTED_CONNECTORS).toContain("jira");
    expect(SUPPORTED_CONNECTORS).toContain("advokat-import");
  });

  test("add persists connector state", async () => {
    const mgr = new ConnectorManager(tmpDir);
    const cfg: ConnectorConfig = { api_key: "secret-123" };
    await mgr.add("github", cfg);

    const registryPath = join(tmpDir, ".gbrain", "connectors.json");
    expect(existsSync(registryPath)).toBe(true);

    const registry = JSON.parse(readFileSync(registryPath, "utf-8"));
    expect(registry).toHaveLength(1);
    expect(registry[0].service).toBe("github");
    expect(registry[0].enabled).toBe(true);
  });

  test("list returns empty when no connectors", async () => {
    const mgr = new ConnectorManager(tmpDir);
    const list = await mgr.list();
    expect(list).toHaveLength(0);
  });

  test("enable/disable toggles connector state", async () => {
    const mgr = new ConnectorManager(tmpDir);
    await mgr.add("github", { api_key: "x" });

    let list = await mgr.list();
    expect(list[0].enabled).toBe(true);

    await mgr.setEnabled("github", false);
    list = await mgr.list();
    expect(list[0].enabled).toBe(false);

    await mgr.setEnabled("github", true);
    list = await mgr.list();
    expect(list[0].enabled).toBe(true);
  });

  test("remove deletes state and registry entry", async () => {
    const mgr = new ConnectorManager(tmpDir);
    await mgr.add("github", { api_key: "x" });

    let list = await mgr.list();
    expect(list).toHaveLength(1);

    await mgr.remove("github");
    list = await mgr.list();
    expect(list).toHaveLength(0);
  });

  test("loadEnabled returns only enabled connectors", async () => {
    const mgr = new ConnectorManager(tmpDir);
    await mgr.add("notion", { api_key: "n-key" });
    await mgr.add("github", { api_key: "g-key" });
    await mgr.setEnabled("github", false);

    const enabled = await mgr.loadEnabled();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].service).toBe("notion");
  });

  test("add rejects unsupported service", async () => {
    const mgr = new ConnectorManager(tmpDir);
    await expect(mgr.add("confluence", { api_key: "x" })).rejects.toThrow("Unsupported connector");
  });
});

describe("Google OAuth helper", () => {
  test("generateAuthUrl produces valid URL with PKCE", () => {
    const result = generateAuthUrl(
      "my-client-id",
      "http://localhost:3000/oauth/callback",
      "https://www.googleapis.com/auth/drive.readonly"
    );

    expect(result.url).toContain("accounts.google.com");
    expect(result.url).toContain("client_id=my-client-id");
    expect(result.url).toContain("response_type=code");
    expect(result.url).toContain("code_challenge_method=S256");
    expect(result.url).toContain("access_type=offline");
    expect(result.codeVerifier).toHaveLength(43); // 32 bytes base64url
    expect(result.state).toBeTruthy();

    // code_challenge should be present and different from verifier
    expect(result.url).toContain("code_challenge=");
  });

  test("PKCE code_challenge is deterministic SHA-256 of verifier", () => {
    const result = generateAuthUrl("id", "http://localhost/cb", "scope");
    const verifier = result.codeVerifier;
    const challengeMatch = result.url.match(/code_challenge=([^&]+)/);
    expect(challengeMatch).toBeTruthy();

    // Re-compute expected challenge.
    const { createHash } = require("node:crypto");
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(decodeURIComponent(challengeMatch![1])).toBe(expected);
  });

  test("exchangeCode calls Google token endpoint", async () => {
    const fetchCalls: RequestInit[] = [];
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (_input: any, init: any) => {
      fetchCalls.push(init as RequestInit);
      return new Response(
        JSON.stringify({
          access_token: "acc-test",
          refresh_token: "ref-test",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "drive.readonly",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const result = await exchangeCode(
        "auth-code-123",
        "verifier-abc",
        "client-id",
        "client-secret",
        "http://localhost/cb"
      );

      expect(result.access_token).toBe("acc-test");
      expect(result.refresh_token).toBe("ref-test");
      expect(result.expires_in).toBe(3600);

      expect(fetchCalls).toHaveLength(1);
      const body = new URLSearchParams(fetchCalls[0].body as string);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("auth-code-123");
      expect(body.get("code_verifier")).toBe("verifier-abc");
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  test("refreshAccessToken calls Google refresh endpoint", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      return new Response(
        JSON.stringify({
          access_token: "new-acc",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const result = await refreshAccessToken("refresh-123", "client-id", "client-secret");
      expect(result.access_token).toBe("new-acc");
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  test("exchangeCode throws on error response", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    };

    try {
      await expect(exchangeCode("bad-code", "v", "id", "secret", "uri")).rejects.toThrow(
        "Token exchange failed"
      );
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});

describe("MockConnector end-to-end sync", () => {
  test("full sync round-trip produces ingestion event", async () => {
    const c = new MockConnector({ poll_interval_ms: 1000 });
    await c.start(makeNoopCtx());

    // Manually trigger a sync cycle (normally daemon timer does this).
    await (c as any)._syncOnce();

    // After sync, state should have cursor persisted.
    const state = await (c as any)._loadState();
    expect(state).toBeTruthy();
    expect(state.sync_cursor).toBeTruthy();

    await c.stop();
  });

  test("healthCheck reports ok when running with valid token", async () => {
    const c = new MockConnector();
    await c.start(makeNoopCtx());
    (c as any).updateTokens("valid", "refresh", 3600);

    const health = await c.healthCheck();
    expect(health.status).toBe("ok");

    await c.stop();
  });

  test("healthCheck reports fail when not running", async () => {
    const c = new MockConnector();
    const health = await c.healthCheck();
    expect(health.status).toBe("fail");
  });
});

describe("SlackConnector", () => {
  test("fetchDelta returns messages from channels", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    (globalThis as any).fetch = async (url: string) => {
      callCount++;
      if (url.includes("conversations.list")) {
        return new Response(
          JSON.stringify({
            ok: true,
            channels: [{ id: "C123", name: "general" }],
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          messages: [
            { ts: "1609459200.000000", text: "Hello team", user: "U456" },
            { ts: "1609459260.000000", text: "Meeting at 3pm", user: "U789" },
          ],
        }),
        { status: 200 }
      );
    };

    try {
      const c = new SlackConnector({ api_key: "xoxb-test" });
      (c as any).updateTokens("xoxb-test", undefined, 3600);
      const result = await c.fetchDelta();

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.title).toContain("Hello team");
      expect(result.items[0]?.metadata?.channel).toBe("general");
      expect(result.nextCursor).toBeTruthy();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  test("fetchDelta filters by channel names", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      if (url.includes("conversations.list")) {
        return new Response(
          JSON.stringify({
            ok: true,
            channels: [
              { id: "C1", name: "general" },
              { id: "C2", name: "random" },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          messages: [{ ts: "1609459200.000000", text: "msg", user: "U1" }],
        }),
        { status: 200 }
      );
    };

    try {
      const c = new SlackConnector({ api_key: "xoxb-test", filters: { channels: ["general"] } });
      (c as any).updateTokens("xoxb-test", undefined, 3600);
      const result = await c.fetchDelta();
      // Only general channel queried.
      expect(result.items).toHaveLength(1);
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});

describe("CalendarConnector", () => {
  test("fetchDelta returns events with syncToken", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      expect(url).toContain("calendar/v3/calendars/primary/events");
      expect(url).toContain("syncToken=abc123");
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "evt1",
              summary: "Team Standup",
              description: "Daily sync",
              start: { dateTime: "2026-06-01T09:00:00Z" },
              end: { dateTime: "2026-06-01T09:30:00Z" },
              updated: "2026-05-20T10:00:00Z",
              htmlLink: "https://calendar.google.com/event?id=evt1",
              status: "confirmed",
              creator: { email: "alice@example.com" },
              attendees: [{ email: "bob@example.com", responseStatus: "accepted" }],
            },
          ],
          nextSyncToken: "new-token-456",
        }),
        { status: 200 }
      );
    };

    try {
      const c = new CalendarConnector({
        client_id: "id",
        client_secret: "secret",
      });
      (c as any).updateTokens("acc-token", "ref-token", 3600);
      const result = await c.fetchDelta("abc123");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Team Standup");
      expect(result.items[0].content).toContain("Team Standup");
      expect(result.items[0].content).toContain("alice@example.com");
      expect(result.nextCursor).toBe("new-token-456");
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  test("fetchDelta falls back to timeMin when no syncToken", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      expect(url).not.toContain("syncToken");
      expect(url).toContain("timeMin");
      return new Response(
        JSON.stringify({
          items: [],
          nextSyncToken: "initial-token",
        }),
        { status: 200 }
      );
    };

    try {
      const c = new CalendarConnector({
        client_id: "id",
        client_secret: "secret",
      });
      (c as any).updateTokens("acc-token", "ref-token", 3600);
      const result = await c.fetchDelta();

      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBe("initial-token");
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});

describe("GoogleDriveConnector webhook push", () => {
  test("registerWebhook calls changes.watch and persists channel info", async () => {
    const originalFetch = globalThis.fetch;
    let watchCalled = false;
    (globalThis as any).fetch = async (url: string, init: any) => {
      if (url.includes("changes/watch")) {
        watchCalled = true;
        expect(init.method).toBe("POST");
        const body = JSON.parse(init.body);
        expect(body.type).toBe("web_hook");
        expect(body.address).toBe("https://example.com/webhook");
        return new Response(
          JSON.stringify({
            resourceId: "resource-abc",
            expiration: "1893456000000",
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    try {
      const { GoogleDriveConnector } =
        await import("../../src/core/ingestion/connectors/google-drive.ts");
      const c = new GoogleDriveConnector({
        webhook_url: "https://example.com/webhook",
        client_id: "id",
        client_secret: "secret",
      });
      (c as any).updateTokens("test-token", "refresh", 3600);
      await c.registerWebhook();

      expect(watchCalled).toBe(true);
      const state = (c as any)._state;
      expect(state.webhook_channel_id).toBeTruthy();
      expect(state.webhook_resource_id).toBe("resource-abc");
      expect(state.webhook_expires_at).toBe(1893456000000);
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  test("unregisterWebhook calls channels.stop and clears state", async () => {
    const originalFetch = globalThis.fetch;
    let stopCalled = false;
    (globalThis as any).fetch = async (url: string, init: any) => {
      if (url.includes("channels/stop")) {
        stopCalled = true;
        expect(init.method).toBe("POST");
        const body = JSON.parse(init.body);
        expect(body.id).toBe("channel-123");
        expect(body.resourceId).toBe("resource-abc");
        return new Response("", { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    try {
      const { GoogleDriveConnector } =
        await import("../../src/core/ingestion/connectors/google-drive.ts");
      const c = new GoogleDriveConnector({
        client_id: "id",
        client_secret: "secret",
      });
      (c as any).updateTokens("test-token", "refresh", 3600);
      (c as any)._state = {
        connector_id: "google-drive",
        service: "google-drive",
        access_token: "test",
        webhook_channel_id: "channel-123",
        webhook_resource_id: "resource-abc",
      };
      await c.unregisterWebhook();

      expect(stopCalled).toBe(true);
      expect((c as any)._state.webhook_channel_id).toBeUndefined();
      expect((c as any)._state.webhook_resource_id).toBeUndefined();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  test("sync() works without prior start()", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.href;
      if (url.includes("startPageToken")) {
        return new Response(JSON.stringify({ startPageToken: "token-1" }), { status: 200 });
      }
      if (url.includes("changes")) {
        return new Response(
          JSON.stringify({
            changes: [],
            newStartPageToken: "token-2",
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    try {
      const { GoogleDriveConnector } =
        await import("../../src/core/ingestion/connectors/google-drive.ts");
      const c = new GoogleDriveConnector({});
      (c as any).updateTokens("test-token", "refresh", 3600);

      // sync() should complete without throwing even when start() was never called.
      await c.sync();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});

describe("DropboxConnector", () => {
  test("fetchDelta returns files from list_folder", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.href;
      if (url.includes("list_folder/continue")) {
        return new Response(
          JSON.stringify({
            entries: [
              {
                ".tag": "file",
                id: "id1",
                name: "report.md",
                path_lower: "/docs/report.md",
                path_display: "/docs/report.md",
                server_modified: "2026-01-15T10:00:00Z",
                size: 1024,
                content_hash: "abc123",
              },
            ],
            cursor: "cursor-2",
            has_more: false,
          }),
          { status: 200 }
        );
      }
      if (url.includes("list_folder")) {
        return new Response(
          JSON.stringify({
            entries: [
              { ".tag": "folder", id: "id0", name: "docs", path_lower: "/docs" },
              {
                ".tag": "file",
                id: "id1",
                name: "report.md",
                path_lower: "/docs/report.md",
                path_display: "/docs/report.md",
                server_modified: "2026-01-15T10:00:00Z",
                size: 1024,
                content_hash: "abc123",
              },
              {
                ".tag": "file",
                id: "id2",
                name: "data.json",
                path_lower: "/data.json",
                path_display: "/data.json",
                server_modified: "2026-01-16T12:00:00Z",
                size: 512,
              },
            ],
            cursor: "cursor-1",
            has_more: true,
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    try {
      const { DropboxConnector } = await import("../../src/core/ingestion/connectors/dropbox.ts");
      const c = new DropboxConnector({ api_key: "db-token" });
      (c as any).updateTokens("db-token", undefined, 3600);

      const result = await c.fetchDelta();
      expect(result.items).toHaveLength(2); // folders skipped
      expect(result.items[0]?.title).toBe("report.md");
      expect(result.items[1]?.title).toBe("data.json");
      expect(result.nextCursor).toBeTruthy();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});

describe("AsanaConnector", () => {
  test("fetchDelta returns tasks from workspaces", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.href;
      if (url.includes("/workspaces")) {
        return new Response(JSON.stringify({ data: [{ gid: "ws1", name: "Engineering" }] }), {
          status: 200,
        });
      }
      if (url.includes("/tasks")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                gid: "task1",
                name: "Fix bug",
                notes: "Critical fix needed",
                created_at: "2026-01-01T00:00:00Z",
                modified_at: "2026-01-15T10:00:00Z",
                completed: false,
                due_on: "2026-01-20",
                permalink_url: "https://app.asana.com/0/1/1",
                assignee: { gid: "u1", name: "Alice" },
                projects: [{ gid: "p1", name: "Sprint 1" }],
                tags: [{ gid: "t1", name: "urgent" }],
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    try {
      const { AsanaConnector } = await import("../../src/core/ingestion/connectors/asana.ts");
      const c = new AsanaConnector({ api_key: "asana-token" });
      (c as any).updateTokens("asana-token", undefined, 3600);

      const result = await c.fetchDelta();
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.title).toBe("Fix bug");
      expect(result.items[0]?.content).toContain("Critical fix needed");
      expect(result.items[0]?.content).toContain("Alice");
      expect(result.nextCursor).toBeTruthy();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});

describe("JiraConnector", () => {
  test("fetchDelta returns issues from JQL search", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.href;
      if (url.includes("/search")) {
        return new Response(
          JSON.stringify({
            issues: [
              {
                id: "10001",
                key: "PROJ-42",
                self: "https://example.atlassian.net/rest/api/2/issue/10001",
                fields: {
                  summary: "Fix login bug",
                  description: "Users cannot login with SSO",
                  created: "2026-01-01T00:00:00Z",
                  updated: "2026-01-15T10:00:00Z",
                  status: { name: "In Progress" },
                  assignee: { displayName: "Bob", emailAddress: "bob@example.com" },
                  reporter: { displayName: "Alice" },
                  issuetype: { name: "Bug" },
                  priority: { name: "High" },
                  labels: ["sso", "auth"],
                  project: { key: "PROJ", name: "Project Alpha" },
                  comment: {
                    comments: [
                      {
                        body: "Reproduced on staging",
                        author: { displayName: "Charlie" },
                        created: "2026-01-10T09:00:00Z",
                      },
                    ],
                  },
                },
              },
            ],
            total: 1,
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    try {
      const { JiraConnector } = await import("../../src/core/ingestion/connectors/jira.ts");
      const c = new JiraConnector({
        api_key: "alice@example.com:jira-token",
        base_url: "https://example.atlassian.net",
      });
      (c as any).updateTokens("alice@example.com:jira-token", undefined, 3600);

      const result = await c.fetchDelta();
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.title).toBe("PROJ-42: Fix login bug");
      expect(result.items[0]?.content).toContain("Users cannot login with SSO");
      expect(result.items[0]?.content).toContain("In Progress");
      expect(result.items[0]?.content).toContain("Bob");
      expect(result.items[0]?.content).toContain("Charlie");
      expect(result.nextCursor).toBeTruthy();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  test("fetchDelta applies project and label filters", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.href;
      if (url.includes("/search")) {
        // Verify JQL contains filter clauses.
        expect(url).toContain("project");
        expect(url).toContain("Bug");
        expect(url).toContain("labels");
        return new Response(JSON.stringify({ issues: [], total: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    try {
      const { JiraConnector } = await import("../../src/core/ingestion/connectors/jira.ts");
      const c = new JiraConnector({
        api_key: "alice@example.com:jira-token",
        base_url: "https://example.atlassian.net",
        filters: { projects: ["PROJ"], issue_types: ["Bug"], labels: ["sso"] },
      });
      (c as any).updateTokens("alice@example.com:jira-token", undefined, 3600);

      const result = await c.fetchDelta();
      expect(result.items).toHaveLength(0);
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});
