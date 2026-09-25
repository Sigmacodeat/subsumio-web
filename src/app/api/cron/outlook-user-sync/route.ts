import { NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { getRecipientsByBrain, mapWithConcurrency } from "@/lib/cron-utils";
import {
  createUserCalendarEvent,
  isMs365Connected,
  listUserCalendarEvents,
} from "@/lib/msgraph-user";
import { fetchPages } from "@/lib/cron-utils";
import { logger } from "@/lib/logger";
import { engineWriteOrThrow } from "@/lib/engine-write";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const log = logger("cron/outlook-user-sync");

/**
 * WP-4.19 — Per-User-Kalendersync (delegiertes OAuth).
 *
 * Anders als cron/outlook-sync (ein Dienst-Account für die Kanzlei) läuft
 * dieser Job über alle Nutzer mit verbundenem persönlichem Outlook-Konto
 * und spiegelt deren /me/calendarView (±30 Tage) als calendar_event-Pages
 * in die Kanzlei-Brain — Slug enthält die User-ID, damit Termine zweier
 * Kollegen nicht kollidieren.
 */
async function handler() {
  const recipientsByBrain = await getRecipientsByBrain();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const until = new Date(Date.now() + 60 * 86_400_000);

  let usersSynced = 0;
  let eventsSynced = 0;
  const errors: string[] = [];

  for (const [brainId, users] of recipientsByBrain) {
    const connected = users.filter((u) => isMs365Connected(u));
    if (connected.length === 0) continue;
    const headers = engineHeadersForBrain(brainId);

    await mapWithConcurrency(
      connected,
      async (user) => {
        try {
          const events = await listUserCalendarEvents(user.id, { start: since, end: until });
          for (const ev of events) {
            const slug = `calendar/outlook/${user.id}/${ev.id}`;
            const res = await fetch(`${ENGINE_URL}/api/pages`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify({
                slug,
                title: `Termin: ${ev.subject ?? "Ohne Betreff"}`,
                type: "calendar_event",
                frontmatter: {
                  type: "calendar_event",
                  outlook_event_id: ev.id,
                  owner_user_id: user.id,
                  owner_email: user.ms365UserEmail ?? user.email,
                  subject: ev.subject,
                  start: ev.start?.dateTime,
                  end: ev.end?.dateTime,
                  is_all_day: ev.isAllDay ?? false,
                  location: ev.location?.displayName,
                  synced_at: new Date().toISOString(),
                },
              }),
              signal: AbortSignal.timeout(10_000),
            });
            if (res.ok) eventsSynced++;
          }
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

    // Rückrichtung: in Subsumio angelegte Termine mit sync_to_outlook-Flag
    // und ohne outlook_event_id in den Kalender des Besitzers pushen.
    // (Sofort-Push im Editor schlägt z. B. fehl, wenn das Token abgelaufen war.)
    try {
      const appointments = await fetchPages(brainId, "appointment", 500);
      const byEmail = new Map(connected.map((u) => [u.email.toLowerCase(), u] as const));
      for (const appt of appointments) {
        const fm = appt.frontmatter ?? {};
        if (fm.sync_to_outlook !== true || fm.outlook_event_id) continue;
        const ownerEmail =
          typeof fm.calendar_owner_email === "string" ? fm.calendar_owner_email.toLowerCase() : "";
        const owner = byEmail.get(ownerEmail);
        if (!owner) continue;
        const date = typeof fm.date === "string" ? fm.date : "";
        const time = typeof fm.time === "string" ? fm.time : "09:00";
        const duration = typeof fm.duration === "number" ? fm.duration : 60;
        if (!date) continue;
        // Lokale Vienna-Wall-Clock übergeben (die Lib stempelt die TZ).
        const start = new Date(`${date}T${time}:00`);
        if (Number.isNaN(start.getTime())) continue;
        const endMin = start.getHours() * 60 + start.getMinutes() + duration;
        const pad = (n: number) => String(n).padStart(2, "0");
        const endStr = `${date}T${pad(Math.floor(endMin / 60) % 24)}:${pad(endMin % 60)}:00`;
        try {
          const eventId = await createUserCalendarEvent(owner.id, {
            subject: String(fm.title ?? appt.title ?? "Termin"),
            start: `${date}T${time}:00`,
            end: endStr,
            location: typeof fm.location === "string" ? fm.location : undefined,
          });
          if (eventId) {
            await engineWriteOrThrow(
              `${ENGINE_URL}/api/pages`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({
                  slug: appt.slug,
                  merge: true,
                  frontmatter: { outlook_event_id: eventId },
                }),
                signal: AbortSignal.timeout(10_000),
              },
              "Outlook-Termin-Verknüpfung"
            );
            eventsSynced++;
          }
        } catch (err) {
          errors.push(`push ${appt.slug}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`${brainId}/appointments: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log.info("outlook user sync done", { usersSynced, eventsSynced, errors: errors.length });
  return NextResponse.json({ ok: errors.length === 0, usersSynced, eventsSynced, errors });
}

export const GET = createCronHandler(handler);
export const POST = createCronHandler(handler);
