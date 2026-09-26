// @vitest-environment node
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/auth/session-core", () => ({ getAuthSecret: () => "test-auth-secret-0123456789" }));

const handlerOpts = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
const ctx = vi.hoisted(() => ({
  headers: { "x-subsumio-source": "b1" },
  brainId: "brain-1",
  user: { id: "u-admin", email: "admin@test", role: "admin" },
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: Record<string, unknown>,
    handler: (c: unknown, body: unknown, query: unknown) => Promise<Response>
  ) => {
    handlerOpts.value = opts;
    return async (req: Request) =>
      handler(ctx, undefined, { token: new URL(req.url).searchParams.get("token") ?? "" });
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { GET } from "./route";
import { createFirmExportToken } from "@/lib/firm-export-link";

let engineStatus = 200;
let engineUrl = "";

beforeEach(() => {
  engineStatus = 200;
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    engineUrl = String(input);
    return engineStatus === 200
      ? new Response(new Uint8Array([0x50, 0x4b, 3, 4]), {
          status: 200,
          headers: {
            "content-type": "application/zip",
            "content-disposition": 'attachment; filename="kanzlei-export-2099-01-01.zip"',
            "x-export-sha256": "abc",
          },
        })
      : Response.json({ error: "x" }, { status: engineStatus });
  }) as unknown as typeof fetch;
});

function call(token: string) {
  return GET(
    new Request(
      `http://x/api/data-export/full/download?token=${encodeURIComponent(token)}`
    ) as unknown as NextRequest
  );
}

describe("GET /api/data-export/full/download", () => {
  it("records the download in the audit trail", () => {
    const audit = (handlerOpts.value!.audit as (c: unknown) => Record<string, unknown>)({
      brainId: "brain-1",
      __exportId: 3,
    });
    expect(audit).toMatchObject({
      action: "admin.data_export_download",
      entityId: "brain-1",
      details: { scope: "full_export", exportId: 3 },
    });
  });

  it("streams the archive of the export the link names", async () => {
    const { token } = createFirmExportToken({ userId: "u-admin", brainId: "brain-1", exportId: 3 });
    const res = await call(token);
    expect(res.status).toBe(200);
    expect(engineUrl).toBe("http://engine.test/api/firm-export/3/download");
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await res.arrayBuffer())[0]).toBe(0x50);
  });

  it("refuses a link issued to someone else", async () => {
    const { token } = createFirmExportToken({ userId: "u-other", brainId: "brain-1", exportId: 3 });
    expect((await call(token)).status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("answers 410 for an expired link and for an export already downloaded", async () => {
    const expired = createFirmExportToken(
      { userId: "u-admin", brainId: "brain-1", exportId: 3 },
      Date.now() - 25 * 3_600_000
    );
    expect((await call(expired.token)).status).toBe(410);
    const { token } = createFirmExportToken({ userId: "u-admin", brainId: "brain-1", exportId: 3 });
    engineStatus = 410;
    expect((await call(token)).status).toBe(410);
  });
});
