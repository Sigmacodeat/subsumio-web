/**
 * Every supervisor run the case scanner launches carries a spend cap and no
 * hard-wired planner model (the utility tier of the deployment applies).
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { legalCaseScannerHandler } from "../src/core/minions/handlers/legal-case-scanner.ts";
import type { MinionJobContext } from "../src/core/minions/types.ts";
import { MinionQueue } from "../src/core/minions/queue.ts";

let engine: PGLiteEngine;

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
}, 60_000);

afterAll(async () => {
  await engine.disconnect();
});

describe("legal case scanner", () => {
  it("does not start supervisor runs on its own (protected job name)", async () => {
    const ctx = {
      id: 1,
      data: { max_cases: 10, _matter_scope: ["cases/acme-a"] },
    } as unknown as MinionJobContext;
    const result = await legalCaseScannerHandler(ctx, engine);
    expect(result.triggered).toBe(0);
  });

  it("once launching is allowed, every run is capped and has no fixed model", async () => {
    // Simulates a trusted submitter: the protected-name gate is lifted.
    const original = MinionQueue.prototype.add;
    MinionQueue.prototype.add = function (
      this: MinionQueue,
      ...args: Parameters<MinionQueue["add"]>
    ) {
      const [name, data, opts] = args;
      return original.call(this, name, data, opts, { allowProtectedSubmit: true });
    } as MinionQueue["add"];
    try {
      const ctx = {
        id: 1,
        data: {
          max_cases: 10,
          // Scoped scan: the judikatur watch (network) is skipped.
          _matter_scope: ["cases/acme-a", "cases/acme-b", "cases/acme-c"],
        },
      } as unknown as MinionJobContext;
      const result = await legalCaseScannerHandler(ctx, engine);
      expect(result.triggered).toBe(3);

      const jobs = await engine.executeRaw<{
        data: unknown;
        budget_remaining_cents: number | null;
        budget_owner_job_id: number | null;
        id: number;
      }>(
        `SELECT id, data, budget_remaining_cents, budget_owner_job_id
         FROM minion_jobs WHERE name = 'supervisor' ORDER BY id`
      );
      expect(jobs).toHaveLength(3);
      for (const job of jobs) {
        expect(Number(job.budget_remaining_cents)).toBeGreaterThan(0);
        expect(Number(job.budget_owner_job_id)).toBe(Number(job.id));
        const data = (typeof job.data === "string" ? JSON.parse(job.data) : job.data) as Record<
          string,
          unknown
        >;
        expect(data.supervisor_model).toBeUndefined();
      }
    } finally {
      MinionQueue.prototype.add = original;
    }
  });
});
