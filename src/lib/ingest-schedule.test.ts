import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("document ingest recovery schedules", () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const schedules = new Map((config.crons ?? []).map((entry) => [entry.path, entry.schedule]));

  it.each([
    "/api/cron/post-upload-drain",
    "/api/cron/upload-reconcile",
    "/api/cron/upload-multipart-cleanup",
    "/api/cron/queue-alert",
    "/api/cron/analysis-retry",
  ])("deploys the required recovery worker %s", (path) => {
    expect(schedules.get(path)).toBeTruthy();
  });

  it("does not declare duplicate cron paths", () => {
    const paths = (config.crons ?? []).map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
