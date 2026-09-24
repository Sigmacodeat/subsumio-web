import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { MinionQueue } from "../src/core/minions/queue.ts";
import { purgeSourceData } from "../src/core/source-data-purge.ts";

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({ database_url: "" });
  await engine.initSchema();
  for (const id of ["tenant_gone", "tenant_keep"]) {
    await engine.executeRaw(
      "INSERT INTO sources (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING",
      [id]
    );
  }
}, 60_000);

afterAll(async () => {
  await engine.disconnect();
});

async function count(sql: string, params: unknown[]): Promise<number> {
  const rows = await engine.executeRaw<{ n: number | string }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

async function seed(sourceId: string): Promise<number> {
  await engine.putPage(
    "notes/mandant",
    { type: "note" as never, title: "Mandant", compiled_truth: "Personenbezogene Daten" },
    { sourceId }
  );
  await engine.executeRaw(
    `INSERT INTO query_cache (id, query_text, source_id, results) VALUES ($1, $2, $3, $4)`,
    [`qc-${sourceId}`, "Frage zum Mandanten", sourceId, []]
  );
  await engine.executeRaw(
    `INSERT INTO ingest_log (source_id, source_type, source_ref, summary) VALUES ($1, 'email', 'msg-1', 'Mail vom Mandanten')`,
    [sourceId]
  );
  const job = await new MinionQueue(engine).add(
    "tabular-review",
    { _source_id: sourceId },
    {},
    { allowProtectedSubmit: true }
  );
  await engine.executeRaw(
    `INSERT INTO subagent_messages (job_id, message_idx, role, content_blocks) VALUES ($1, 0, 'user', $2)`,
    [job.id, [{ type: "text", text: "Mandantenakte" }]]
  );
  return job.id;
}

describe("purgeSourceData (Art. 17 DSGVO)", () => {
  it("removes pages and derived data of the source, and nothing of other sources", async () => {
    const goneJob = await seed("tenant_gone");
    const keepJob = await seed("tenant_keep");

    const counts = await purgeSourceData(engine, "tenant_gone");
    expect(counts.pages).toBe(1);
    expect(counts.query_cache).toBe(1);
    expect(counts.ingest_log).toBe(1);
    expect(counts.minion_jobs).toBe(1);

    expect(
      await count("SELECT count(*) AS n FROM pages WHERE source_id = $1", ["tenant_gone"])
    ).toBe(0);
    expect(
      await count("SELECT count(*) AS n FROM query_cache WHERE source_id = $1", ["tenant_gone"])
    ).toBe(0);
    expect(
      await count("SELECT count(*) AS n FROM ingest_log WHERE source_id = $1", ["tenant_gone"])
    ).toBe(0);
    // Subagent transcript rows go with the job (ON DELETE CASCADE).
    expect(
      await count("SELECT count(*) AS n FROM subagent_messages WHERE job_id = $1", [goneJob])
    ).toBe(0);

    // The other tenant is untouched.
    expect(
      await count("SELECT count(*) AS n FROM pages WHERE source_id = $1", ["tenant_keep"])
    ).toBe(1);
    expect(
      await count("SELECT count(*) AS n FROM query_cache WHERE source_id = $1", ["tenant_keep"])
    ).toBe(1);
    expect(
      await count("SELECT count(*) AS n FROM ingest_log WHERE source_id = $1", ["tenant_keep"])
    ).toBe(1);
    expect(await count("SELECT count(*) AS n FROM minion_jobs WHERE id = $1", [keepJob])).toBe(1);
    expect(
      await count("SELECT count(*) AS n FROM subagent_messages WHERE job_id = $1", [keepJob])
    ).toBe(1);
  });

  it("refuses an empty source id", async () => {
    await expect(purgeSourceData(engine, "")).rejects.toThrow();
  });
});
