// @vitest-environment node
//
// A detected integrity mismatch must make the cron run fail (5xx), so the
// cron wrapper alarms instead of reporting success.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/env", () => ({ env: () => undefined }));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import { GET } from "./route";

const engineResult = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(engineResult.value))
  );
});

const run = () =>
  (GET as unknown as (r: NextRequest) => Promise<Response>)(
    new NextRequest("http://localhost/api/cron/integrity-recheck")
  );

describe("GET /api/cron/integrity-recheck", () => {
  it("answers 200 when every checked file matches", async () => {
    engineResult.value = { checked: 50, mismatches: 0 };
    expect((await run()).status).toBe(200);
  });

  it("answers 5xx when a mismatch was found", async () => {
    engineResult.value = {
      checked: 50,
      mismatches: 1,
      mismatch_details: [
        { filename: "a.pdf", storage_path: "clean/a", expected: "x", actual: "y" },
      ],
    };
    const res = await run();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(((await res.json()) as { mismatches: number }).mismatches).toBe(1);
  });
});
