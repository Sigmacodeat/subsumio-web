/**
 * Art. 17 DSGVO erasure of one source's data in the brain database.
 *
 * Deleting the pages alone leaves derived personal data behind: cached search
 * answers (`query_cache`), background runs whose payload names the source
 * (`minion_jobs`, which cascades to subagent_messages, subagent_tool_executions,
 * minion_inbox, minion_attachments and subagent_rate_leases through their
 * `ON DELETE CASCADE` foreign keys) and the ingest audit trail (`ingest_log`).
 *
 * Plain parameterised SQL through `engine.executeRaw`, so PGLite and Postgres
 * run the same statements (engine parity). Every statement is scoped to the
 * one source id: other sources in the same database are never touched.
 */
import type { BrainEngine } from "./engine.ts";

export interface SourceDataPurgeCounts {
  pages: number;
  query_cache: number;
  minion_jobs: number;
  ingest_log: number;
}

export async function purgeSourceData(
  engine: Pick<BrainEngine, "executeRaw">,
  sourceId: string
): Promise<SourceDataPurgeCounts> {
  if (!sourceId) throw new Error("purgeSourceData: sourceId is required");

  // Jobs first: a job still running for this source must not re-create pages
  // after they are gone. Cascades remove subagent transcripts/tool rows.
  const jobs = await engine.executeRaw<{ id: number }>(
    "DELETE FROM minion_jobs WHERE data->>'_source_id' = $1 RETURNING id",
    [sourceId]
  );
  const pages = await engine.executeRaw<{ id: number }>(
    "DELETE FROM pages WHERE source_id = $1 RETURNING id",
    [sourceId]
  );
  const cache = await engine.executeRaw<{ id: string }>(
    "DELETE FROM query_cache WHERE source_id = $1 RETURNING id",
    [sourceId]
  );
  const ingest = await engine.executeRaw<{ id: number }>(
    "DELETE FROM ingest_log WHERE source_id = $1 RETURNING id",
    [sourceId]
  );

  return {
    pages: pages.length,
    query_cache: cache.length,
    minion_jobs: jobs.length,
    ingest_log: ingest.length,
  };
}
