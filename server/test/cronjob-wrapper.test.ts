/**
 * server/deploy/netcup/cronjob.sh with a stubbed curl:
 *   - a failing job exits non-zero and mails the alert address once per
 *     interval (not on every run);
 *   - a successful job pings its heartbeat URL and clears the alert state;
 *   - the crontab runs every job through the wrapper, none with `|| true`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NETCUP = join(import.meta.dir, "..", "deploy", "netcup");
const WRAPPER = join(NETCUP, "cronjob.sh");
let root = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "cronjob-test-"));
  const curl = join(root, "curl");
  writeFileSync(
    curl,
    `#!/bin/sh
for a in "$@"; do
  case "$a" in
    *api.resend.com*) echo "mail $*" >> "$LOG"; exit 0 ;;
    *hc.example*) echo "ping $a" >> "$LOG"; exit 0 ;;
  esac
done
echo "job $*" >> "$LOG"
if [ "\${JOB_EXIT:-0}" != 0 ]; then
  echo "curl: (22) The requested URL returned error: 503" >&2
  exit "$JOB_EXIT"
fi
echo '{"ok":true}'
`
  );
  chmodSync(curl, 0o755);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

function run(name: string, env: Record<string, string>, ...args: string[]) {
  const log = join(root, `log-${Math.random().toString(36).slice(2)}`);
  writeFileSync(log, "");
  const res = spawnSync("sh", [WRAPPER, name, ...args], {
    encoding: "utf8",
    env: {
      PATH: `${root}:/usr/bin:/bin`,
      LOG: log,
      CRON_SECRET: "test-secret",
      CRON_ALERT_STATE_DIR: join(root, "state"),
      ...env,
    },
  });
  return {
    status: res.status,
    stderr: res.stderr,
    calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean),
  };
}

const ALERT_ENV = { RESEND_API_KEY: "re_test", QUEUE_ALERT_EMAIL: "ops@example.invalid" };

describe("cronjob.sh", () => {
  test("a failing job exits non-zero and alerts once per interval", () => {
    const first = run("dunning-run", { ...ALERT_ENV, JOB_EXIT: "22" }, "/api/cron/dunning-run");
    expect(first.status).toBe(22);
    expect(first.stderr).toContain("[cron] FAILED dunning-run");
    expect(first.calls.filter((c) => c.startsWith("mail"))).toHaveLength(1);
    expect(first.calls.find((c) => c.startsWith("mail"))).not.toContain("test-secret");

    const second = run("dunning-run", { ...ALERT_ENV, JOB_EXIT: "22" }, "/api/cron/dunning-run");
    expect(second.status).toBe(22);
    expect(second.calls.filter((c) => c.startsWith("mail"))).toHaveLength(0);
  });

  test("the alert repeats once the interval has passed", () => {
    run("imap-sync", { ...ALERT_ENV, JOB_EXIT: "22" }, "/api/cron/imap-sync");
    const again = run(
      "imap-sync",
      { ...ALERT_ENV, JOB_EXIT: "22", CRON_ALERT_INTERVAL_SECONDS: "0" },
      "/api/cron/imap-sync"
    );
    expect(again.calls.filter((c) => c.startsWith("mail"))).toHaveLength(1);
  });

  test("success pings the job's heartbeat and passes extra curl options", () => {
    const res = run(
      "deadline-alerts",
      { CRON_HEARTBEAT_URL_DEADLINE_ALERTS: "https://hc.example/abc" },
      "/api/cron/deadline-alerts",
      "--max-time",
      "300",
      "-X",
      "POST"
    );
    expect(res.status).toBe(0);
    const job = res.calls.find((c) => c.startsWith("job"))!;
    expect(job).toContain("-X POST");
    expect(job).toContain("http://web:3000/api/cron/deadline-alerts");
    expect(job).toContain("Authorization: Bearer test-secret");
    expect(res.calls).toContain("ping https://hc.example/abc");
  });

  test("success clears the alert state, so the next failure alerts immediately", () => {
    run("health", { ...ALERT_ENV, JOB_EXIT: "22" }, "/api/cron/health");
    expect(existsSync(join(root, "state", "HEALTH"))).toBe(true);
    run("health", {}, "/api/cron/health");
    expect(existsSync(join(root, "state", "HEALTH"))).toBe(false);
    const res = run("health", { ...ALERT_ENV, JOB_EXIT: "22" }, "/api/cron/health");
    expect(res.calls.filter((c) => c.startsWith("mail"))).toHaveLength(1);
  });
});

describe("crontab", () => {
  const jobs = readFileSync(join(NETCUP, "crontab"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"));

  test("every job runs through the wrapper, none is silenced", () => {
    expect(jobs.length).toBeGreaterThan(40);
    for (const line of jobs) {
      expect(line).toMatch(
        /^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+sh \/etc\/cronjob\.sh [a-z0-9-]+ \/api\/\S+/
      );
      expect(line).not.toContain("|| true");
    }
  });

  test("the cron service mounts the wrapper and gets the alert channel", () => {
    const compose = readFileSync(join(NETCUP, "docker-compose.yml"), "utf8");
    expect(compose).toContain("./cronjob.sh:/etc/cronjob.sh:ro");
    const envExample = readFileSync(join(NETCUP, ".env.example"), "utf8");
    for (const m of compose.matchAll(/(CRON_HEARTBEAT_URL_[A-Z_]+):/g)) {
      expect(envExample).toContain(`${m[1]}=`);
    }
    expect(envExample).toContain("QUEUE_ALERT_EMAIL=");
  });
});
