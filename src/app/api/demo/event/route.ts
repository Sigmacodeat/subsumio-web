// Client-side funnel beacon for the public live demo.
//
// Only UI-only signals may be reported here (tour steps, tour skipped, CTA
// click, deadline confirmed). Everything with a server action (question,
// ingest, gate, reset, expiry, signup) is written by that route itself so
// the funnel stays server-authoritative and can't be inflated from the
// browser. Demo sessions only; PostHog keeps firing in parallel.

import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { recordDemoEvent, DEMO_CLIENT_EVENTS, type DemoEvent } from "@/lib/demo/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  event: z.enum(DEMO_CLIENT_EVENTS as unknown as [DemoEvent, ...DemoEvent[]]),
  step: z.number().int().min(0).max(20).optional(),
  place: z.string().max(32).optional(),
});

export const POST = createHandler(
  { action: "brain.read", body: bodySchema, rateTier: "standard" },
  async (ctx, body) => {
    if (!ctx.demo) return new Response(null, { status: 204 });
    await recordDemoEvent(ctx.demo.sid, body.event, {
      step: body.step ?? null,
      props: body.place ? { place: body.place } : {},
    });
    return Response.json({ ok: true });
  }
);
