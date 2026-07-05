import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

const eventTypes = [
  "case.created",
  "deadline.critical",
  "invoice.paid",
  "document.received",
  "intake.new",
] as const;

const registerSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(eventTypes)).min(1).max(10),
  secret: z.string().min(16).max(256),
  description: z.string().max(500).optional(),
});

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: registerSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "webhook",
      entityId: body.url,
      details: { events: body.events },
    }),
  },
  async (ctx, body) => {
    const id = `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug = `settings/webhooks/${id}`;

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: `Webhook: ${body.url}`,
        type: "webhook_config",
        frontmatter: {
          id,
          url: body.url,
          events: body.events,
          secret: body.secret,
          description: body.description,
          status: "active",
          created_at: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({ id, url: body.url, events: body.events });
  }
);

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
  },
  async (ctx) => {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=webhook_config&limit=100`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    const webhooks = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
      frontmatter: Record<string, unknown>;
    }>;
    return apiSuccess({
      webhooks: webhooks.map((w) => ({
        id: w.frontmatter.id,
        url: w.frontmatter.url,
        events: w.frontmatter.events,
        status: w.frontmatter.status,
        created_at: w.frontmatter.created_at,
      })),
    });
  }
);

const deleteSchema = z.object({
  id: z.string().min(1).max(200),
});

export const DELETE = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    query: deleteSchema,
    audit: (ctx, _body, query) => ({
      action: "case.update" as const,
      entityType: "webhook",
      entityId: query?.id ?? "unknown",
      details: { action: "delete" },
    }),
  },
  async (ctx, _body, query) => {
    if (!query?.id) return apiError("missing_id", "Webhook-ID erforderlich", 400);
    const slug = `settings/webhooks/${query.id}`;
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("delete_failed", "Löschen fehlgeschlagen", 502);
    return apiSuccess({ deleted: true });
  }
);
