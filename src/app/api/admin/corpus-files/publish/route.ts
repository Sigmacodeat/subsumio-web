import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { offeneEintraege, alsImportiertMarkieren, type WarteEintrag } from "@/lib/corpus-import-queue";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

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
 * → Listet alle offenen Import-Queue-Einträge + Pipeline-Status.
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
    return apiSuccess({
      offen: eintraege.length,
      eintraege,
    });
  },
);

export const POST = createHandler(
  {
    action: "admin.*",
    body: bodySchema,
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
    // leert sie die Queue (alsImportiertMarkieren).
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
          [JSON.stringify({ triggered: true, seit: new Date().toISOString(), pfade: paths }), ctx.user.email]
        );
      } catch {
        // pipeline_config-Tabelle fehlt → Legacy-Modus.
        const abgeraeumt = alsImportiertMarkieren(paths);
        return apiSuccess({
          abgeraeumt,
          verbleibend: offeneEintraege().length,
          warnung: "pipeline_config-Tabelle fehlt — Queue wurde direkt geleert (Legacy-Modus). Migration 011 anwenden.",
        });
      }
      return apiSuccess({
        abgeraeumt: 0,
        verbleibend: offeneEintraege().length,
        triggered: true,
        message: "Import wurde angestoßen. Die Pipeline übernimmt den Import beim nächsten Zyklus und leert die Queue nach erfolgreichem Import.",
      });
    }

    // Legacy-Modus: Queue sofort leeren (trigger=false).
    const abgeraeumt = alsImportiertMarkieren(paths);
    return apiSuccess({
      abgeraeumt,
      verbleibend: offeneEintraege().length,
    });
  },
);
