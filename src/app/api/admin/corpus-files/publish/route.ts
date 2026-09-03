import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import {
  offeneEintraege,
  alsImportiertMarkieren,
  type WarteEintrag,
} from "@/lib/corpus-import-queue";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface PublishStatus {
  laeuft: boolean;
  gestartet: string | null;
  quellen: string[];
  dateien: number;
  ergebnis?: "ok" | "fehler";
  meldung?: string;
}

const bodySchema = z.object({
  paths: z.array(z.string()).optional(),
  /**
   * trigger=true (default): setzt ein Trigger-Flag in pipeline_config, das
   * die Pipeline beim nächsten Zyklus liest und sofort einen Lauf startet.
   * Die Queue wird NICHT geleert — das übernimmt die Pipeline nach
   * erfolgreichem Import.
   *
   * trigger=false: Legacy-Verhalten — Queue sofort leeren (nur verwenden
   * wenn der Import manuell bereits bestätigt wurde).
   */
  trigger: z.boolean().default(true),
});

/**
 * GET /api/admin/corpus-files/publish
 * → Listet alle offenen Import-Queue-Einträge + Pipeline-Live-Status.
 *
 *   status.laeuft = true wenn mindestens eine Pipeline-Source gerade importiert
 *   (stage = 'importing' oder 'running'). status.quellen listet die aktiven
 *   Source-Keys, status.dateien ist die Anzahl der Queue-Einträge die von den
 *   laufenden Quellen betroffen sind.
 *
 * POST /api/admin/corpus-files/publish
 * → Stoßt den Pipeline-Import an (setzt Trigger-Flag in pipeline_config).
 *   Die Queue bleibt sichtbar bis die Pipeline den Import bestätigt.
 *   Mit trigger=false: Legacy-Modus (Queue sofort leeren).
 */
export const GET = createHandler(
  {
    action: "admin.*",
  },
  async () => {
    const eintraege: WarteEintrag[] = offeneEintraege();

    // Pipeline-Live-Status aus pipeline_state abfragen.
    // Ein Import "läuft" wenn mindestens eine Source stage='importing' hat
    // oder ein PID gesetzt ist (Prozess aktiv).
    // Zusätzlich: alert_flags prüfen um ergebnis='fehler' + meldung zu
    // liefern, damit der PublishBanner den letzten Fehler anzeigen kann.
    let status: PublishStatus | null = null;
    const pool = getSharedPgPool();
    if (pool) {
      try {
        const result = await pool.query(`
          SELECT source_key, stage, pid, pid_started_at, alert_flags
          FROM pipeline_state
          WHERE stage IN ('importing', 'running', 'backfilling', 'embedding')
             OR pid IS NOT NULL
        `);
        const activeRows = result.rows.filter(
          (r) =>
            r.stage === "importing" ||
            r.stage === "running" ||
            r.stage === "backfilling" ||
            r.pid !== null
        );
        if (activeRows.length > 0) {
          const quellen = activeRows.map((r) => r.source_key);
          const dateien = eintraege.length;
          const gestartet =
            activeRows
              .map((r) => r.pid_started_at)
              .filter(Boolean)
              .sort()[0] ?? null;
          status = {
            laeuft: true,
            gestartet: gestartet ? new Date(gestartet).toISOString() : null,
            quellen,
            dateien,
          };
        }

        // Letzten Import-Fehler abfragen (alert_flags mit type='import_failed')
        if (!status?.laeuft) {
          const alertResult = await pool.query(`
            SELECT source_key, alert_flags
            FROM pipeline_state
            WHERE alert_flags IS NOT NULL
              AND alert_flags::text LIKE '%import_failed%'
          `);
          if (alertResult.rows.length > 0) {
            const failedSources = alertResult.rows.map((r) => r.source_key);
            const alerts = alertResult.rows.flatMap((r) => {
              try {
                const flags =
                  typeof r.alert_flags === "string" ? JSON.parse(r.alert_flags) : r.alert_flags;
                return Array.isArray(flags)
                  ? flags.filter((f: { type: string }) => f.type === "import_failed")
                  : [];
              } catch {
                return [];
              }
            });
            if (alerts.length > 0) {
              const lastAlert = alerts.sort(
                (a: { raised_at?: string }, b: { raised_at?: string }) =>
                  (b.raised_at ?? "").localeCompare(a.raised_at ?? "")
              )[0];
              status = {
                laeuft: false,
                gestartet: null,
                quellen: failedSources,
                dateien: 0,
                ergebnis: "fehler",
                meldung: (lastAlert as { message?: string }).message ?? "Import fehlgeschlagen",
              };
            }
          }
        }
      } catch {
        // pipeline_state nicht verfügbar → kein Status
      }
    }

    return apiSuccess({
      offen: eintraege.length,
      eintraege,
      status: status ?? { laeuft: false, gestartet: null, quellen: [], dateien: 0 },
    });
  }
);

export const POST = createHandler(
  {
    action: "admin.*",
    body: bodySchema,
    audit: (ctx, body) => ({
      action: "corpus_files.publish" as const,
      entityType: "corpus_import_queue",
      details: {
        trigger: body.trigger,
        pathsCount: body.paths?.length ?? null,
        user: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    // Wenn keine paths angegeben, alle abräumen
    const alle = offeneEintraege();
    const paths = body.paths ?? alle.map((e) => e.pfad);

    if (paths.length === 0) {
      return apiSuccess({ abgeraeumt: 0, message: "Warteschlange war bereits leer" });
    }

    // Trigger-Modus: Pipeline-Flag setzen, Queue NICHT leeren.
    // Die Pipeline liest pipeline_config jeden Zyklus und startet bei
    // triggered=true einen sofortigen Lauf. Nach erfolgreichem Import
    // leert sie die Queue via drainImportQueue (edit/create) und
    // reconcileDeletedFiles (delete).
    if (body.trigger) {
      const pool = getSharedPgPool();
      if (!pool) {
        // Keine DB → Legacy-Modus als Fallback (Queue leeren).
        const abgeraeumt = alsImportiertMarkieren(paths);
        return apiSuccess({
          abgeraeumt,
          verbleibend: offeneEintraege().length,
          warnung: "Datenbank nicht verfügbar — Queue wurde direkt geleert (Legacy-Modus).",
        });
      }
      try {
        await pool.query(
          `INSERT INTO pipeline_config (key, value, updated_at, updated_by)
           VALUES ('triggered', $1::jsonb, NOW(), $2)
           ON CONFLICT (key)
           DO UPDATE SET value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
          [
            JSON.stringify({ triggered: true, seit: new Date().toISOString(), pfade: paths }),
            ctx.user.email,
          ]
        );
      } catch {
        // pipeline_config-Tabelle fehlt → Legacy-Modus.
        const abgeraeumt = alsImportiertMarkieren(paths);
        return apiSuccess({
          abgeraeumt,
          verbleibend: offeneEintraege().length,
          warnung:
            "pipeline_config-Tabelle fehlt — Queue wurde direkt geleert (Legacy-Modus). Migration 011 anwenden.",
        });
      }
      return apiSuccess({
        abgeraeumt: 0,
        verbleibend: offeneEintraege().length,
        triggered: true,
        message:
          "Import wurde angestoßen. Die Pipeline übernimmt den Import beim nächsten Zyklus und leert die Queue nach erfolgreichem Import.",
      });
    }

    // Legacy-Modus: Queue sofort leeren (trigger=false).
    const abgeraeumt = alsImportiertMarkieren(paths);
    return apiSuccess({
      abgeraeumt,
      verbleibend: offeneEintraege().length,
    });
  }
);
