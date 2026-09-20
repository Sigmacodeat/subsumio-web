import { createHandler } from "@/lib/api-handler";
import { deadlinesIcsFor } from "@/lib/deadlines-ics";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  case: z.string().max(500).optional(),
});

/**
 * GET /api/legal/deadlines.ics — the deadline calendar as a download for the
 * signed-in user.
 *
 * A calendar client cannot subscribe here: Outlook, Apple Kalender and Google
 * Kalender fetch without a browser session. The subscription link with its own
 * secret lives at /api/calendar/<token>/fristen.ics; both build the same file
 * through src/lib/deadlines-ics.ts.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    try {
      const ics = await deadlinesIcsFor(ctx.headers, query.case ?? undefined);
      return new Response(ics, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'attachment; filename="fristenbuch.ics"',
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch {
      return new Response("ICS feed unavailable", { status: 502 });
    }
  }
);
