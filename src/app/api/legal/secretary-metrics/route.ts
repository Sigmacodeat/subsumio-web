import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { listAuditLogs } from "@/lib/audit";
import {
  computeSecretaryMetrics,
  type SecretaryMetricEvent,
} from "@/lib/whatsapp/secretary-metrics";

export const maxDuration = 30;

const querySchema = z.object({
  /** Look-back window in days (default 30). */
  days: z.coerce.number().int().min(1).max(365).optional(),
});

/**
 * Secretary eval gate read API (Paket 33, P1-SECR-006).
 *
 * Admin-only governance view: computes consent compliance, template-window
 * violations, delivery/block breakdown and proactive precision for the proactive
 * WhatsApp secretary, from the tenant's audit log. `gatePass` is the release
 * signal — false means a hard compliance gate was breached.
 */
export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    query: querySchema,
    cacheMaxAge: 30,
  },
  async (ctx, _body, query) => {
    const days = query.days ?? 30;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // `listAuditLogs` filters action with LIKE, so "whatsapp.outbound" covers
    // both outbound_sent and outbound_blocked in one pass.
    const [outbound, feedback] = await Promise.all([
      listAuditLogs({ brainId: ctx.brainId, action: "whatsapp.outbound", from, limit: 5000 }),
      listAuditLogs({
        brainId: ctx.brainId,
        action: "whatsapp.briefing_feedback",
        from,
        limit: 5000,
      }),
    ]);

    const events: SecretaryMetricEvent[] = [...outbound, ...feedback].map((e) => ({
      action: e.action,
      details: e.details ?? null,
    }));

    const metrics = computeSecretaryMetrics(events);
    return Response.json({ windowDays: days, since: from, metrics });
  }
);
