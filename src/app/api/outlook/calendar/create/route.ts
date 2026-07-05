import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { createCalendarEvent, isMsGraphConfigured } from "@/lib/msgraph";
import { ENGINE_URL } from "@/lib/engine";

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
    if (!isMsGraphConfigured()) {
      return apiError(
        "msgraph_not_configured",
        "Microsoft 365 ist nicht konfiguriert. Erforderlich: MS365_CLIENT_ID, MS365_CLIENT_SECRET, MS365_TENANT_ID",
        400
      );
    }

    try {
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

      // If case-linked, store event reference in brain
      if (body.caseSlug) {
        const slug = `calendar/outlook/${event.id}`;
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
              outlook_event_id: event.id,
              subject: body.subject,
              start: body.start,
              end: body.end,
              location: body.location,
              web_link: event.webLink,
              synced_at: new Date().toISOString(),
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
      }

      return apiSuccess({
        ok: true,
        eventId: event.id,
        webLink: event.webLink,
        subject: event.subject,
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
