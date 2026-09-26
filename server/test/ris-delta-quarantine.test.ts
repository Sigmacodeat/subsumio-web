import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearFailure,
  isQuarantined,
  loadQuarantine,
  MAX_TRANSIENT_ATTEMPTS,
  recordFailure,
  saveQuarantine,
  type Quarantine,
} from "../scripts/ris-delta-quarantine.ts";
import { nextCursorAfterBatch } from "../scripts/ris-delta.ts";

const doc = { id: "NOR40000001", applikation: "BrKons", changedAt: "2026-09-20" };

describe("RIS delta quarantine", () => {
  test("a permanent failure (no XML URL) is quarantined at once and frees the cursor", () => {
    const q: Quarantine = {};
    const failedChangedAt: string[] = [];
    if (!recordFailure(q, doc, { permanent: true, reason: "keine XML-URL" }))
      failedChangedAt.push(doc.changedAt);
    expect(isQuarantined(q, doc)).toBe(true);
    expect(nextCursorAfterBatch({ newCursor: "2026-09-25", complete: true, failedChangedAt })).toBe(
      "2026-09-25"
    );
  });

  test("the next run skips it; a newer RIS change releases it", () => {
    const q: Quarantine = {};
    recordFailure(q, doc, { permanent: true, reason: "x" });
    expect(isQuarantined(q, doc)).toBe(true);
    expect(isQuarantined(q, { ...doc, changedAt: "2026-09-24" })).toBe(false);
  });

  test("transient failures hold the cursor until the attempt limit, then quarantine", () => {
    const q: Quarantine = {};
    const transient = { permanent: false, reason: "HTTP 503" };
    for (let i = 1; i < MAX_TRANSIENT_ATTEMPTS; i++) {
      expect(recordFailure(q, doc, transient)).toBe(false);
    }
    expect(recordFailure(q, doc, transient)).toBe(true);
    expect(q[doc.id]!.attempts).toBe(MAX_TRANSIENT_ATTEMPTS);
  });

  test("success clears the entry; the file round-trips", () => {
    const dir = mkdtempSync(join(tmpdir(), "q-"));
    try {
      const path = join(dir, "_state", "ris-delta-quarantine.json");
      const q: Quarantine = {};
      recordFailure(q, doc, { permanent: true, reason: "x" });
      saveQuarantine(path, q);
      const loaded = loadQuarantine(path);
      expect(isQuarantined(loaded, doc)).toBe(true);
      clearFailure(loaded, doc.id);
      expect(loaded[doc.id]).toBeUndefined();
      expect(loadQuarantine(join(dir, "missing.json"))).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
