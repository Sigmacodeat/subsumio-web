// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Tiny in-memory stand-in for subsumio_webhook_health. */
const db = vi.hoisted(() => ({
  rows: new Map<string, { failures: number; disabledAt: string | null }>(),
  pool: null as null | { query: (sql: string, p: unknown[]) => Promise<unknown> },
}));

vi.mock("@/lib/schema-init", () => ({ createSchemaInit: () => async () => {} }));
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => db.pool }));

import {
  getWebhookFailureStreaks,
  recordWebhookFinalFailure,
  releaseWebhookDisableClaim,
  resetWebhookFailures,
} from "./webhook-health";

function fakePool() {
  return {
    async query(sql: string, p: unknown[]) {
      const key = `${p[0]}|${p[1]}`;
      if (sql.includes("INSERT INTO subsumio_webhook_health")) {
        const r = db.rows.get(key) ?? { failures: 0, disabledAt: null };
        r.failures += 1;
        db.rows.set(key, r);
        return { rows: [{ consecutive_failures: r.failures }], rowCount: 1 };
      }
      if (sql.includes("SET disabled_at = now()")) {
        const r = db.rows.get(key);
        if (!r || r.disabledAt) return { rows: [], rowCount: 0 };
        r.disabledAt = "now";
        return { rows: [{ webhook_id: p[1] }], rowCount: 1 };
      }
      if (sql.includes("SET consecutive_failures = 0")) {
        const r = db.rows.get(key);
        if (r) Object.assign(r, { failures: 0, disabledAt: null });
        return { rows: [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes("SET disabled_at = NULL")) {
        const r = db.rows.get(key);
        if (r) r.disabledAt = null;
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT webhook_id")) {
        return {
          rows: [...db.rows.entries()]
            .filter(([k]) => k.startsWith(`${p[0]}|`))
            .map(([k, v]) => ({ webhook_id: k.split("|")[1], consecutive_failures: v.failures })),
        };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

beforeEach(() => {
  db.rows.clear();
  db.pool = fakePool();
});

describe("webhook health", () => {
  it("counts consecutive final failures and claims the switch-off exactly once", async () => {
    for (let i = 1; i < 3; i++) {
      expect(await recordWebhookFinalFailure("b", "w", "HTTP 503", 3)).toEqual({
        failures: i,
        disable: false,
      });
    }
    expect(await recordWebhookFinalFailure("b", "w", "HTTP 503", 3)).toEqual({
      failures: 3,
      disable: true,
    });
    // Further failures (a parallel run) do not claim it again.
    expect(await recordWebhookFinalFailure("b", "w", "HTTP 503", 3)).toEqual({
      failures: 4,
      disable: false,
    });
  });

  it("a success resets the streak", async () => {
    await recordWebhookFinalFailure("b", "w", "x", 3);
    await recordWebhookFinalFailure("b", "w", "x", 3);
    await resetWebhookFailures("b", "w");
    expect(await getWebhookFailureStreaks("b")).toEqual({ w: 0 });
    expect((await recordWebhookFinalFailure("b", "w", "x", 3))?.failures).toBe(1);
  });

  it("a released claim lets the next failure switch off again", async () => {
    for (let i = 0; i < 3; i++) await recordWebhookFinalFailure("b", "w", "x", 3);
    await releaseWebhookDisableClaim("b", "w");
    expect((await recordWebhookFinalFailure("b", "w", "x", 3))?.disable).toBe(true);
  });

  it("without a database nothing is counted", async () => {
    db.pool = null;
    expect(await recordWebhookFinalFailure("b", "w", "x")).toBeNull();
    expect(await getWebhookFailureStreaks("b")).toEqual({});
  });
});
