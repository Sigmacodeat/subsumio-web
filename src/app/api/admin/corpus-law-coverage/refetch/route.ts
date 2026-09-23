import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { logger } from "@/lib/logger";

const log = logger("api/admin/corpus-law-coverage/refetch");

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/corpus-law-coverage/refetch
 *
 * Stellt ein Gesetz (gnr) in die `law_fetch_queue` (pipeline_config). Der
 * Corpus-Pipeline-Loop auf dem Server holt sich den Eintrag und startet
 * `ris-xml-fetch-normen.ts --gnr …` — RIS-Lock, Pacing und das erlaubte
 * Massen-Download-Fenster greifen wie bei jedem anderen Fetch.
 *
 * Derzeit nur law-at-normen (Bundesrecht) — der Landesrecht-Fetcher hat
 * keinen gnr-Filter.
 */
export const POST = createHandler(
  {
    action: "platform.operator",
    audit: (ctx, body) => ({
      action: "corpus.law_refetch" as const,
      entityType: "corpus_pipeline",
      details: { source: body?.source, gnr: body?.gnr, user: ctx.user.email },
    }),
    body: z.object({
      source: z.literal("law-at-normen"),
      gnr: z.string().regex(/^\d{4,12}$/, "gnr muss eine Gesetzesnummer sein"),
    }),
  },
  async (_ctx, body) => {
    const pool = getSharedPgPool();
    if (!pool) return apiError("service_unavailable", "Datenbank nicht erreichbar", 503);
    try {
      const entry = JSON.stringify({
        source: body!.source,
        gnr: body!.gnr,
        queued_at: new Date().toISOString(),
      });
      const res = await pool.query(
        `INSERT INTO pipeline_config (key, value, updated_at)
         VALUES ('law_fetch_queue', jsonb_build_array($1::jsonb), now())
         ON CONFLICT (key) DO UPDATE
           SET value = CASE
                 WHEN pipeline_config.value @> jsonb_build_array(
                        jsonb_build_object('gnr', $2)) THEN pipeline_config.value
                 ELSE pipeline_config.value || jsonb_build_array($1::jsonb)
               END,
               updated_at = now()
         RETURNING jsonb_array_length(value) AS queue_len,
                   value @> jsonb_build_array(jsonb_build_object('gnr', $2)) AND
                     NOT (value = jsonb_build_array($1::jsonb)) AS already_queued`,
        [entry, body!.gnr]
      );
      const row = res.rows[0] as { queue_len: number; already_queued: boolean } | undefined;
      log.info(
        `[refetch] gnr=${body!.gnr} queued (queue_len=${row?.queue_len}, dup=${row?.already_queued})`
      );
      return apiSuccess({
        queued: true,
        gnr: body!.gnr,
        queue_len: row?.queue_len ?? null,
        note: "Die Pipeline holt das Gesetz im nächsten RIS-Fenster; der Import läuft danach automatisch.",
      });
    } catch (err) {
      log.error("[refetch] failed:", (err as Error).message);
      return apiError("refetch_failed", "Nachladung konnte nicht vorgemerkt werden", 500);
    }
  }
);
