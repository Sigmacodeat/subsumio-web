import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forwardAlert } from "../scripts/pipeline-alert.ts";
import { deltaExitCode } from "../scripts/ris-delta-watcher.ts";
import { deltaOutcome, parseDeltaSummary } from "../scripts/corpus-pipeline.ts";

let dir = "";
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

function recorder() {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const alert = {
  source: "ris-delta",
  type: "delta_sync_failed",
  severity: "error",
  message: "RIS Delta-Sync fehlgeschlagen",
};

describe("forwardAlert", () => {
  test("an error alert reaches the webhook and the ops mailbox", async () => {
    dir = mkdtempSync(join(tmpdir(), "alert-"));
    const { calls, fetchImpl } = recorder();
    const out = await forwardAlert(alert, {
      env: {
        ALERT_WEBHOOK: "https://hook.test/x",
        RESEND_API_KEY: "k",
        QUEUE_ALERT_EMAIL: "ops@example.test",
      },
      fetchImpl,
      stateDir: dir,
    });
    expect(out).toEqual({ webhook: true, mail: true });
    expect(calls.map((c) => c.url)).toEqual([
      "https://hook.test/x",
      "https://api.resend.com/emails",
    ]);
    expect(calls[1]!.body.to).toBe("ops@example.test");
  });

  test("the mail is throttled per source+type; warnings are not mailed", async () => {
    dir = mkdtempSync(join(tmpdir(), "alert-"));
    const { calls, fetchImpl } = recorder();
    const env = { RESEND_API_KEY: "k", QUEUE_ALERT_EMAIL: "ops@example.test" };
    await forwardAlert(alert, { env, fetchImpl, stateDir: dir, now: 1_000_000 });
    await forwardAlert(alert, { env, fetchImpl, stateDir: dir, now: 1_000_000 + 60_000 });
    await forwardAlert(
      { ...alert, severity: "warning", type: "delta_gap" },
      { env, fetchImpl, stateDir: dir }
    );
    expect(calls).toHaveLength(1);
    await forwardAlert(alert, { env, fetchImpl, stateDir: dir, now: 1_000_000 + 7 * 3600_000 });
    expect(calls).toHaveLength(2);
  });

  test("never throws when the channel is down", async () => {
    dir = mkdtempSync(join(tmpdir(), "alert-"));
    const fetchImpl = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const out = await forwardAlert(alert, {
      env: {
        ALERT_WEBHOOK: "https://hook.test",
        RESEND_API_KEY: "k",
        QUEUE_ALERT_EMAIL: "o@example.test",
      },
      fetchImpl,
      stateDir: dir,
    });
    expect(out).toEqual({ webhook: false, mail: false });
  });
});

describe("deltaExitCode", () => {
  const ok = { complete: true, documents: [1], written: 1, failed: 0 };
  test("an application error fails the run (also in --once mode)", () => {
    expect(deltaExitCode({ errors: ["BrKons: HTTP 503"], results: [] })).toBe(1);
  });
  test("an incomplete fetch or an all-failed batch fails the run", () => {
    expect(
      deltaExitCode({ errors: [], results: [{ ...ok, complete: false, documents: [] }] })
    ).toBe(1);
    expect(deltaExitCode({ errors: [], results: [{ ...ok, written: 0, failed: 1 }] })).toBe(1);
  });
  test("a clean run exits 0", () => {
    expect(deltaExitCode({ errors: [], results: [ok, { ...ok, documents: [], written: 0 }] })).toBe(
      0
    );
  });
});

describe("deltaOutcome", () => {
  const summary = parseDeltaSummary(
    "summary: 3 neu, 2 geändert, 0 fehlgeschlagen, applikationen: BrKons,Vwgh"
  );
  test("parses the watcher summary including every application", () => {
    expect(summary).toEqual({
      newCount: 3,
      changedCount: 2,
      failedCount: 0,
      applikationen: ["BrKons", "Vwgh"],
    });
  });
  test("exit 1 produces a failure notification and an error alert", () => {
    const o = deltaOutcome(1, summary, "2026-09-26");
    expect(o.ok).toBe(false);
    expect(String(o.notification.title)).toContain("fehlgeschlagen");
    expect(o.alert).toEqual(
      expect.objectContaining({ type: "delta_sync_failed", severity: "error" })
    );
  });
  test("a missing exit code is a failure, never success", () => {
    expect(deltaOutcome(null, summary, "2026-09-26").ok).toBe(false);
  });
  test("exit 0 is a success notification without alert", () => {
    const o = deltaOutcome(0, summary, "2026-09-26");
    expect(o.alert).toBeNull();
    expect(o.notification.total).toBe(5);
  });
});
