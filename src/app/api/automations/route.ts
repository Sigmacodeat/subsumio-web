/**
 * Automatisierungsregeln (WP-4.17) — „Wenn X, dann Y". Das eine Regelmodell
 * (`automation`-Seiten), das die Oberfläche anlegt und der Cron ausführt.
 *
 * GET    → alle Regeln der Kanzlei, mit Besitzer, Pause, letztem Lauf/Fehler
 *          (noch nicht übernommene Regeln des Altmodells lesend abgebildet)
 * POST   → neue Regel anlegen (Anlegender wird Besitzer, Stichtag = jetzt)
 * PATCH  → Regel bearbeiten, aktivieren/deaktivieren oder neu speichern
 *          (wer speichert, wird Besitzer — die Regel läuft mit seiner Sicht;
 *          wird sie dadurch wieder ausführbar, beginnt ein neuer Stichtag)
 * DELETE → Regel löschen
 */

import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import { getStore } from "@/lib/auth/store";
import {
  AUTOMATION_PAUSE_MESSAGES,
  MAX_ACTIONS,
  MAX_DUE_SOON_DAYS,
  TRIGGER_ACTION_TYPES,
  TRIGGER_EVENTS,
  applyAutomationEdit,
  buildNewAutomationRule,
  deleteAutomation,
  listAutomations,
  normalizeTriggerEvent,
  saveAutomation,
  updateAutomation,
  validateActions,
  type AutomationAction,
  type AutomationRule,
} from "@/lib/automation";
import {
  LEGACY_KEYS_CLEARED,
  legacyRuleToAutomation,
  listLegacyRulePages,
} from "@/lib/automation-migration";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  type: z.enum(TRIGGER_ACTION_TYPES),
  title: z.string().trim().max(300).optional(),
  message: z.string().trim().max(2000).optional(),
  assignee: z.string().trim().max(100).optional(),
  due_in_days: z.number().int().min(0).max(365).optional(),
  workflow_template_id: z.string().trim().max(200).optional(),
  recipient: z.string().trim().max(200).optional(),
  status: z.string().trim().max(100).optional(),
});

/** Akzeptiert auch Auslöser-Namen des Altmodells (z. B. deadline_approaching). */
const eventSchema = z.preprocess((v) => normalizeTriggerEvent(v) ?? v, z.enum(TRIGGER_EVENTS));

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  event: eventSchema,
  filters: z.record(z.string().max(100), z.string().max(200)).optional(),
  within_days: z.number().int().min(0).max(MAX_DUE_SOON_DAYS).optional(),
  actions: z.array(actionSchema).min(1).max(MAX_ACTIONS).optional(),
  /** Einzelaktion (ältere Aufrufer). */
  action: actionSchema.optional(),
});

const patchSchema = z.object({
  slug: z.string().min(1).max(300),
  name: z.string().trim().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  event: eventSchema.optional(),
  within_days: z.number().int().min(0).max(MAX_DUE_SOON_DAYS).nullable().optional(),
  actions: z.array(actionSchema).min(1).max(MAX_ACTIONS).optional(),
});

const deleteSchema = z.object({
  slug: z.string().min(1).max(300),
});

/** Leere Strings aus Formularen entfernen. */
function cleanActions(actions: z.infer<typeof actionSchema>[]): AutomationAction[] {
  return actions.map((a) => {
    const out: AutomationAction = { type: a.type };
    for (const [k, v] of Object.entries(a)) {
      if (k === "type" || v === undefined || v === "") continue;
      (out as unknown as Record<string, unknown>)[k] = v;
    }
    return out;
  });
}

interface RuleView extends AutomationRule {
  status_message?: string;
  owner_name?: string;
  /** Regel des Altmodells, die der nächste Cron-Lauf übernimmt. */
  pending_migration?: boolean;
}

async function ownerNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const store = getStore();
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const u = await store.getById(id).catch(() => null);
      if (u) names.set(id, u.name || u.email);
    })
  );
  return names;
}

async function legacyViews(ctx: { headers: Record<string, string> }): Promise<RuleView[]> {
  const pages = await listLegacyRulePages(ctx.headers).catch(() => []);
  const now = new Date();
  return (
    pages
      .map((p) => legacyRuleToAutomation(p, { now }))
      .filter((r): r is AutomationRule => r !== null)
      // Lesende Abbildung — der Stichtag entsteht erst bei der Übernahme.
      .map((r) => ({ ...r, active_since: undefined, pending_migration: true }))
  );
}

/** Findet eine Regel — auch eine noch nicht übernommene des Altmodells. */
async function findRule(
  ctx: { headers: Record<string, string> },
  slug: string
): Promise<{ rule: AutomationRule; legacy: boolean } | null> {
  const rule = (await listAutomations(ctx)).find((r) => r.slug === slug);
  if (rule) return { rule, legacy: false };
  const legacy = (await listLegacyRulePages(ctx.headers).catch(() => [])).find(
    (p) => p.slug === slug
  );
  const mapped = legacy ? legacyRuleToAutomation(legacy, { now: new Date() }) : null;
  return mapped ? { rule: mapped, legacy: true } : null;
}

export const GET = createHandler({ action: "agent.read", rateTier: "standard" }, async (ctx) => {
  try {
    const [rules, legacy] = await Promise.all([listAutomations(ctx), legacyViews(ctx)]);
    const all: RuleView[] = [...rules, ...legacy];
    const names = await ownerNames(
      all.map((r) => r.owner_user_id).filter((id): id is string => !!id)
    );
    const views = all
      .map((r) => ({
        ...r,
        // Laufzustand ist Sache des Crons — die Liste zeigt keine Keys.
        fired_keys: undefined,
        ...(r.owner_user_id && names.has(r.owner_user_id)
          ? { owner_name: names.get(r.owner_user_id) }
          : {}),
        // Paused by the cron (e.g. an e-mail rule without owner): say why.
        ...(r.paused_reason ? { status_message: AUTOMATION_PAUSE_MESSAGES[r.paused_reason] } : {}),
      }))
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return apiSuccess({ rules: views, total: views.length });
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
    action: "workflow.approve",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx, body) => ({
      action: "automation.create" as const,
      entityType: "automation",
      details: { name: body.name, event: body.event, by: ctx.user?.email ?? "system" },
    }),
  },
  async (ctx, body) => {
    const actions = cleanActions(body.actions ?? (body.action ? [body.action] : []));
    const invalid = validateActions(actions);
    if (invalid) return apiError("invalid_action", invalid, 400);
    // The rule runs with this person's matter access (see cron/automations)
    // and only reacts to events from now on.
    const rule = buildNewAutomationRule(
      {
        name: body.name,
        event: body.event,
        filters: body.filters,
        within_days: body.within_days,
        actions,
      },
      { userId: ctx.user.id, label: ctx.user?.email ?? "system" }
    );
    if (!(await saveAutomation(ctx, rule))) {
      return apiError("automation_create_failed", "Regel konnte nicht gespeichert werden", 502);
    }
    return apiSuccess({ rule });
  }
);

export const PATCH = createHandler(
  {
    action: "workflow.approve",
    rateTier: "standard",
    body: patchSchema,
    audit: (_ctx, body) => ({
      action: "automation.update" as const,
      entityType: "automation",
      entityId: body.slug,
      details: {
        enabled: body.enabled,
        name: body.name,
        event: body.event,
        actions: body.actions?.map((a) => a.type),
      },
    }),
  },
  async (ctx, body) => {
    const found = await findRule(ctx, body.slug);
    if (!found) return apiError("automation_not_found", "Regel nicht gefunden", 404);
    const actions = body.actions ? cleanActions(body.actions) : undefined;
    if (actions) {
      const invalid = validateActions(actions);
      if (invalid) return apiError("invalid_action", invalid, 400);
    }
    // Saving a rule makes the saver its owner: from now on it runs with
    // their matter access. This also resumes a rule paused for lack of one.
    const updated = applyAutomationEdit(
      found.rule,
      {
        name: body.name,
        enabled: body.enabled,
        event: body.event,
        within_days: body.within_days,
        actions,
      },
      ctx.user.id
    );
    // A not-yet-migrated rule of the old model is migrated right here.
    const ok = await updateAutomation(ctx, updated, found.legacy ? { ...LEGACY_KEYS_CLEARED } : {});
    if (!ok) {
      return apiError("automation_update_failed", "Regel konnte nicht aktualisiert werden", 502);
    }
    return apiSuccess({ rule: { ...updated, fired_keys: undefined } });
  }
);

export const DELETE = createHandler(
  {
    action: "workflow.approve",
    rateTier: "standard",
    body: deleteSchema,
    audit: (_ctx, body) => ({
      action: "automation.delete" as const,
      entityType: "automation",
      entityId: body.slug,
      details: {},
    }),
  },
  async (ctx, body) => {
    // Only ever delete a rule — never an arbitrary page named by the caller.
    if (!(await findRule(ctx, body.slug))) {
      return apiError("automation_not_found", "Regel nicht gefunden", 404);
    }
    if (!(await deleteAutomation(ctx, body.slug))) {
      return apiError("automation_delete_failed", "Regel konnte nicht gelöscht werden", 502);
    }
    return apiSuccess({ deleted: body.slug });
  }
);
