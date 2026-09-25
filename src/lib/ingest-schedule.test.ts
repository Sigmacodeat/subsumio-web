import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The server stack fires cron jobs through supercronic from
 * server/deploy/netcup/crontab — that file is the scheduler of record
 * (see docs/deploy/CRON_SCHEDULE.md). These tests pin that the document
 * ingest recovery workers stay scheduled there.
 */
function crontabPaths(): string[] {
  const raw = readFileSync(resolve(process.cwd(), "server/deploy/netcup/crontab"), "utf8");
  const paths: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    for (const m of trimmed.matchAll(/(\/api\/(?:cron|billing)\/[A-Za-z0-9_/-]+)/g)) {
      paths.push(m[1]);
    }
  }
  return paths;
}

describe("document ingest recovery schedules", () => {
  const paths = crontabPaths();

  it.each([
    "/api/cron/post-upload-drain",
    "/api/cron/upload-reconcile",
    "/api/cron/upload-multipart-cleanup",
    "/api/cron/queue-alert",
    "/api/cron/analysis-retry",
  ])("deploys the required recovery worker %s", (path) => {
    expect(paths).toContain(path);
  });

  it("does not schedule a cron path twice", () => {
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("schedules every cron route that exists in the app", () => {
    const dir = resolve(process.cwd(), "src/app/api/cron");
    const routes = readdirSync(dir).filter((d) => statSync(resolve(dir, d)).isDirectory());
    // Deliberately unscheduled (decision pending, see docs/deploy/CRON_SCHEDULE.md).
    // case-scanner: on demand only (product decision) — the route answers 410.
    const allowedUnscheduled = new Set(["time-tracking", "case-scanner"]);
    const missing = routes.filter(
      (r) => !allowedUnscheduled.has(r) && !paths.some((p) => p.startsWith(`/api/cron/${r}`))
    );
    expect(missing).toEqual([]);
  });
});
