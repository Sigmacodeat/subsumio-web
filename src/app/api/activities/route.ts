import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { createActivityEvent, type ActivityEvent } from "@/lib/passive-time";
import type { AuditAction } from "@/lib/audit";

const recordActivitySchema = z.object({
  type: z.enum([
    "document_edit",
    "document_view",
    "email_sent",
    "email_received",
    "call",
    "meeting",
    "research",
    "drafting",
    "review",
    "chat",
    "portal_message",
    "bea_message",
  ]),
  case_slug: z.string().max(300).optional(),
  description: z.string().min(1).max(500),
  started_at: z.string().max(50),
  ended_at: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: recordActivitySchema,
    audit: (_ctx, body) => ({
      action: "activity.record" as unknown as AuditAction,
      entityType: "activity_event",
      details: { type: body.type, hasCaseSlug: Boolean(body.case_slug) },
    }),
  },
  async (ctx, body) => {
    const event = createActivityEvent({
      type: body.type,
      user_email: ctx.user.email,
      case_slug: body.case_slug,
      description: body.description,
      started_at: body.started_at,
      ended_at: body.ended_at,
      metadata: body.metadata,
    });

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/activities/${event.id}`,
        title: `${event.type}: ${event.description.slice(0, 60)}`,
        type: "activity_event",
        frontmatter: event,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({ event });
  }
);

const listActivityQuerySchema = z.object({
  user_email: z.string().email().optional(),
  case_slug: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: listActivityQuerySchema,
    audit: (_ctx, _body) => ({
      action: "activity.list" as unknown as AuditAction,
      entityType: "activity_event",
      details: {},
    }),
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({
      type: "activity_event",
      limit: String(query?.limit ?? 100),
    });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let events: ActivityEvent[] = (
      Array.isArray(data) ? data : (data.pages ?? [])
    ) as ActivityEvent[];

    if (query?.user_email) {
      events = events.filter((e) => e.user_email === query.user_email);
    }
    if (query?.case_slug) {
      events = events.filter((e) => e.case_slug === query.case_slug);
    }
    if (query?.from) {
      const fromTime = new Date(query.from).getTime();
      events = events.filter((e) => new Date(e.started_at).getTime() >= fromTime);
    }
    if (query?.to) {
      const toTime = new Date(query.to).getTime();
      events = events.filter((e) => new Date(e.started_at).getTime() <= toTime);
    }

    return apiSuccess({ events });
  }
);
