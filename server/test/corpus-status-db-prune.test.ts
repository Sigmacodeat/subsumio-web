import { describe, expect, test } from "bun:test";
import { pruneLawCompleteness } from "../scripts/corpus-status-db.ts";

describe("pruneLawCompleteness", () => {
  test("an empty keep-list is refused and deletes nothing", async () => {
    const calls: string[] = [];
    const engine = {
      executeRaw: async (sql: string) => {
        calls.push(sql);
        return [];
      },
    };
    await expect(pruneLawCompleteness(engine as any, "law-at-normen", [])).rejects.toThrow(/leer/);
    expect(calls.some((s) => /DELETE/i.test(s))).toBe(false);
  });
});
