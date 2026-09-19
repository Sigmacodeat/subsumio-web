/**
 * Per-document ingest log for the law corpus (table corpus_ingest_log,
 * migration 142). Importers record every document they added or changed, so
 * the operator console can answer "which law / decision came in on which day".
 *
 * Logging never fails an import: a write error is reported and dropped.
 */

export type IngestAction = "added" | "updated" | "removed" | "rejected";

export interface IngestEvent {
  source_id: string;
  doc_id: string | null;
  slug: string;
  title?: string | null;
  action: IngestAction;
  origin: string;
  detail?: Record<string, unknown>;
}

interface RawExecutor {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
}

/** The title line of a corpus file ("title: …" in the frontmatter). */
export function titleOf(content: string): string | null {
  const m = content.match(/^---\r?\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
  return m ? m[1].slice(0, 300) : null;
}

export async function writeIngestLog(engine: RawExecutor, events: IngestEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await engine.executeRaw(
      // detail travels as text and is parsed by Postgres (text::jsonb), not
      // cast from a JS string parameter — that path double-encodes.
      `INSERT INTO corpus_ingest_log (source_id, doc_id, slug, title, action, origin, detail)
       SELECT u.s, u.d, u.sl, u.t, u.a, u.o, u.dt::jsonb
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
         AS u(s, d, sl, t, a, o, dt)`,
      [
        events.map((e) => e.source_id),
        events.map((e) => e.doc_id),
        events.map((e) => e.slug),
        events.map((e) => e.title ?? null),
        events.map((e) => e.action),
        events.map((e) => e.origin),
        events.map((e) => JSON.stringify(e.detail ?? {})),
      ]
    );
  } catch (err) {
    console.error(
      `[ingest-log] ${events.length} Einträge nicht geschrieben: ${err instanceof Error ? err.message.slice(0, 160) : err}`
    );
  }
}
