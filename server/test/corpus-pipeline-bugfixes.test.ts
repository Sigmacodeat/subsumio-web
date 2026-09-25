/**
 * Regression tests for three bugs found in the 2026-09-23 go-live corpus
 * audit (memory: korpus-pipeline-audit-2026-09-23):
 *
 * 1. `consecutiveImportFailures` used to be derived from `alert_flags`,
 *    whose `raiseAlert()` dedups by type (max one row per type ever) — so
 *    the retry cap (`MAX_IMPORT_ATTEMPTS = 5`) could never engage. It now
 *    counts the trailing `import`/`failed …` entries in `stage_history`.
 * 2. `judikaturImportArgv` must pass `--bulk` for every court, matching the
 *    DE/CH/EU judikatur imports — its absence let a full, expensive
 *    per-decision dedup/version/alias pass re-run on every pipeline cycle
 *    for corpora with 100k+ files, which is what drove jud-vwgh into a
 *    Postgres `statement_timeout` crash loop.
 *
 * `psqlJSON`'s auto-wrap fix (bug 3, same audit) isn't covered here — it
 * shells out to `psql` against a live DB and this file has no DB harness
 * precedent to piggyback on; it was verified by reasoning against psql's
 * `-t -A` output format and by reading every call site (see the function's
 * doc comment in corpus-pipeline.ts).
 */
import { describe, expect, it } from "bun:test";
import {
  consecutiveImportFailures,
  JUDIKATUR,
  judikaturImportArgv,
  parseFetchTrigger,
  type DBPipelineState,
} from "../scripts/corpus-pipeline.ts";

function historyOf(
  entries: Array<{ stage: string; action: string }>
): DBPipelineState["stage_history"] {
  return entries.map((e) => ({ ...e, ts: new Date().toISOString() }));
}

describe("consecutiveImportFailures", () => {
  it("is 0 for empty or missing history", () => {
    expect(consecutiveImportFailures(undefined)).toBe(0);
    expect(consecutiveImportFailures(null)).toBe(0);
    expect(consecutiveImportFailures([])).toBe(0);
  });

  it("counts trailing import failures", () => {
    const history = historyOf([
      { stage: "import", action: "started" },
      { stage: "import", action: "failed (exit 1)" },
      { stage: "import", action: "started" },
      { stage: "import", action: "failed (exit 1)" },
      { stage: "import", action: "started" },
      { stage: "import", action: "failed (exit 1)" },
    ]);
    expect(consecutiveImportFailures(history)).toBe(3);
  });

  it("resets at the most recent 'finished' entry", () => {
    const history = historyOf([
      { stage: "import", action: "failed (exit 1)" },
      { stage: "import", action: "failed (exit 1)" },
      { stage: "import", action: "started" },
      { stage: "import", action: "finished" },
      { stage: "import", action: "started" },
      { stage: "import", action: "failed (exit 1)" },
    ]);
    expect(consecutiveImportFailures(history)).toBe(1);
  });

  it("ignores entries from other stages mixed into the same source's history", () => {
    const history = historyOf([
      { stage: "backfill", action: "started" },
      { stage: "import", action: "failed (exit 1)" },
      { stage: "backfill", action: "started" },
      { stage: "import", action: "failed (exit 1)" },
    ]);
    expect(consecutiveImportFailures(history)).toBe(2);
  });

  it("an operator 'reset…' entry ends the streak so a parked source is retried", () => {
    // After MAX_IMPORT_ATTEMPTS the source is parked as `failed` and the
    // import is never started again — so no "finished" can ever arrive to
    // break the streak. `append_stage_history(key, 'import', 'reset: …')`
    // is the documented operator path once the cause is fixed.
    const parked = historyOf([
      { stage: "import", action: "failed (exit 1)" },
      { stage: "import", action: "failed (exit 1)" },
      { stage: "import", action: "failed (exit 1)" },
      { stage: "import", action: "failed (exit 1)" },
      { stage: "import", action: "failed (exit 1)" },
    ]);
    expect(consecutiveImportFailures(parked)).toBe(5);
    const reset = historyOf([
      ...parked.map(({ stage, action }) => ({ stage, action })),
      { stage: "import", action: "reset: statement_timeout fix deployed (a827b34f7a)" },
    ]);
    expect(consecutiveImportFailures(reset)).toBe(0);
    // A failure AFTER the reset counts again from zero — the reset is not a
    // permanent exemption.
    const failedAgain = historyOf([
      ...reset.map(({ stage, action }) => ({ stage, action })),
      { stage: "import", action: "started" },
      { stage: "import", action: "failed (exit 1)" },
    ]);
    expect(consecutiveImportFailures(failedAgain)).toBe(1);
  });

  it("would have engaged the retry cap that alert-flag dedup broke", () => {
    // Reproduces the exact bug: five straight import failures used to
    // collapse to a single deduped "import_failed" alert, so
    // importFailCount could never reach MAX_IMPORT_ATTEMPTS (5).
    const entries = [];
    for (let i = 0; i < 5; i++) {
      entries.push({ stage: "import", action: "started" });
      entries.push({ stage: "import", action: "failed (exit 1)" });
    }
    expect(consecutiveImportFailures(historyOf(entries))).toBe(5);
  });
});

describe("judikaturImportArgv", () => {
  it("passes --bulk, matching the DE/CH/EU judikatur imports", () => {
    const argv = judikaturImportArgv(JUDIKATUR[0]);
    expect(argv).toContain("--bulk");
    expect(argv).toContain("--source");
    expect(argv).toContain(JUDIKATUR[0].key);
    expect(argv).toContain("--from-normalized");
    expect(argv).toContain("--skip-placeholders");
    expect(argv).toContain("--no-embed");
  });

  it("passes --bulk for every registered court", () => {
    for (const src of JUDIKATUR) {
      expect(judikaturImportArgv(src)).toContain("--bulk");
    }
  });
});

describe("parseFetchTrigger", () => {
  it("reads the dashboard shape {source_key, seit}", () => {
    expect(parseFetchTrigger('{"source_key": "jud-bvwg", "seit": "2026-09-23T15:49:08Z"}')).toBe(
      "jud-bvwg"
    );
  });

  it("reads a bare JSON string set by hand via psql (2026-09-23: ignored for two days)", () => {
    expect(parseFetchTrigger('"jud-bvwg"')).toBe("jud-bvwg");
  });

  it("reads an unquoted key as a last resort", () => {
    expect(parseFetchTrigger("jud-vwgh")).toBe("jud-vwgh");
  });

  it("returns null for nothing, whitespace, or an object without source_key", () => {
    expect(parseFetchTrigger(null)).toBeNull();
    expect(parseFetchTrigger("")).toBeNull();
    expect(parseFetchTrigger("   \n")).toBeNull();
    expect(parseFetchTrigger('{"source": "jud-bvwg"}')).toBeNull();
    expect(parseFetchTrigger('{"source_key": ""}')).toBeNull();
    expect(parseFetchTrigger("42")).toBeNull();
  });
});
