import { z } from "zod";
import { NextRequest } from "next/server";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { enginePatchPage } from "@/lib/engine";
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGER_TYPES,
  buildAutomationRuleFrontmatter,
  fmToAutomationRule,
  parseAutomationAction,
  parseAutomationTrigger,
  type AutomationRule,
} from "@/lib/automation-rules";
import { ENGINE_URL } from "@/lib/engine";
import { logger } from "@/lib/logger";

const log = logger("api/automation-rules");

export const maxDuration = 30;

const triggerSchema = z.object({
  type: z.enum(AUTOMATION_TRIGGER_TYPES as [string, ...string[]]),
  days: z.number().int().min(0).max(365).optional(),
});

const actionSchema = z.object({
  type: z.enum(AUTOMATION_ACTION_TYPES as [string, ...string[]]),
  text: z.string().min(1).max(500).optional(),
  status: z.string().min(1).max(100).optional(),
  dueInDays: z.number().int().min(0).max(365).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  trigger: triggerSchema,
  actions: z.array(actionSchema).min(1).max(5),
});

const mutateSchema = z.object({
  slug: z.string().min(1).max(300),
  enabled: z.boolean().optional(),
  delete: z.boolean().optional(),
});

async function listRules(headers: Record<string, string>): Promise<AutomationRule[]> {
  const res = await fetch(`${ENGINE_URL}/api/pages?type=automation_rule&limit=200`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { pages?: unknown[] } | unknown[];
  const pages = Array.isArray(data) ? data : (data.pages ?? []);
  return pages
    .map((p) => fmToAutomationRule(p as Parameters<typeof fmToAutomationRule>[0]))
    .filter((r): r is AutomationRule => r !== null);
}

export const GET = createHandler({ action: "brain.read", rateTier: "standard" }, async (ctx) => {
  const rules = await listRules(ctx.headers);
  return apiSuccess({ rules });
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (_ctx, b) => ({
      action: "workflow.update" as const,
      entityType: "automation_rule",
      details: { name: b.name, trigger: b.trigger.type },
    }),
  },
  async (ctx, body) => {
    const trigger = parseAutomationTrigger(body.trigger);
    const actions = body.actions
      .map(parseAutomationAction)
      .filter((a): a is NonNullable<typeof a> => a !== null);
    if (!trigger) return apiError("invalid_trigger", "Ungültiger Auslöser", 400);
    if (actions.length === 0 || actions.length !== body.actions.length) {
      return apiError(
        "invalid_action",
        "Mindestens eine gültige Aktion erforderlich (set_status benötigt einen Status)",
        400
      );
    }
    const slug = `legal/automation-rules/${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const frontmatter = buildAutomationRuleFrontmatter({
      name: body.name,
      trigger,
      actions,
      createdBy: ctx.user?.email ?? undefined,
    });
    const res = await enginePatchPage(
      ctx.headers,
      {
        slug,
        title: body.name,
        type: "automation_rule",
        frontmatter,
        content: `# ${body.name}\n\nAutomatisierungsregel (wenn-dann).`,
      },
      { timeoutMs: 15_000 }
    );
    if (!res.ok) {
      log.error("rule create failed", res.status);
      return apiError("create_failed", "Regel konnte nicht gespeichert werden", 502);
    }
    return apiSuccess({ slug });
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: mutateSchema,
    audit: (_ctx, b) => ({
      action: (b.delete ? "workflow.delete" : "workflow.update") as
        | "workflow.delete"
        | "workflow.update",
      entityType: "automation_rule",
      entityId: b.slug,
      details: { enabled: b.enabled, delete: b.delete },
    }),
  },
  async (ctx, body, _query, _req: NextRequest) => {
    const frontmatter: Record<string, unknown> = {};
    if (body.delete) {
      frontmatter.status = "tombstoned";
      frontmatter.tombstoned_at = new Date().toISOString();
      frontmatter.tombstone_reason = "automation_rule_deleted";
    } else if (typeof body.enabled === "boolean") {
      frontmatter.enabled = body.enabled;
    } else {
      return apiError("nothing_to_update", "Keine Änderung angegeben", 400);
    }
    const res = await enginePatchPage(
      ctx.headers,
      { slug: body.slug, frontmatter },
      { timeoutMs: 15_000 }
    );
    if (!res.ok) {
      log.error("rule mutate failed", res.status);
      return apiError("update_failed", "Regel konnte nicht aktualisiert werden", 502);
    }
    return apiSuccess({ ok: true });
  }
);
