// @vitest-environment node
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/auth/session-core", () => ({ getAuthSecret: () => "test-auth-secret-0123456789" }));
const notify = vi.hoisted(() => vi.fn(async (_opts: Record<string, unknown>) => undefined));
vi.mock("@/lib/comments", () => ({ createFirmExportReadyNotification: notify }));

const handlerOpts = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: Record<string, unknown>,
    handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
  ) => {
    handlerOpts.list.push(opts);
    return async () =>
      handler(
        {
          headers: { "x-subsumio-source": "b1" },
          brainId: "brain-1",
          user: { id: "u-admin", email: "admin@test", role: "admin" },
        },
        undefined,
        {}
      );
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown, _meta?: unknown, status = 200) => Response.json({ data }, { status }),
}));

import { GET, POST } from "./route";
import { verifyFirmExportToken } from "@/lib/firm-export-link";

let engineCalls: Array<{ url: string; init?: RequestInit }>;
let engineReply: () => Response;

beforeEach(() => {
  engineCalls = [];
  notify.mockClear();
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    engineCalls.push({ url: String(input), init });
    return engineReply();
  }) as unknown as typeof fetch;
});

const req = () => new Request("http://x/api/data-export/full") as unknown as NextRequest;

describe("POST /api/data-export/full", () => {
  it("is admin-only and audited as a data export", () => {
    const [postOpts, getOpts] = handlerOpts.list;
    expect(postOpts.action).toBe("admin.data_export");
    expect(getOpts.action).toBe("admin.data_export");
    const audit = (postOpts.audit as (ctx: unknown) => Record<string, unknown>)({
      brainId: "brain-1",
    });
    expect(audit).toMatchObject({ action: "admin.data_export", entityId: "brain-1" });
  });

  it("starts the engine job for this firm", async () => {
    engineReply = () => Response.json({ id: 5, state: "queued", own: true, existing: false });
    const res = await POST(req());
    expect(res.status).toBe(202);
    expect(engineCalls[0].url).toBe("http://engine.test/api/firm-export");
    expect(engineCalls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(engineCalls[0].init?.body))).toEqual({ web_brain_id: "brain-1" });
    expect(((await res.json()) as { data: { export: { id: number } } }).data.export.id).toBe(5);
  });

  it("passes the engine's refusal of a non-admin through as 403", async () => {
    engineReply = () => Response.json({ error: "admin_required" }, { status: 403 });
    expect((await POST(req())).status).toBe(403);
  });
});

describe("GET /api/data-export/full", () => {
  it("gives only the requester's ready export a signed link, and announces it", async () => {
    const expires = new Date(Date.now() + 3_600_000).toISOString();
    engineReply = () =>
      Response.json({
        exports: [
          {
            id: 9,
            state: "ready",
            own: true,
            expires_at: expires,
            complete: true,
            progress: {},
          },
          { id: 8, state: "ready", own: false, expires_at: expires, progress: {} },
          { id: 7, state: "running", own: true, progress: { pages_done: 3 } },
        ],
      });
    const res = await GET(req());
    const body = (await res.json()) as {
      data: { exports: Array<{ id: number; download_url?: string }> };
    };
    const [own, other, running] = body.data.exports;
    expect(other.download_url).toBeUndefined();
    expect(running.download_url).toBeUndefined();
    const token = new URL(own.download_url!, "http://x").searchParams.get("token");
    expect(verifyFirmExportToken(token, { userId: "u-admin", brainId: "brain-1" })).toEqual({
      ok: true,
      exportId: 9,
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ exportId: 9, userId: "u-admin" });
  });

  it("reports an unreachable engine instead of an empty list", async () => {
    engineReply = () => {
      throw new Error("down");
    };
    expect((await GET(req())).status).toBe(503);
  });
});
