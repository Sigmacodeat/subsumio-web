import { existsSync } from "node:fs";
import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { logger } from "@/lib/logger";
import {
  computeLawDetail,
  LAW_KEY_PATTERN,
  type DbLawPage,
  type LawDetailNorm,
  type LawDetailResponse,
  type LawSourceId,
} from "@/lib/law-coverage";
import {
  corpusFileCandidatesForSlug,
  LAW_SOURCE_CFG,
  loadFetchOutcomes,
  loadLawFetchState,
  loadRisIndex,
} from "@/lib/law-coverage-server";
import { getFlagsBulk, safeCorpusPath } from "@/lib/corpus-steward";
import { fetchGiiTocCached } from "@/lib/de-statute-coverage";

const log = logger("api/admin/corpus-law-coverage/law");

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Obergrenze gespeicherter Seiten je Gesetz — das größte Gesetz (ASVG) hat ~1.600. */
const MAX_PAGES = 5000;

/**
 * GET /api/admin/corpus-law-coverage/law?source=law-at-normen&key=10001622
 *
 * Detail eines Gesetzes für /ops/corpus/gesetz/…: derselbe Soll-Ist-Abgleich
 * wie die Liste (gleiche Quellen-Konfiguration, gleicher RIS-Index), aber
 * ungekürzt — alle fehlenden §§, alle gespeicherten §§ mit Pfad der
 * Textdatei und Prüfvermerk, dazu der Nachlade-Stand dieses Gesetzes.
 */
export const GET = createHandler(
  {
    action: "platform.operator",
    query: z.object({
      source: z.enum(["law-at-normen", "law-at-landesrecht", "law-de"]),
      key: z.string().regex(LAW_KEY_PATTERN, "Ungültige Gesetzes-Kennung"),
    }),
  },
  async (_ctx, _body, query) => {
    const source = query!.source as LawSourceId;
    const key = query!.key;
    const pool = getSharedPgPool();
    if (!pool) return apiError("service_unavailable", "Datenbank nicht erreichbar", 503);

    const cfg = LAW_SOURCE_CFG[source];
    try {
      const indexResult = cfg.indexFile ? await loadRisIndex(cfg.indexFile) : null;
      const outcomes = cfg.corpus ? await loadFetchOutcomes(cfg.corpus) : null;
      // Auch Seiten ohne (passende) statute_id zählen, wenn ihre
      // Dokumentnummer zum Soll des Gesetzes gehört — dieselbe Regel wie in
      // computeLawCoverage, sonst widerspräche die Detailseite der Liste.
      const sollDocs = [...(indexResult?.entries.get(key)?.docs.keys() ?? [])];
      const [pageResult, fetchState] = await Promise.all([
        pool.query(
          `SELECT p.slug,
                  ${cfg.docExpr} AS doc,
                  p.frontmatter->>'paragraph_ref' AS label,
                  p.title,
                  p.frontmatter->>'abbr' AS abbr,
                  p.frontmatter->>'short_title' AS short_title,
                  p.updated_at,
                  count(cc.id)::int AS chunks,
                  count(cc.id) FILTER (WHERE cc.embedding IS NOT NULL)::int AS embedded
             FROM pages p
             LEFT JOIN content_chunks cc ON cc.page_id = p.id
            WHERE p.source_id = $1 AND p.deleted_at IS NULL
              AND (${cfg.keyExpr} = $2 OR ${cfg.docExpr} = ANY($3::text[]))
            GROUP BY p.id
            LIMIT ${MAX_PAGES}`,
          [source, key, sollDocs]
        ),
        source === "law-at-normen" ? loadLawFetchState(pool) : Promise.resolve(null),
      ]);

      const rows = pageResult.rows as Array<{
        slug: string;
        doc: string | null;
        label: string | null;
        title: string | null;
        abbr: string | null;
        short_title: string | null;
        updated_at: Date | string | null;
        chunks: number;
        embedded: number;
      }>;
      const pages: DbLawPage[] = rows.map((r) => ({
        slug: r.slug,
        doc: r.doc || null,
        label: r.label || null,
        title: r.title ?? null,
        chunks: Number(r.chunks) || 0,
        embedded: Number(r.embedded) || 0,
        updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      }));

      const entry = indexResult?.entries.get(key) ?? null;
      const detail = computeLawDetail(entry, pages, outcomes);
      if (!detail) return apiError("not_found", "Gesetz nicht gefunden", 404);

      // Datei je gespeichertem § — nur Pfade, die es auf der Platte gibt,
      // damit „Text ansehen" nie in einen leeren Betrachter führt.
      const fileFor = (slug: string): string | null => {
        for (const rel of corpusFileCandidatesForSlug(source, slug)) {
          const abs = safeCorpusPath(rel);
          if (abs && existsSync(abs)) return rel;
        }
        return null;
      };
      const withFile = detail.present.map((p) => ({ p, file: fileFor(p.slug) }));
      const extraWithFile = detail.extra.map((p) => ({ p, file: fileFor(p.slug) }));
      const flags = getFlagsBulk(
        [...withFile, ...extraWithFile].map((x) => x.file).filter((f): f is string => !!f)
      );
      const toNorm = ({ p, file }: { p: DbLawPage; file: string | null }): LawDetailNorm => ({
        doc: p.doc,
        label: p.label,
        title: p.title,
        file,
        flag: file ? (flags[file]?.flag ?? null) : null,
        chunks: p.chunks,
        embedded: p.embedded,
        updated_at: p.updated_at,
      });
      const present = withFile.map(toNorm);
      const extra = extraWithFile.map(toNorm);

      const quality = { verified: 0, needs_review: 0, defective: 0, unchecked: 0 };
      for (const n of present) {
        if (n.flag === "verified") quality.verified++;
        else if (n.flag === "needs_review") quality.needs_review++;
        else if (n.flag === "defective") quality.defective++;
        else quality.unchecked++;
      }

      let title = entry?.kurztitel ?? rows.find((r) => r.short_title)?.short_title ?? null;
      const abbr = entry?.abk ?? rows.find((r) => r.abbr)?.abbr ?? null;
      if (!title && cfg.titleLookup === "gii") {
        try {
          title = (await fetchGiiTocCached()).find((l) => l.slug === key)?.title ?? null;
        } catch (err) {
          log.warn("[law] gii-toc unavailable:", (err as Error).message);
        }
      }

      const chunks = [...present, ...extra].reduce((a, n) => a + n.chunks, 0);
      const embedded = [...present, ...extra].reduce((a, n) => a + n.embedded, 0);
      const payload: LawDetailResponse = {
        source,
        key,
        abbr,
        title,
        status: detail.status,
        wanted: detail.wanted,
        have: present.length,
        missing: detail.missing,
        unreachable: detail.unreachable,
        present,
        extra,
        chunks,
        embedded,
        embed_pct: chunks > 0 ? Math.round((embedded / chunks) * 1000) / 10 : null,
        quality,
        index: {
          available: cfg.indexFile ? indexResult !== null : null,
          measured_at: indexResult?.mtime ?? null,
        },
        generated_at: new Date().toISOString(),
        fetch: {
          supported: source === "law-at-normen",
          queued: fetchState?.queued.includes(key) ?? false,
          running: fetchState?.running === key,
          unavailable: fetchState?.unavailable ?? false,
        },
      };
      return apiSuccess(payload);
    } catch (err) {
      log.error("[law] query failed:", (err as Error).message);
      return apiError("law_detail_failed", "Gesetz konnte nicht geladen werden", 500);
    }
  }
);
