import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { createCalendarEvent, isMsGraphConfigured } from "@/lib/msgraph";
import {
  createUserCalendarEvent,
  isDelegatedMs365Configured,
  isMs365Connected,
} from "@/lib/msgraph-user";
import { getStore } from "@/lib/auth/store";
import { engineWriteOrThrow } from "@/lib/engine";
import { logger } from "@/lib/logger";

const log = logger("api/outlook/calendar");

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
        try {
          await engineWriteOrThrow(
            ctx.headers,
            {
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
            },
            { timeoutMs: 10_000 }
          );
        } catch (err) {
          // The Outlook event already exists — failing the request would make
          // a retry create a duplicate. Log loudly instead of swallowing.
          log.error(
            "[outlook/calendar] case-link persist failed:",
            err instanceof Error ? err.message : String(err)
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
