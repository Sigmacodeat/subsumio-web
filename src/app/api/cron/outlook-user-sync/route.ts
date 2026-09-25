import { NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { engineHeadersForBrain } from "@/lib/engine";
import { getRecipientsByBrain, mapWithConcurrency } from "@/lib/cron-utils";
import { getUserMs365Token, isMs365Connected } from "@/lib/msgraph-user";
import {
  calendarSyncWindow,
  listAppointmentsForSync,
  pullOutlookEvents,
  pushAppointmentsToOutlook,
  pushedEventIds,
} from "@/lib/calendar/graph-user-sync";
import type { ListedPage } from "@/lib/engine-pages";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const log = logger("cron/outlook-user-sync");

/**
 * WP-4.19 — Per-User-Kalendersync (delegiertes OAuth).
 *
 * Anders als cron/outlook-sync (ein Dienst-Account für die Kanzlei) läuft
 * dieser Job über alle Nutzer mit verbundenem persönlichem Outlook-Konto.
 * Pull und Push laufen über dieselbe Bibliothek wie der Postfach-Sync
 * (src/lib/calendar/graph-user-sync.ts): Pull mit Paging und Wiener Zeit als
 * calendar_event-Pages (Slug je Postfach), Push als Upsert — neue Termine
 * anlegen, geänderte aktualisieren, abgesagte/gelöschte in Outlook entfernen.
 */
async function handler() {
  const recipientsByBrain = await getRecipientsByBrain();
  const window = calendarSyncWindow();

  let usersSynced = 0;
  let eventsSynced = 0;
  const errors: string[] = [];

  for (const [brainId, users] of recipientsByBrain) {
    // Deactivated accounts are not synced (their tokens stay unused).
    const connected = users.filter((u) => isMs365Connected(u) && !u.deactivatedAt);
    if (connected.length === 0) continue;
    const headers = engineHeadersForBrain(brainId);

    let appointments: ListedPage[];
    try {
      // Incl. deleted ones, so a deletion reaches Outlook; strict — a failed
      // read must not look like "nothing to push".
      appointments = await listAppointmentsForSync(headers);
    } catch (err) {
      errors.push(`${brainId}/appointments: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const skipIds = pushedEventIds(appointments);

    await mapWithConcurrency(
      connected,
      async (user) => {
        try {
          const token = await getUserMs365Token(user.id);
          const ownerEmail = user.ms365UserEmail ?? user.email;
          const pull = await pullOutlookEvents(
            token,
            headers,
            { email: ownerEmail, userId: user.id },
            window,
            skipIds
          );
          eventsSynced += pull.pulled;
          errors.push(...pull.errors.map((e) => `${user.id}: ${e}`));

          // Rückrichtung: Termine dieses Nutzers (calendar_owner_email ist die
          // Login-Adresse, ggf. die verbundene Microsoft-Adresse).
          const push = await pushAppointmentsToOutlook(
            token,
            headers,
            appointments,
            [user.email, ownerEmail].filter(Boolean)
          );
          eventsSynced += push.pushed + push.updated + push.deleted;
          errors.push(...push.errors.map((e) => `${user.id}: ${e}`));
          usersSynced++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // ms365_not_connected / token_expired = Nutzer muss neu verbinden —
          // kein Fehler, nur Info.
          if (msg.includes("not_connected") || msg.includes("token_expired")) {
            log.info("user calendar skipped", { user: user.id, reason: msg });
          } else {
            errors.push(`${user.id}: ${msg}`);
          }
        }
      },
      4
    );
  }

  log.info("outlook user sync done", { usersSynced, eventsSynced, errors: errors.length });
  return NextResponse.json({ ok: errors.length === 0, usersSynced, eventsSynced, errors });
}

export const GET = createCronHandler(handler);
export const POST = createCronHandler(handler);
