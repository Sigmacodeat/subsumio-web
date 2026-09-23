/**
 * Automatisierungsregeln (WP-4.17) — „Wenn X, dann Y".
 *
 * GET    → alle Regeln der Brain
 * POST   → neue Regel anlegen
 * PATCH  → Regel aktivieren/deaktivieren, umbenennen oder neu speichern
 *          (wer speichert, wird Besitzer — die Regel läuft mit seiner Sicht)
 * DELETE → Regel löschen
 */

import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import {
  AUTOMATION_PAUSE_MESSAGES,
  TRIGGER_ACTION_TYPES,
  TRIGGER_EVENTS,
  buildAutomationSlug,
  deleteAutomation,
  listAutomations,
  saveAutomation,
  updateAutomation,
  type AutomationRule,
} from "@/lib/automation";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  type: z.enum(TRIGGER_ACTION_TYPES),
  title: z.string().trim().max(300).optional(),
  message: z.string().trim().max(2000).optional(),
  assignee: z.string().trim().max(100).optional(),
  due_in_days: z.number().int().min(0).max(365).optional(),
  workflow_template_id: z.string().trim().max(200).optional(),
  recipient: z.string().trim().max(200).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  event: z.enum(TRIGGER_EVENTS),
  filters: z.record(z.string().max(100), z.string().max(200)).optional(),
  action: actionSchema,
});

const patchSchema = z.object({
  slug: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
});

const deleteSchema = z.object({
  slug: z.string().min(1).max(200),
});

export const GET = createHandler({ action: "admin.*", rateTier: "standard" }, async (ctx) => {
  try {
    const rules = (await listAutomations(ctx)).map((r) => ({
      ...r,
      // Paused by the cron (e.g. an e-mail rule without owner): say why.
      ...(r.paused_reason ? { status_message: AUTOMATION_PAUSE_MESSAGES[r.paused_reason] } : {}),
    }));
    return apiSuccess({ rules, total: rules.length });
  } catch (err) {
    return apiError(
      "automations_list_failed",
      err instanceof Error ? err.message : "automations_list_failed",
      500
    );
  }
});

export const POST = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx, body) => ({
      action: "automation.create" as const,
      entityType: "automation",
      details: { name: body.name, event: body.event, by: ctx.user?.email ?? "system" },
    }),
  },
  async (ctx, body) => {
    if (body.action.type === "send_mail" && !body.action.recipient) {
      return apiError("recipient_required", "E-Mail-Aktion braucht einen Empfänger", 400);
    }
    if (body.action.type === "start_workflow" && !body.action.workflow_template_id) {
      return apiError("workflow_template_required", "Workflow-Aktion braucht ein Template", 400);
    }
    const rule: AutomationRule = {
      slug: buildAutomationSlug(body.name),
      name: body.name,
      enabled: true,
      event: body.event,
      filters: body.filters,
      action: body.action,
      created_at: new Date().toISOString(),
      created_by: ctx.user?.email ?? "system",
      // The rule runs with this person's matter access (see cron/automations).
      owner_user_id: ctx.user.id,
    };
    if (!(await saveAutomation(ctx, rule))) {
      return apiError("automation_create_failed", "Regel konnte nicht gespeichert werden", 502);
    }
    return apiSuccess({ rule });
  }
);

export const PATCH = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    body: patchSchema,
    audit: (ctx, body) => ({
      action: "automation.update" as const,
      entityType: "automation",
      entityId: body.slug,
      details: { enabled: body.enabled, name: body.name },
    }),
  },
  async (ctx, body) => {
    const rules = await listAutomations(ctx);
    const rule = rules.find((r) => r.slug === body.slug);
    if (!rule) return apiError("automation_not_found", "Regel nicht gefunden", 404);
    // Saving a rule makes the saver its owner: from now on it runs with
    // their matter access. This also resumes a rule paused for lack of one.
    const updated: AutomationRule = {
      ...rule,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      owner_user_id: ctx.user.id,
      paused_reason: undefined,
    };
    if (!(await updateAutomation(ctx, updated))) {
      return apiError("automation_update_failed", "Regel konnte nicht aktualisiert werden", 502);
    }
    return apiSuccess({ rule: updated });
  }
);

export const DELETE = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    body: deleteSchema,
    audit: (ctx, body) => ({
      action: "automation.delete" as const,
      entityType: "automation",
      entityId: body.slug,
      details: {},
    }),
  },
  async (ctx, body) => {
    if (!(await deleteAutomation(ctx, body.slug))) {
      return apiError("automation_delete_failed", "Regel konnte nicht gelöscht werden", 502);
    }
    return apiSuccess({ deleted: body.slug });
  }
);
