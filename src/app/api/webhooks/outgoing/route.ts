import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { encrypt, isEncryptionEnabled } from "@/lib/encryption";
import { assertPublicUrl, EgressError } from "@/lib/security/egress";
import { getWebhookDeliveryStatus } from "@/lib/webhook-delivery-queue";
import {
  getWebhookFailureStreaks,
  resetWebhookFailures,
  WEBHOOK_AUTO_DISABLE_THRESHOLD,
} from "@/lib/webhook-health";
import { logger } from "@/lib/logger";

const log = logger("webhooks/outgoing");

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
    // Only public https targets: the server posts firm data there.
    try {
      await assertPublicUrl(body.url, { label: "Webhook-Adresse" });
    } catch (err) {
      return apiError(
        "invalid_webhook_url",
        err instanceof EgressError ? err.message : "Webhook-Adresse ist ungültig",
        400
      );
    }
    const id = `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug = `settings/webhooks/${id}`;

    // The signing secret is stored encrypted (never readable on the page),
    // and a failed write is reported instead of claiming a registration.
    // Production without a key throws here (fail-closed) instead of storing
    // the secret readable.
    isEncryptionEnabled();
    const secretEnc = await encrypt(body.secret);
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
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
          secret_enc: secretEnc,
          description: body.description,
          status: "active",
          created_at: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res?.ok) {
      return apiError("engine_write_failed", "Webhook konnte nicht gespeichert werden", 502);
    }

    return apiSuccess({ id, url: body.url, events: body.events });
  }
);

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
  },
  async (ctx) => {
    // Complete list without deleted entries; a failed read is an error.
    let webhooks: Array<{ frontmatter: Record<string, unknown> }>;
    try {
      const pages = await listEnginePages(ctx.headers, "webhook_config", 1000, { strict: true });
      webhooks = pages.map((p) => ({ frontmatter: p.frontmatter ?? {} }));
    } catch {
      return apiError("engine_error", "Webhooks konnten nicht geladen werden", 502);
    }
    // Delivery state is informative; a failing read must not hide the list.
    const delivery = await getWebhookDeliveryStatus(ctx.brainId).catch((err) => {
      log.warn("webhook delivery status unavailable", { error: String(err) });
      return {} as Awaited<ReturnType<typeof getWebhookDeliveryStatus>>;
    });
    const streaks = await getWebhookFailureStreaks(ctx.brainId).catch(
      () => ({}) as Record<string, number>
    );
    return apiSuccess({
      auto_disable_threshold: WEBHOOK_AUTO_DISABLE_THRESHOLD,
      webhooks: webhooks.map((w) => ({
        id: w.frontmatter.id,
        url: w.frontmatter.url,
        events: w.frontmatter.events,
        status: w.frontmatter.status,
        created_at: w.frontmatter.created_at,
        // Switched off automatically after repeated failed deliveries.
        disabled_reason: w.frontmatter.disabled_reason ?? null,
        disabled_at: w.frontmatter.disabled_at ?? null,
        disabled_failures: w.frontmatter.disabled_failures ?? null,
        disabled_last_error: w.frontmatter.disabled_last_error ?? null,
        consecutive_failures: streaks[String(w.frontmatter.id ?? "")] ?? 0,
        delivery: delivery[String(w.frontmatter.id ?? "")] ?? null,
        // Entries without an encrypted secret are not delivered until re-registered.
        needs_reregistration: typeof w.frontmatter.secret_enc !== "string",
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
    if (!/^[A-Za-z0-9_-]+$/.test(query.id)) {
      return apiError("invalid_id", "Ungültige Webhook-ID", 400);
    }
    const slug = `settings/webhooks/${query.id}`;
    // Deleting marks the entry (the engine keeps pages) and drops the secret;
    // dispatch only uses active webhooks.
    const res = await enginePatchPage(
      ctx.headers,
      {
        slug,
        frontmatter: {
          status: "tombstoned",
          deleted_at: new Date().toISOString(),
          secret: null,
          secret_enc: null,
        },
      },
      { timeoutMs: 10_000 }
    ).catch(() => null);
    if (!res?.ok) return apiError("delete_failed", "Löschen fehlgeschlagen", 502);
    return apiSuccess({ deleted: true });
  }
);

const patchSchema = z.object({
  id: z.string().min(1).max(200),
  action: z.literal("reactivate"),
});

/** Reactivates a webhook that was switched off (automatically or otherwise). */
export const PATCH = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: patchSchema,
    audit: (_ctx, body) => ({
      action: "webhook.reactivate" as const,
      entityType: "webhook",
      entityId: body.id,
    }),
  },
  async (ctx, body) => {
    if (!/^[A-Za-z0-9_-]+$/.test(body.id)) {
      return apiError("invalid_id", "Ungültige Webhook-ID", 400);
    }
    let current: Record<string, unknown> | undefined;
    try {
      const pages = await listEnginePages(ctx.headers, "webhook_config", 1000, { strict: true });
      current = pages.find((p) => String(p.frontmatter?.id ?? "") === body.id)?.frontmatter;
    } catch {
      return apiError("engine_error", "Webhook konnte nicht geladen werden", 502);
    }
    if (!current) return apiError("not_found", "Webhook nicht gefunden", 404);
    if (current.status === "active") return apiSuccess({ reactivated: false, status: "active" });
    // A deleted entry has no signing secret any more: register it again instead.
    if (current.status !== "disabled" || typeof current.secret_enc !== "string") {
      return apiError(
        "not_reactivatable",
        "Dieser Webhook kann nicht reaktiviert werden. Bitte neu anlegen.",
        409
      );
    }
    const res = await enginePatchPage(
      ctx.headers,
      {
        slug: `settings/webhooks/${body.id}`,
        frontmatter: {
          status: "active",
          disabled_reason: null,
          disabled_at: null,
          disabled_failures: null,
          disabled_last_error: null,
          reactivated_at: new Date().toISOString(),
        },
      },
      { timeoutMs: 10_000 }
    ).catch(() => null);
    if (!res?.ok) return apiError("reactivate_failed", "Reaktivieren fehlgeschlagen", 502);
    // A fresh start: the old failure streak does not count against it.
    await resetWebhookFailures(ctx.brainId, body.id).catch((err) =>
      log.warn("webhook health reset failed", { error: String(err) })
    );
    return apiSuccess({ reactivated: true, status: "active" });
  }
);
