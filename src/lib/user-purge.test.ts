// @vitest-environment node
// purgeExpiredSoftDeletedUsers — the hard-delete purge must re-check legal
// holds with the SAME function admin/data-delete uses at the initial
// request, so a hold placed during the 30-day grace window still stops the
// irreversible delete. Regression tests for the 2026-09-24 audit: this cron
// path shipped with no legal-hold awareness and no tests at all.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/engine", () => ({ engineHeadersForBrain: (id: string) => ({ brain: id }) }));

const getOrgById = vi.fn();
vi.mock("@/lib/auth/store", () => ({ getOrgStore: () => ({ getById: getOrgById }) }));

import { purgeExpiredSoftDeletedUsers, type UserPurgeReport } from "./user-purge";

function fakePool(rows: Array<{ id: string; brain_id: string; org_id: string | null }>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes("FROM subsumio_users") && sql.includes("deletedAt")) return { rows };
    return { rows: [] };
  });
  return { pool: { query } as unknown as Pick<Pool, "query">, calls };
}

function report(): UserPurgeReport {
  return { failed: 0, errors: [], skippedHold: 0 };
}

beforeEach(() => vi.clearAllMocks());

describe("purgeExpiredSoftDeletedUsers", () => {
  it("hard-deletes an expired user when the firm has no legal hold", async () => {
    const { pool, calls } = fakePool([{ id: "u1", brain_id: "brain_a", org_id: null }]);
    const checkHolds = vi.fn().mockResolvedValue({ status: "clear" });
    const rep = report();

    const purged = await purgeExpiredSoftDeletedUsers(pool, rep, { checkHolds });

    expect(purged).toBe(1);
    expect(rep.skippedHold).toBe(0);
    expect(calls.some((c) => c.sql.includes("DELETE FROM subsumio_users"))).toBe(true);
  });

  it("skips (does not delete) a user whose firm has an active legal hold", async () => {
    const { pool, calls } = fakePool([{ id: "u1", brain_id: "brain_a", org_id: null }]);
    const checkHolds = vi.fn().mockResolvedValue({ status: "held", cases: ["legal/x"] });
    const rep = report();

    const purged = await purgeExpiredSoftDeletedUsers(pool, rep, { checkHolds });

    expect(purged).toBe(0);
    expect(rep.skippedHold).toBe(1);
    expect(calls.some((c) => c.sql.includes("DELETE FROM subsumio_users"))).toBe(false);
  });

  it("fails closed: skips the purge when the hold status can't be determined", async () => {
    const { pool, calls } = fakePool([{ id: "u1", brain_id: "brain_a", org_id: null }]);
    const checkHolds = vi.fn().mockResolvedValue({ status: "unknown" });
    const rep = report();

    const purged = await purgeExpiredSoftDeletedUsers(pool, rep, { checkHolds });

    expect(purged).toBe(0);
    expect(rep.skippedHold).toBe(1);
    expect(calls.some((c) => c.sql.includes("DELETE FROM subsumio_users"))).toBe(false);
  });

  it("resolves the org's brain, not the user's stale personal brain, when the user belongs to an org", async () => {
    const { pool } = fakePool([{ id: "u1", brain_id: "brain_personal", org_id: "org_1" }]);
    const checkHolds = vi.fn().mockResolvedValue({ status: "clear" });
    const resolveBrainId = vi.fn(async (orgId: string | null) => `resolved-${orgId}`);
    const rep = report();

    await purgeExpiredSoftDeletedUsers(pool, rep, { checkHolds, resolveBrainId });

    expect(resolveBrainId).toHaveBeenCalledWith("org_1", "brain_personal");
    expect(checkHolds).toHaveBeenCalledWith({ brain: "resolved-org_1" });
  });

  it("checks each distinct firm's hold status only once per run", async () => {
    const { pool } = fakePool([
      { id: "u1", brain_id: "brain_a", org_id: null },
      { id: "u2", brain_id: "brain_a", org_id: null },
      { id: "u3", brain_id: "brain_b", org_id: null },
    ]);
    const checkHolds = vi.fn().mockResolvedValue({ status: "clear" });
    const rep = report();

    const purged = await purgeExpiredSoftDeletedUsers(pool, rep, { checkHolds });

    expect(purged).toBe(3);
    expect(checkHolds).toHaveBeenCalledTimes(2); // brain_a once, brain_b once
  });

  it("records a failure without stopping the rest of the batch", async () => {
    let call = 0;
    const failingPool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM subsumio_users") && sql.includes("deletedAt")) {
          return {
            rows: [
              { id: "u1", brain_id: "brain_a", org_id: null },
              { id: "u2", brain_id: "brain_a", org_id: null },
            ],
          };
        }
        if (sql.includes("DELETE FROM subsumio_users")) {
          call++;
          if (params?.[0] === "u1") throw new Error("constraint violation");
          return { rows: [] };
        }
        return { rows: [] };
      }),
    } as unknown as Pick<Pool, "query">;
    const checkHolds = vi.fn().mockResolvedValue({ status: "clear" });
    const rep = report();

    const purged = await purgeExpiredSoftDeletedUsers(failingPool, rep, { checkHolds });

    expect(purged).toBe(1); // only u2
    expect(rep.failed).toBe(1);
    expect(rep.errors[0]).toContain("u1");
    expect(call).toBe(2);
  });
});
