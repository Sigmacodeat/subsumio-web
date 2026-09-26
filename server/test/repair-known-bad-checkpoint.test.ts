/**
 * The known-bad repair must not stop early: v1 declared itself done when its
 * id counter reached the size of the SHRINKING known-bad set and left
 * 25,327 Landesrecht pages untouched (2026-09-26).
 */
import { describe, expect, test } from "bun:test";
import {
  duePending,
  MAX_ATTEMPTS,
  repairDone,
  RETRY_AFTER_MS,
} from "../scripts/repair-known-bad-checkpoint.ts";

const rows = (...ids: string[]) => ids.map((doc_id) => ({ doc_id }));
const now = Date.parse("2026-09-26T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("repair checkpoint", () => {
  test("untouched pages stay pending however many others were processed", () => {
    // 3 attempted ids already left the set; 2 never touched remain.
    const attempts = {
      A: { n: 1, at: ago(1000), ok: true },
      B: { n: 1, at: ago(1000), ok: true },
      C: { n: 1, at: ago(1000), ok: true },
    };
    expect(duePending(rows("D", "E"), attempts, now).map((r) => r.doc_id)).toEqual(["D", "E"]);
    expect(repairDone(rows("D", "E"), attempts)).toBe(false);
  });

  test("a page still known-bad after its attempt is retried later, then given up", () => {
    const fresh = { X: { n: 1, at: ago(1000), ok: false } };
    expect(duePending(rows("X"), fresh, now)).toHaveLength(0);
    const due = { X: { n: 1, at: ago(RETRY_AFTER_MS), ok: false } };
    expect(duePending(rows("X"), due, now)).toHaveLength(1);
    const spent = { X: { n: MAX_ATTEMPTS, at: ago(RETRY_AFTER_MS * 2), ok: false } };
    expect(duePending(rows("X"), spent, now)).toHaveLength(0);
    expect(repairDone(rows("X"), spent)).toBe(true);
  });

  test("done when the generation is gone from the DB", () => {
    expect(repairDone([], {})).toBe(true);
  });
});
