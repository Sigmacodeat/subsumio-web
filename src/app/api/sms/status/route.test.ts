// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const auditEntries: Array<{
  action: string;
  timestamp: string;
  details?: Record<string, unknown>;
}> = [];

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => undefined),
  listAuditLogs: vi.fn(async () => auditEntries),
}));

vi.mock("@/lib/api-handler", () => ({
  createWebhookHandler: (_opts: unknown, handler: unknown) => handler,
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, query: unknown) => Promise<unknown>
  ) => {
    return async (req: Request) => {
      const ctx = { brainId: "test-brain", user: { email: "t@t.com" } };
      const url = new URL(req.url);
      const query = Object.fromEntries(url.searchParams);
      return handler(ctx, null, query);
    };
  },
}));

vi.mock("@/lib/sms/twilio-verify", () => ({ verifyTwilioSignature: () => true }));
vi.mock("@/lib/env", () => ({ env: () => "token" }));

import type { NextRequest } from "next/server";
import { GET } from "./route";

function req(url: string) {
  return new Request(url) as unknown as NextRequest;
}

function hash(phone: string) {
  return createHash("sha256").update(phone).digest("hex");
}

describe("GET /api/sms/status", () => {
  beforeEach(() => auditEntries.splice(0));

  test("liefert nur Einträge der angefragten Nummer", async () => {
    auditEntries.push(
      {
        action: "sms.delivery_status",
        timestamp: "2026-09-23T10:00:00Z",
        details: { toHash: hash("+436641234567"), status: "delivered", errorCode: null },
      },
      {
        action: "sms.delivery_status",
        timestamp: "2026-09-23T09:00:00Z",
        details: { toHash: hash("+431999999"), status: "failed", errorCode: "30034" },
      }
    );
    const res = (await GET(
      req("http://localhost/api/sms/status?phone=%2B436641234567")
    )) as Response;
    const { deliveries } = await res.json();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe("delivered");
  });

  test("leere Liste wenn keine Einträge", async () => {
    const res = (await GET(
      req("http://localhost/api/sms/status?phone=%2B436641234567")
    )) as Response;
    const { deliveries } = await res.json();
    expect(deliveries).toEqual([]);
  });
});
