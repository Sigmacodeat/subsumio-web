import { describe, expect, it, vi } from "vitest";

const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => ({ query }),
}));

import { setSpendCap } from "./credits";

function placeholders(sql: string): number[] {
  return [...new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

describe("setSpendCap", () => {
  it("binds every SQL placeholder to exactly one parameter", async () => {
    await setSpendCap("org_1", "org", 500, "monthly");

    const update = query.mock.calls.find(([sql]) => sql.includes("SET credit_limit"));
    expect(update).toBeDefined();
    const [sql, params = []] = update!;
    expect(placeholders(sql)).toEqual(params.map((_, i) => i + 1));
    expect(params).toEqual(["org_1", 500, "monthly"]);
  });
});
