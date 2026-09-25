import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { createCalendarEvent, isMsGraphConfigured } from "@/lib/msgraph";
import {
  createUserCalendarEvent,
  isDelegatedMs365Configured,
  isMs365Connected,
} from "@/lib/msgraph-user";
import { getStore } from "@/lib/auth/store";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const createEventSchema = z.object({
  subject: z.string().min(1).max(300),
  start: z.string().min(1),
  end: z.string().min(1),
  timeZone: z.string().max(50).optional(),
  location: z.string().max(300).optional(),
  body: z.string().max(5000).optional(),
  attendees: z
    .array(
      z.object({
        name: z.string().max(200),
        email: z.string().email(),
      })
    )
    .max(50)
    .optional(),
  categories: z.array(z.string().max(50)).max(10).optional(),
  caseSlug: z.string().max(300).optional(),
  /**
   * Subsumio appointment this event mirrors: its outlook_event_id is written
   * back so the background sync updates/deletes this event instead of
   * pushing a second copy.
   */
  appointmentSlug: z
    .string()
    .max(300)
    .regex(/^legal\/appointments\/[A-Za-z0-9._-]+$/, "invalid_appointment_slug")
    .optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createEventSchema,
    audit: (ctx, body) => ({
      action: "connector.sync" as const,
      entityType: "calendar_event",
      details: {
        subject: body.subject,
        caseSlug: body.caseSlug,
        brainId: ctx.brainId,
      },
    }),
  },
  async (ctx, body) => {
    // WP-4.19: persönlich verbundener Kalender hat Vorrang — der Termin
    // landet im eigenen Outlook des Nutzers, nicht im Dienst-Postfach.
    const user = await getStore().getById(ctx.user.id);
    const delegated = isDelegatedMs365Configured() && user && isMs365Connected(user);
    if (!delegated && !isMsGraphConfigured()) {
      return apiError(
        "msgraph_not_configured",
        "Microsoft 365 ist nicht konfiguriert. Erforderlich: MS365_CLIENT_ID, MS365_CLIENT_SECRET, MS365_TENANT_ID",
        400
      );
    }

    try {
      let eventId: string | undefined;
      let webLink: string | undefined;
      if (delegated) {
        // Delegierter Schreibpfad: /me/events des Nutzers.
        eventId = await createUserCalendarEvent(ctx.user.id, {
          subject: body.subject,
          start: body.start,
          end: body.end,
          location: body.location,
        });
      } else {
        const event = await createCalendarEvent({
          subject: body.subject,
          start: body.start,
          end: body.end,
          timeZone: body.timeZone,
          location: body.location,
          body: body.body,
          attendees: body.attendees,
          categories: body.categories,
        });
        eventId = event.id;
        webLink = event.webLink;
      }

      // If case-linked, store event reference in brain
      if (body.caseSlug && eventId) {
        const slug = delegated
          ? `calendar/outlook/${ctx.user.id}/${eventId}`
          : `calendar/outlook/${eventId}`;
        await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify({
            slug,
            title: `Termin: ${body.subject}`,
            type: "calendar_event",
            frontmatter: {
              type: "calendar_event",
              case_slug: body.caseSlug,
              outlook_event_id: eventId,
              owner_user_id: delegated ? ctx.user.id : undefined,
              subject: body.subject,
              start: body.start,
              end: body.end,
              location: body.location,
              web_link: webLink,
              synced_at: new Date().toISOString(),
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
      }

      // Link the appointment to its Outlook copy (delegated = the owner's own
      // calendar, the same one the per-user sync writes to).
      if (delegated && eventId && body.appointmentSlug) {
        const now = new Date().toISOString();
        const linked = await enginePatchPage(
          ctx.headers,
          {
            slug: body.appointmentSlug,
            frontmatter: {
              outlook_event_id: eventId,
              synced_to: "outlook",
              outlook_synced_at: now,
              synced_at: now,
            },
          },
          { timeoutMs: 10_000 }
        ).catch(() => null);
        if (!linked?.ok) {
          // The event exists in Outlook but the appointment does not know it:
          // the sync would push a duplicate. Report it instead of "ok".
          return apiError(
            "calendar_link_failed",
            "Termin in Outlook angelegt, aber nicht mit dem Subsumio-Termin verknüpft",
            502
          );
        }
      }

      return apiSuccess({
        ok: true,
        eventId,
        webLink,
        subject: body.subject,
        delegated: Boolean(delegated),
      });
    } catch (e) {
      return apiError(
        "calendar_create_failed",
        e instanceof Error ? e.message : "Termin konnte nicht erstellt werden",
        502
      );
    }
  }
);
