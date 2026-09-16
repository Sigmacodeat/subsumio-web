/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: Array<{ sql: string; params: unknown[] }> = [];
vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => ({
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  }),
}));

import { persistNotificationUpsert } from "./comments";

describe("persistNotificationUpsert (Postgres path)", () => {
  beforeEach(() => {
    queries.length = 0;
  });

  it("upserts on the full primary key (id, user_id, brain_id)", async () => {
    await persistNotificationUpsert({
      id: "n1",
      userId: "u1",
      brainId: "brain_a",
      type: "system",
      data: { title: "x" },
      readAt: null,
      createdAt: new Date().toISOString(),
    } as any);
    const upsert = queries.find((q) => q.sql.includes("INSERT INTO subsumio_notifications"));
    expect(upsert).toBeDefined();
    // The table's PK is (id, user_id, brain_id); "ON CONFLICT (id)" made
    // Postgres reject every upsert ("no unique or exclusion constraint").
    expect(upsert!.sql).toMatch(/ON CONFLICT \(id, user_id, brain_id\)/);
  });
});
