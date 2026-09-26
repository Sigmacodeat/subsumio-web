/**
 * Case scanner, on demand: the queued job starts no agent runs; the engine
 * route selects only visible matters (capped) and launches one capped
 * supervisor run per named matter on the trusted path, without a fixed model,
 * marked as a review item.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import {
  CASE_SCAN_MAX_CASES,
  legalCaseScannerHandler,
  launchCaseScanRuns,
  selectCaseScanTargets,
} from "../src/core/minions/handlers/legal-case-scanner.ts";
import type { MinionJobContext } from "../src/core/minions/types.ts";

let engine: PGLiteEngine;
const SOURCE = "default";

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({ database_url: "" });
  await engine.initSchema();
  for (const slug of ["cases/acme-a", "cases/acme-b", "cases/acme-c"]) {
    await engine.putPage(slug, {
      title: `Akte ${slug}`,
      type: "legal_case",
      compiled_truth: "Offene Akte ohne Beweismittel.",
    });
  }
  await engine.putPage("cases/acme-closed", {
    title: "Abgeschlossene Akte",
    type: "legal_case",
    compiled_truth: "Erledigt.",
    frontmatter: { status: "closed" },
  });
}, 60_000);

afterAll(async () => {
  await engine.disconnect();
});

async function supervisorJobs() {
  return engine.executeRaw<{
    id: number;
    data: unknown;
    budget_remaining_cents: number | null;
    budget_owner_job_id: number | null;
  }>(
    `SELECT id, data, budget_remaining_cents, budget_owner_job_id
       FROM minion_jobs WHERE name = 'supervisor' ORDER BY id`
  );
}

function parse(d: unknown): Record<string, unknown> {
  return (typeof d === "string" ? JSON.parse(d) : d) as Record<string, unknown>;
}

describe("legal case scanner job", () => {
  it("starts no agent runs on its own", async () => {
    const ctx = {
      id: 1,
      data: { max_cases: 10, _matter_scope: ["cases/acme-a"] },
    } as unknown as MinionJobContext;
    const result = await legalCaseScannerHandler(ctx, engine);
    expect(result.triggered).toBe(0);
    expect(await supervisorJobs()).toHaveLength(0);
  });
});

describe("selectCaseScanTargets", () => {
  it("all open: only visible, open matters", async () => {
    const sel = await selectCaseScanTargets(engine, {
      scope: "all_open",
      sourceId: SOURCE,
      matterScope: ["cases/acme-a", "cases/acme-b", "cases/acme-closed"],
    });
    expect(sel.cases.map((c) => c.slug).sort()).toEqual(["cases/acme-a", "cases/acme-b"]);
    expect(sel.truncated).toBe(false);
  });

  it("all open: capped at the limit", async () => {
    const sel = await selectCaseScanTargets(engine, {
      scope: "all_open",
      sourceId: SOURCE,
      limit: 2,
    });
    expect(sel.cases).toHaveLength(2);
    expect(sel.truncated).toBe(true);
  });

  it("the limit never exceeds the hard cap", async () => {
    const sel = await selectCaseScanTargets(engine, {
      scope: "all_open",
      sourceId: SOURCE,
      limit: 10_000,
    });
    expect(sel.limit).toBe(CASE_SCAN_MAX_CASES);
  });

  it("selection: invisible and unknown matters read as not found", async () => {
    const sel = await selectCaseScanTargets(engine, {
      scope: "selection",
      caseSlugs: ["cases/acme-a", "cases/acme-c", "cases/missing"],
      sourceId: SOURCE,
      matterScope: ["cases/acme-a"],
    });
    expect(sel.cases.map((c) => c.slug)).toEqual(["cases/acme-a"]);
    expect(sel.skipped).toEqual([
      { case_slug: "cases/acme-c", reason: "not_found" },
      { case_slug: "cases/missing", reason: "not_found" },
    ]);
  });

  it("selection: another source's matters read as not found", async () => {
    const sel = await selectCaseScanTargets(engine, {
      scope: "selection",
      caseSlugs: ["cases/acme-a"],
      sourceId: "other-firm",
    });
    expect(sel.cases).toHaveLength(0);
  });

  it("selection beyond the limit is skipped, not scanned", async () => {
    const sel = await selectCaseScanTargets(engine, {
      scope: "selection",
      caseSlugs: ["cases/acme-a", "cases/acme-b", "cases/acme-c"],
      sourceId: SOURCE,
      limit: 2,
    });
    expect(sel.cases).toHaveLength(2);
    expect(sel.skipped).toEqual([{ case_slug: "cases/acme-c", reason: "over_limit" }]);
  });
});

describe("launchCaseScanRuns", () => {
  it("one capped supervisor run per matter, trusted path, no fixed model, review marker", async () => {
    const sel = await selectCaseScanTargets(engine, {
      scope: "selection",
      caseSlugs: ["cases/acme-a", "cases/acme-b", "cases/acme-c"],
      sourceId: SOURCE,
    });
    const out = await launchCaseScanRuns(engine, sel.cases, {
      sourceId: SOURCE,
      matterStamp: { _matter_scope: ["cases/acme-a", "cases/acme-b", "cases/acme-c"] },
      ownerUserId: "u-lawyer",
      scanId: "scan-test-0001",
    });
    expect(out.failed).toEqual([]);
    expect(out.launched).toHaveLength(3);

    const jobs = await supervisorJobs();
    expect(jobs).toHaveLength(3);
    for (const job of jobs) {
      expect(Number(job.budget_remaining_cents)).toBeGreaterThan(0);
      expect(Number(job.budget_owner_job_id)).toBe(Number(job.id));
      const data = parse(job.data);
      expect(data.supervisor_model).toBeUndefined();
      expect(data._review_origin).toBe("case_scan");
      expect(data._case_scan_id).toBe("scan-test-0001");
      expect(data._owner_user_id).toBe("u-lawyer");
      expect(typeof data._case_slug).toBe("string");
      expect(data._matter_scope).toEqual(["cases/acme-a", "cases/acme-b", "cases/acme-c"]);
    }
  });
});
