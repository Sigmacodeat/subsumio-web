// @vitest-environment node
//
// The daily delta trigger must fail (5xx) while the last delta run is
// marked failed, so the cron wrapper alarms instead of pinging the heartbeat.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  failedRows: [] as Array<{ message: string }>,
  sql: [] as string[],
}));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => ({
    query: async (sql: string) => {
      db.sql.push(sql);
      return { rows: /delta_sync_failed/.test(sql) ? db.failedRows : [] };
    },
  }),
}));

import { GET } from "./route";

const run = () =>
  (GET as unknown as (r: NextRequest) => Promise<Response>)(
    new NextRequest("http://localhost/api/cron/ris-delta-watcher")
  );

beforeEach(() => {
  db.failedRows = [];
  db.sql = [];
});

describe("GET /api/cron/ris-delta-watcher", () => {
  it("sets the trigger and answers 200 when the last run succeeded", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(db.sql.some((s) => s.includes("delta_sync_triggered"))).toBe(true);
  });

  it("still sets the trigger but answers 500 while the last run is marked failed", async () => {
    db.failedRows = [{ message: "RIS Delta-Sync fehlgeschlagen (Exit 1)" }];
    const res = await run();
    expect(res.status).toBe(500);
    expect(((await res.json()) as { code: string }).code).toBe("delta_sync_failed");
    expect(db.sql.some((s) => s.includes("delta_sync_triggered"))).toBe(true);
  });
});
