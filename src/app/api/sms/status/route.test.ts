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

const seenKeys = new Set<string>();
vi.mock("@/lib/caselaw-dedup", () => ({
  filterNewIds: vi.fn(async (_b: string, _ns: string, ids: string[]) => {
    const fresh = new Set<number>();
    ids.forEach((id, i) => {
      if (!seenKeys.has(id)) {
        seenKeys.add(id);
        fresh.add(i);
      }
    });
    return fresh;
  }),
}));

import type { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { logAudit } from "@/lib/audit";

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

function twilioCallback(params: Record<string, string>): NextRequest {
  const body = new URLSearchParams(params).toString();
  return new Request("https://app.example.com/api/sms/status", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "sig",
    },
    body,
  }) as unknown as NextRequest;
}

describe("POST /api/sms/status — Replay-Dedup", () => {
  beforeEach(() => {
    seenKeys.clear();
    vi.mocked(logAudit).mockClear();
  });

  const base = {
    MessageSid: "SM001",
    MessageStatus: "delivered",
    To: "+436641234567",
  };

  // Der gemockte createWebhookHandler gibt den inneren Handler zurück:
  // Signatur (body, req) — body ist hier undefined, req trägt das Formular.
  async function post(params: Record<string, string>): Promise<Response> {
    const handler = POST as unknown as (b: unknown, r: NextRequest) => Promise<Response>;
    return handler(undefined, twilioCallback(params));
  }

  test("identischer Callback (sid+status) wird nur einmal auditiert", async () => {
    const first = await post(base);
    expect(first.status).toBe(200);
    expect(vi.mocked(logAudit)).toHaveBeenCalledTimes(1);

    const replay = await post(base);
    expect(replay.status).toBe(200);
    expect((await replay.json()).deduped).toBe(true);
    expect(vi.mocked(logAudit)).toHaveBeenCalledTimes(1); // kein zweiter Eintrag
  });

  test("Status-Progression gleicher Sid wird NICHT gededupt", async () => {
    await post({ ...base, MessageStatus: "queued" });
    await post({ ...base, MessageStatus: "sent" });
    await post(base); // delivered
    expect(vi.mocked(logAudit)).toHaveBeenCalledTimes(3);
  });
});
