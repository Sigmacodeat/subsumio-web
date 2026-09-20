import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The server crontab (server/deploy/hetzner/crontab) calls every job with
// `curl -fsS … || true`: a plain GET, and a failure is swallowed. A route that
// only exports POST therefore never runs in production, silently. This guard
// keeps every scheduled path callable the way the crontab calls it.
const root = process.cwd();
const crontab = readFileSync(join(root, "server/deploy/hetzner/crontab"), "utf8");

// Scheduled in the crontab but POST-only, so they have never run on the
// server. Both act on their own (drafts, client updates, follow-ups) and spend
// AI budget; switching them on is an owner decision, tracked in
// docs/AUDIT_KI_COPILOT_2026-09-18.md. Remove an entry once that is decided.
//
// deadline-alerts was on this list until 2026-09-20: it read the "system"
// brain (finding no firm's deadlines) and had no dedup, so every 30-minute run
// would have resent the same deadline.critical webhook. Both are fixed — it
// walks each firm's own brain and records every stage on the deadline — so it
// is scheduled with -X POST now and this guard checks it like any other job.
const NOT_YET_ENABLED = new Set(["/api/cron/autonomous-engine", "/api/cron/autopilot"]);

const calls = crontab
  .split("\n")
  .filter((line) => line.trim() && !line.trim().startsWith("#"))
  .flatMap((line) => {
    const m = line.match(/http:\/\/web:3000(\/api\/[^\s"'|]+)/);
    if (!m) return [];
    const method = /-X\s*POST|--request\s+POST|-d\s|--data/.test(line) ? "POST" : "GET";
    return [{ path: m[1].split("?")[0], method }];
  })
  .filter((c) => !NOT_YET_ENABLED.has(c.path));

describe("crontab → route methods", () => {
  it("finds the scheduled jobs", () => {
    expect(calls.length).toBeGreaterThan(20);
  });

  it.each(calls)("$method $path is exported", ({ path, method }) => {
    const file = join(root, "src/app", path, "route.ts");
    expect(existsSync(file), `${file} missing`).toBe(true);
    const src = readFileSync(file, "utf8");
    const exported = new RegExp(
      `export (const ${method}\\b|async function ${method}\\b|function ${method}\\b|\\{[^}]*\\b${method}\\b[^}]*\\})`
    );
    expect(exported.test(src), `${path} does not export ${method}`).toBe(true);
  });
});
