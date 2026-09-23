// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

let auditEntries: Array<{
  action: string;
  timestamp: string;
  details?: Record<string, unknown>;
}> = [];

let userRole = "assistant";

vi.mock("@/lib/audit", () => ({
  listAuditLogs: vi.fn(async () => auditEntries),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, query: unknown) => Promise<unknown>
  ) => {
    return async (req: Request) => {
      const ctx = { brainId: "test-brain", user: { email: "t@t.com", role: userRole } };
      const url = new URL(req.url);
      const query = Object.fromEntries(url.searchParams);
      return handler(ctx, null, query);
    };
  },
}));

import type { NextRequest } from "next/server";
import { GET } from "./route";

function req(url: string) {
  return new Request(url) as unknown as NextRequest;
}

describe("GET /api/whatsapp/muted", () => {
  beforeEach(() => {
    auditEntries = [];
    userRole = "assistant";
  });

  test("count 0 und lastAt null ohne Einträge", async () => {
    const res = (await GET(req("http://localhost/api/whatsapp/muted"))) as Response;
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(body.lastAt).toBeNull();
  });

  test("zählt inbound_muted-Einträge und liefert letzten Zeitpunkt", async () => {
    auditEntries = [
      { action: "whatsapp.inbound_muted", timestamp: "2026-09-23T10:00:00Z" },
      { action: "whatsapp.inbound_muted", timestamp: "2026-09-22T09:00:00Z" },
    ];
    const res = (await GET(req("http://localhost/api/whatsapp/muted"))) as Response;
    const body = await res.json();
    expect(body.count).toBe(2);
    expect(body.lastAt).toBe("2026-09-23T10:00:00Z");
  });

  test("snippets nur für Admin-Rolle", async () => {
    auditEntries = [
      {
        action: "whatsapp.inbound_muted",
        timestamp: "2026-09-23T10:00:00Z",
        details: {
          messageType: "text",
          bodySnippet: "Kündigung zum …",
          phoneHash: "a1b2c3d4e5f6a1b2c3d4e5f6",
        },
      },
    ];

    userRole = "assistant";
    let res = (await GET(req("http://localhost/api/whatsapp/muted"))) as Response;
    let body = await res.json();
    expect(body.count).toBe(1);
    expect(body.snippets).toBeUndefined();

    userRole = "admin";
    res = (await GET(req("http://localhost/api/whatsapp/muted"))) as Response;
    body = await res.json();
    expect(body.snippets).toEqual([
      {
        at: "2026-09-23T10:00:00Z",
        type: "text",
        snippet: "Kündigung zum …",
        sender: "a1b2c3d4",
      },
    ]);
  });

  test("admin-snippets auf 5 Einträge begrenzt, fehlende Details → null", async () => {
    auditEntries = Array.from({ length: 7 }, (_, i) => ({
      action: "whatsapp.inbound_muted",
      timestamp: `2026-09-23T1${i}:00:00Z`,
      details: {},
    }));
    userRole = "admin";
    const res = (await GET(req("http://localhost/api/whatsapp/muted"))) as Response;
    const body = await res.json();
    expect(body.snippets).toHaveLength(5);
    expect(body.snippets[0]).toEqual({
      at: "2026-09-23T10:00:00Z",
      type: null,
      snippet: null,
      sender: null,
    });
  });
});
