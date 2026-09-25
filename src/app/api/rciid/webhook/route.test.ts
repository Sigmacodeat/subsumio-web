// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processed = new Set<string>();
vi.mock("@/lib/rciid", async (orig) => {
  const real = await orig<typeof import("@/lib/rciid")>();
  return {
    verifyWebhookSignature: real.verifyWebhookSignature,
    isWebhookProcessed: vi.fn(async (id: string) => processed.has(id)),
    markWebhookProcessed: vi.fn(async (id: string) => void processed.add(id)),
    isConfigured: () => false,
    resolveRciidCase: vi.fn(),
    fileReportToCase: vi.fn(),
  };
});
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), SYSTEM_BRAIN: "system" }));

import { POST } from "./route";

const SECRET = "rciid-test-secret";

function call(raw: string, signature?: string) {
  return POST(
    new Request("http://x/api/rciid/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "x-rciid-signature": signature } : {}),
      },
      body: raw,
    }) as never
  );
}

const sign = (raw: string) => createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");

beforeEach(() => {
  processed.clear();
  process.env.RCIID_WEBHOOK_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.RCIID_WEBHOOK_SECRET;
});

describe("POST /api/rciid/webhook", () => {
  it("without a configured secret the route is closed (503) and records nothing", async () => {
    delete process.env.RCIID_WEBHOOK_SECRET;
    const res = await call(JSON.stringify({ event_id: "e1" }));
    expect(res.status).toBe(503);
    expect(processed.size).toBe(0);
  });

  it("verifies the signature over the raw body, whatever its formatting", async () => {
    // Field order and whitespace differ from what JSON.stringify would produce.
    const raw = `{ "timestamp": "2026-09-25T10:00:00Z",  "status": "received", "event_type": "status_changed", "case_id": "c1", "event_id": "e1" }`;
    const res = await call(raw, sign(raw));
    expect(res.status).toBe(200);
    expect(processed.has("e1")).toBe(true);
  });

  it("an unsigned or wrongly signed event is rejected before it is marked processed", async () => {
    const raw = JSON.stringify({
      event_id: "e2",
      case_id: "c1",
      event_type: "status_changed",
      status: "received",
      timestamp: "2026-09-25T10:00:00Z",
    });
    expect((await call(raw)).status).toBe(401);
    expect((await call(raw, "0".repeat(64))).status).toBe(401);
    expect(processed.has("e2")).toBe(false);
  });
});
