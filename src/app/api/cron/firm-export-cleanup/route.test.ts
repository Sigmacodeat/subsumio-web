// @vitest-environment node
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/env", () => ({ env: () => "api-key" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
const notify = vi.hoisted(() => vi.fn(async (_opts: Record<string, unknown>) => undefined));
vi.mock("@/lib/comments", () => ({ createFirmExportReadyNotification: notify }));
vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (handler: (req: NextRequest) => Promise<Response>) => handler,
}));

import { GET } from "./route";

let calls: Array<{ url: string; init?: RequestInit }>;

beforeEach(() => {
  calls = [];
  notify.mockClear();
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Response.json({
      deleted: 2,
      finished: [
        {
          id: 4,
          user_id: "u-admin",
          web_brain_id: "brain-1",
          expires_at: "2099-01-02T00:00:00.000Z",
          complete: true,
        },
        { id: 5, user_id: null, web_brain_id: null, expires_at: null, complete: false },
      ],
    });
  }) as unknown as typeof fetch;
});

describe("GET /api/cron/firm-export-cleanup", () => {
  it("runs the engine sweep without a user identity and notifies each finished export", async () => {
    const res = await GET(new Request("http://x") as unknown as NextRequest);
    expect(calls[0].url).toBe("http://engine.test/api/firm-export/sweep");
    expect(calls[0].init?.method).toBe("POST");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["x-subsumio-identity-token"]).toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      userId: "u-admin",
      brainId: "brain-1",
      exportId: 4,
    });
    expect(await res.json()).toEqual({ deleted: 2, notified: 1 });
  });

  it("fails loudly when the sweep fails", async () => {
    global.fetch = vi.fn(
      async () => new Response("boom", { status: 500 })
    ) as unknown as typeof fetch;
    await expect(GET(new Request("http://x") as unknown as NextRequest)).rejects.toThrow();
  });
});
