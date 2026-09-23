import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { logger } from "@/lib/logger";
import { lawCorpusDir } from "@/lib/corpus-paths";
import {
  computeLawCoverage,
  parseRisInforceIndex,
  type DbLawAgg,
  type DbLawDoc,
  type RisIndexEntry,
} from "@/lib/law-coverage";
import { fetchGiiTocCached } from "@/lib/de-statute-coverage";

const log = logger("api/admin/corpus-law-coverage");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/corpus-law-coverage?source=law-at-normen
 *
 * §-genauer Soll-Ist-Abgleich je Gesetz: der RIS-In-force-Index
 * (`law-corpus/_state/ris-inforce*.jsonl`, geschrieben von
 * ris-inforce-crawl*.ts) liefert das Soll — welche Norm-Dokumente
 * RIS derzeit als gültig listet —, die DB liefert das Ist. Pro Gesetz:
 * Soll, Ist, fehlende Paragraphen (Dokument-IDs + §-Label) und
 * Embedding-Coverage.
 *
 * Quellen ohne RIS-Index (law-de) liefern den reinen DB-Stand je Gesetz
 * mit status "db-only" — es wird kein Upstream-Soll erfunden.
 */

interface SourceCfg {
  /** Index-Datei unter <corpus>/_state/ — null = kein Upstream-Soll. */
  indexFile: string | null;
  /** SQL-Ausdruck für den Gesetzes-Key (gnr bzw. Slug-Segment). */
  keyExpr: string;
  /** SQL-Ausdruck für die Dokument-ID je Page (nor bzw. §-Segment). */
  docExpr: string;
  /** Optionaler Titel-Lookup für Quellen ohne abbr/title im Frontmatter. */
  titleLookup?: "gii";
}

const SOURCES: Record<string, SourceCfg> = {
  "law-at-normen": {
    indexFile: "ris-inforce.jsonl",
    keyExpr: "p.frontmatter->>'statute_id'",
    docExpr: "p.frontmatter->>'doc_id'",
  },
  "law-at-landesrecht": {
    indexFile: "ris-inforce-landesrecht.jsonl",
    keyExpr: "p.frontmatter->>'statute_id'",
    docExpr: "p.frontmatter->>'doc_id'",
  },
  "law-de": {
    indexFile: null,
    keyExpr: "split_part(p.slug, '/', 4)",
    docExpr: "split_part(p.slug, '/', 5)",
    titleLookup: "gii",
  },
};

const RESPONSE_TTL_MS = 60_000;
const responseCache = new Map<string, { at: number; payload: unknown }>();

const indexCache = new Map<string, { mtimeMs: number; entries: Map<string, RisIndexEntry> }>();

async function loadRisIndex(
  file: string
): Promise<{ entries: Map<string, RisIndexEntry>; mtime: string } | null> {
  const path = join(lawCorpusDir(), "_state", file);
  if (!existsSync(path)) return null;
  const mtimeMs = (await stat(path)).mtimeMs;
  const cached = indexCache.get(path);
  if (cached && cached.mtimeMs === mtimeMs) {
    return { entries: cached.entries, mtime: new Date(mtimeMs).toISOString() };
  }
  const entries = parseRisInforceIndex(await readFile(path, "utf-8"));
  indexCache.set(path, { mtimeMs, entries });
  return { entries, mtime: new Date(mtimeMs).toISOString() };
}

export const GET = createHandler(
  {
    action: "platform.operator",
    query: z.object({
      source: z.enum(["law-at-normen", "law-at-landesrecht", "law-de"]),
    }),
  },
  async (_ctx, _body, query) => {
    const source = query!.source;
    const cached = responseCache.get(source);
    if (cached && Date.now() - cached.at < RESPONSE_TTL_MS) {
      return apiSuccess(cached.payload);
    }

    const pool = getSharedPgPool();
    if (!pool) return apiError("service_unavailable", "Datenbank nicht erreichbar", 503);

    const cfg = SOURCES[source];
    try {
      const indexResult = cfg.indexFile ? await loadRisIndex(cfg.indexFile) : null;
      const indexAvailable = cfg.indexFile ? indexResult !== null : null;

      const [aggResult, docResult] = await Promise.all([
        pool.query(
          `SELECT ${cfg.keyExpr} AS key,
                  count(DISTINCT p.id)::int AS pages,
                  count(cc.id)::int AS chunks,
                  count(cc.id) FILTER (WHERE cc.embedding IS NOT NULL)::int AS embedded,
                  max(p.frontmatter->>'abbr') AS abbr,
                  max(p.frontmatter->>'short_title') AS title
             FROM pages p
             LEFT JOIN content_chunks cc ON cc.page_id = p.id
            WHERE p.source_id = $1 AND p.deleted_at IS NULL
            GROUP BY 1`,
          [source]
        ),
        pool.query(
          `SELECT ${cfg.keyExpr} AS key, ${cfg.docExpr} AS doc
             FROM pages p
            WHERE p.source_id = $1 AND p.deleted_at IS NULL AND ${cfg.docExpr} IS NOT NULL`,
          [source]
        ),
      ]);

      const aggs: DbLawAgg[] = aggResult.rows.map((r) => ({
        key: String(r.key),
        pages: Number(r.pages),
        chunks: Number(r.chunks),
        embedded: Number(r.embedded),
        abbr: (r.abbr as string | null) ?? null,
        title: (r.title as string | null) ?? null,
      }));
      const docs: DbLawDoc[] = docResult.rows.map((r) => ({
        key: String(r.key),
        doc: (r.doc as string | null) ?? null,
      }));

      const { rows, totals } = computeLawCoverage(indexResult?.entries ?? null, docs, aggs);

      // DE: kurze Slugs ("bgb") als Key — amtliche Langtitel aus dem
      // gii-TOC nachreichen (24-h-Cache, fail-open).
      if (cfg.titleLookup === "gii") {
        try {
          const toc = await fetchGiiTocCached();
          const bySlug = new Map(toc.map((l) => [l.slug, l.title]));
          for (const r of rows) {
            const t = bySlug.get(r.key);
            if (t && !r.title) r.title = t;
          }
        } catch (err) {
          log.warn("[corpus-law-coverage] gii-toc unavailable:", (err as Error).message);
        }
      }

      const payload = {
        source,
        generated_at: new Date().toISOString(),
        index: {
          /** null = diese Quelle hat grundsätzlich kein Upstream-Soll. */
          available: indexAvailable,
          file: cfg.indexFile,
          measured_at: indexResult?.mtime ?? null,
          laws: indexResult ? indexResult.entries.size : null,
          docs: indexResult
            ? [...indexResult.entries.values()].reduce((a, e) => a + e.docs.size, 0)
            : null,
        },
        totals,
        laws: rows,
      };
      responseCache.set(source, { at: Date.now(), payload });
      return apiSuccess(payload);
    } catch (err) {
      log.error("[corpus-law-coverage] query failed:", (err as Error).message);
      return apiError("law_coverage_failed", "Gesetzes-Abgleich fehlgeschlagen", 500);
    }
  }
);
