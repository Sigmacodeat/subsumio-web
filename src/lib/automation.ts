/**
 * Workflow-Trigger / Automatisierungsregeln (WP-4.17): „Wenn X, dann Y".
 *
 * Server-Seite des einen Regelmodells (automation-model.ts): Persistenz als
 * Engine-Seiten vom Typ `automation` und die Ausführung der Aktionen. Der
 * Cron (/api/cron/automations) wertet die Regeln aus; `dispatchAutomations`
 * steht Ereignis-Quellen für die sofortige Auslösung zur Verfügung. Fehler
 * einzelner Regeln werden gesammelt statt geworfen, damit ein fehlerhafter
 * Trigger den fachlichen Ablauf nicht blockiert.
 */

import { ENGINE_URL, engineHeadersForBrain, engineHeadersForUserId } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { broadcastSseEvent, broadcastSseEventToUser } from "@/lib/realtime-bus";
import { sendMail } from "@/lib/mail";
import {
  buildWorkflowFrontmatter,
  buildWorkflowSlug,
  buildWorkflowTitle,
  getTemplate,
} from "@/lib/workflow";
import { logger } from "@/lib/logger";
import {
  DEFAULT_EVENT_MESSAGES,
  automationStateFrontmatter,
  automationToFrontmatter,
  describeRule,
  fmToAutomation,
  interpolateTemplate,
  isCaseStatus,
  ruleMatches,
  ruleSendsExternally,
  type AutomationAction,
  type AutomationEventPayload,
  type AutomationPage,
  type AutomationRule,
  type AutomationRunState,
  type TriggerEvent,
} from "@/lib/automation-model";

export * from "@/lib/automation-model";

const log = logger("automation");

/** Höchstzahl gelesener Regeln je Kanzlei (Engine liefert je Abruf 100). */
const MAX_RULES = 500;

/**
 * Who a rule call is made for: a route passes its `ctx` (identity-bearing
 * headers, so the engine applies the matter access rules to the signed-in
 * user); the automations cron, which has no user, passes the firm's brainId.
 */
export type AutomationCaller = string | { headers: Record<string, string> };

function callerHeaders(caller: AutomationCaller): Record<string, string> {
  return typeof caller === "string" ? engineHeadersForBrain(caller) : caller.headers;
}

async function engineFetch(
  caller: AutomationCaller,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: { ...callerHeaders(caller), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
}

// ── Persistenz (Engine-Seiten, type: "automation") ───────────────────

export async function listAutomations(caller: AutomationCaller): Promise<AutomationRule[]> {
  // Paged: the engine returns at most 100 pages per request.
  const pages = await listEnginePages(callerHeaders(caller), "automation", MAX_RULES);
  return pages
    .map((p) => fmToAutomation({ ...p, type: p.type ?? "automation" } as AutomationPage))
    .filter((r): r is AutomationRule => r !== null);
}

export async function saveAutomation(
  caller: AutomationCaller,
  rule: AutomationRule
): Promise<boolean> {
  const res = await engineFetch(caller, "/api/pages", {
    method: "POST",
    body: JSON.stringify({
      slug: rule.slug,
      title: rule.name,
      type: "automation",
      content: describeRule(rule),
      frontmatter: automationToFrontmatter(rule),
    }),
  });
  return res.ok;
}

export async function updateAutomation(
  caller: AutomationCaller,
  rule: AutomationRule,
  extraFrontmatter: Record<string, unknown> = {}
): Promise<boolean> {
  // Die Engine kennt kein PUT auf /api/pages — Merge-Update via POST.
  const res = await engineFetch(caller, "/api/pages", {
    method: "POST",
    body: JSON.stringify({
      slug: rule.slug,
      title: rule.name,
      type: "automation",
      merge: true,
      content: describeRule(rule),
      frontmatter: { ...automationToFrontmatter(rule), ...extraFrontmatter },
    }),
  });
  return res.ok;
}

/**
 * Schreibt nur den Laufzustand (fired_keys, Pause, letzter Lauf/Fehler).
 * Name, Aktivierung, Auslöser und Aktionen bleiben unberührt — ein Cron-Lauf
 * überschreibt so keine Änderung, die jemand parallel gespeichert hat.
 */
export async function patchAutomationState(
  caller: AutomationCaller,
  slug: string,
  state: AutomationRunState,
  clear: Array<keyof AutomationRunState> = []
): Promise<boolean> {
  const res = await engineFetch(caller, "/api/pages", {
    method: "POST",
    body: JSON.stringify({
      slug,
      type: "automation",
      merge: true,
      frontmatter: automationStateFrontmatter(state, clear),
    }),
  });
  return res.ok;
}

export async function deleteAutomation(caller: AutomationCaller, slug: string): Promise<boolean> {
  const res = await engineFetch(caller, `/api/pages/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
  return res.ok;
}

// ── Ausführung ───────────────────────────────────────────────────────

export interface DispatchResult {
  matched: number;
  executed: number;
  errors: string[];
  /** Rules not run: owner gone, owner may not see the matter, no owner for mail. */
  skipped?: number;
}

/** Ergebnis eines Regellaufs für ein Ereignis. */
export type RuleRunOutcome = "skipped" | { executed: number; errors: string[] };

/**
 * Run all actions of one rule for one event as `caller` (see
 * resolveRuleRunner). Skips — and logs — when the runner may not see the
 * event's matter. Actions run in order; a failing action does not stop the
 * next one. Never throws.
 */
export async function runAutomationRule(
  brainId: string,
  rule: AutomationRule,
  payload: AutomationEventPayload,
  caller: AutomationCaller
): Promise<RuleRunOutcome> {
  try {
    if (!(await runnerSeesMatter(caller, payload))) {
      log.warn("automation skipped: owner may not see the matter", { rule: rule.slug });
      return "skipped";
    }
  } catch (err) {
    return { executed: 0, errors: [`${rule.slug}: ${errorText(err)}`] };
  }
  let executed = 0;
  const errors: string[] = [];
  for (const action of rule.actions) {
    try {
      await executeAction(brainId, rule, action, payload, caller);
      executed++;
    } catch (err) {
      const msg = `${rule.slug}: ${errorText(err)}`;
      log.warn("automation action failed", { rule: rule.slug, action: action.type, error: msg });
      errors.push(msg);
    }
  }
  return { executed, errors };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "unknown";
}

/**
 * Who a rule runs as:
 *   - its owner (identity-bearing headers — the engine applies the owner's
 *     matter access to every read and write of the rule);
 *   - the firm, for rules without owner that send nothing out;
 *   - nobody (skip) when the owner no longer exists or left the firm, or an
 *     ownerless rule would send content out.
 */
export type RuleRunner =
  | { ok: true; caller: AutomationCaller; ownerId?: string }
  | { ok: false; reason: "owner_missing" | "owner_inactive" };

export async function resolveRuleRunner(
  brainId: string,
  rule: AutomationRule
): Promise<RuleRunner> {
  if (!rule.owner_user_id) {
    return ruleSendsExternally(rule)
      ? { ok: false, reason: "owner_missing" }
      : { ok: true, caller: brainId };
  }
  const owner = await engineHeadersForUserId(rule.owner_user_id).catch(() => null);
  // Deleted, deactivated, suspended — or now working in another firm's brain.
  if (!owner || owner.headers["x-subsumio-source"] !== brainId) {
    return { ok: false, reason: "owner_inactive" };
  }
  return { ok: true, caller: { headers: owner.headers }, ownerId: rule.owner_user_id };
}

export interface RuleGroup {
  label: string;
  caller: AutomationCaller;
  rules: AutomationRule[];
}

/**
 * Splits a firm's active rules by whom they run for. Ownerless rules that
 * would send content out are paused (visible on the rule) instead of run;
 * rules whose owner no longer works in this firm are skipped.
 */
export async function groupRulesByRunner(
  brainId: string,
  rules: AutomationRule[],
  resolve: typeof resolveRuleRunner = resolveRuleRunner
): Promise<{ groups: RuleGroup[]; paused: AutomationRule[]; skipped: AutomationRule[] }> {
  const groups = new Map<string, RuleGroup>();
  const paused: AutomationRule[] = [];
  const skipped: AutomationRule[] = [];
  for (const rule of rules) {
    const runner = await resolve(brainId, rule);
    if (!runner.ok) {
      if (runner.reason === "owner_missing") paused.push(rule);
      else skipped.push(rule);
      continue;
    }
    const key = runner.ownerId ?? "";
    const group = groups.get(key) ?? {
      label: runner.ownerId ? `owner:${runner.ownerId}` : "firm",
      caller: runner.caller,
      rules: [],
    };
    group.rules.push(rule);
    groups.set(key, group);
  }
  return { groups: [...groups.values()], paused, skipped };
}

/** True when the rule's runner may see the matter the event is about. */
async function runnerSeesMatter(
  caller: AutomationCaller,
  payload: AutomationEventPayload
): Promise<boolean> {
  if (typeof caller === "string" || !payload.case_slug) return true;
  const res = await engineFetch(caller, `/api/pages/${encodeURIComponent(payload.case_slug)}`);
  return res.ok;
}

async function readCase(
  caller: AutomationCaller,
  caseSlug: string,
  what: string
): Promise<AutomationPage> {
  const res = await engineFetch(caller, `/api/pages/${encodeURIComponent(caseSlug)}`);
  if (!res.ok) throw new Error(`${what}: Akte ${caseSlug} nicht lesbar`);
  return (await res.json()) as AutomationPage;
}

/** Merge-Update einzelner Frontmatter-Felder einer Akte. */
async function patchCase(
  caller: AutomationCaller,
  caseSlug: string,
  frontmatter: Record<string, unknown>,
  what: string
): Promise<void> {
  const res = await engineFetch(caller, "/api/pages", {
    method: "POST",
    body: JSON.stringify({ slug: caseSlug, merge: true, frontmatter }),
  });
  if (!res.ok) throw new Error(`${what}: Schreiben fehlgeschlagen`);
}

async function executeAction(
  brainId: string,
  rule: AutomationRule,
  a: AutomationAction,
  payload: AutomationEventPayload,
  caller: AutomationCaller = brainId
): Promise<void> {
  const title = interpolateTemplate(a.title ?? rule.name, payload);
  const message = interpolateTemplate(a.message ?? "", payload);

  switch (a.type) {
    case "notify": {
      const data = {
        rule: rule.slug,
        event: rule.event,
        title,
        message: message || interpolateTemplate(DEFAULT_EVENT_MESSAGES[rule.event], payload),
        case_slug: payload.case_slug,
      };
      // Matter events go to the rule's owner only: colleagues behind an
      // ethical wall must not receive them through the firm-wide stream.
      if (payload.case_slug && rule.owner_user_id) {
        broadcastSseEventToUser(brainId, rule.owner_user_id, "automation.fired", data);
      } else {
        broadcastSseEvent(brainId, "automation.fired", data);
      }
      return;
    }

    case "send_mail": {
      // Defence in depth: the cron never runs an ownerless mail rule.
      if (!rule.owner_user_id) throw new Error("send_mail: Regel hat keinen Besitzer");
      const recipient = interpolateTemplate(a.recipient ?? "", payload);
      if (!recipient || !recipient.includes("@")) {
        throw new Error("send_mail: kein gültiger Empfänger");
      }
      await sendMail({
        to: recipient,
        subject: title || `Automatisierung: ${rule.name}`,
        text: message || title,
      });
      return;
    }

    case "create_task": {
      const caseSlug = payload.case_slug;
      if (!caseSlug) throw new Error("create_task: Ereignis gehört zu keiner Akte");
      const page = await readCase(caller, caseSlug, "create_task");
      const tasks = Array.isArray(page.frontmatter?.tasks)
        ? (page.frontmatter!.tasks as Array<Record<string, unknown>>)
        : [];
      const dueDate =
        typeof a.due_in_days === "number" && a.due_in_days > 0
          ? new Date(Date.now() + a.due_in_days * 86_400_000).toISOString().slice(0, 10)
          : undefined;
      const task = {
        id: `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        text: title,
        done: false,
        ...(dueDate ? { dueDate } : {}),
        ...(a.assignee ? { assigneeName: a.assignee } : {}),
        createdAt: new Date().toISOString(),
        source: `automation:${rule.slug}`,
      };
      await patchCase(caller, caseSlug, { tasks: [...tasks, task] }, "create_task");
      return;
    }

    case "set_status": {
      const caseSlug = payload.case_slug;
      if (!caseSlug) throw new Error("set_status: Ereignis gehört zu keiner Akte");
      if (!isCaseStatus(a.status)) throw new Error(`set_status: unbekannter Status '${a.status}'`);
      const page = await readCase(caller, caseSlug, "set_status");
      if (page.frontmatter?.status === a.status) return;
      await patchCase(caller, caseSlug, { status: a.status }, "set_status");
      return;
    }

    case "start_workflow": {
      const tplId = a.workflow_template_id ?? "";
      const template = getTemplate(tplId);
      if (!template) throw new Error(`start_workflow: Template '${tplId}' unbekannt`);
      const frontmatter = buildWorkflowFrontmatter({
        template_id: tplId,
        prompt: message || template.prompt,
        started_by: `automation:${rule.slug}`,
        case_slug: payload.case_slug,
      });
      const res = await engineFetch(caller, "/api/pages", {
        method: "POST",
        body: JSON.stringify({
          slug: buildWorkflowSlug(tplId),
          title: buildWorkflowTitle(template),
          type: "workflow",
          content: message || template.prompt,
          frontmatter,
        }),
      });
      if (!res.ok) throw new Error("start_workflow: Anlage fehlgeschlagen");
      return;
    }
  }
}

/**
 * Sofort-Auslösung für Ereignis-Quellen (fire-and-forget). Lädt die aktiven
 * Regeln, führt passende Aktionen aus und liefert ein Ergebnis — wirft nie.
 * Der Cron merkt sich nichts davon; Quellen, die dies nutzen, dürfen dasselbe
 * Ereignis nicht zusätzlich vom Cron beobachten lassen.
 */
export async function dispatchAutomations(
  brainId: string,
  event: TriggerEvent,
  payload: AutomationEventPayload
): Promise<DispatchResult> {
  const result: DispatchResult = { matched: 0, executed: 0, errors: [], skipped: 0 };
  try {
    const rules = await listAutomations(brainId);
    const matching = rules.filter((r) => !r.paused_reason && ruleMatches(r, event, payload));
    result.matched = matching.length;
    for (const rule of matching) {
      const runner = await resolveRuleRunner(brainId, rule);
      if (!runner.ok) {
        result.skipped = (result.skipped ?? 0) + 1;
        log.warn("automation skipped", { rule: rule.slug, reason: runner.reason });
        continue;
      }
      const outcome = await runAutomationRule(brainId, rule, payload, runner.caller);
      if (outcome === "skipped") {
        result.skipped = (result.skipped ?? 0) + 1;
        continue;
      }
      if (outcome.executed > 0) result.executed += 1;
      result.errors.push(...outcome.errors);
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "dispatch failed");
    log.warn("automation dispatch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return result;
}
