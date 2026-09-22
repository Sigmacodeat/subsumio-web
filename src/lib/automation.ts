/**
 * Workflow-Trigger / Automatisierungsregeln (WP-4.17): „Wenn X, dann Y".
 *
 * Regeln werden als Engine-Seiten vom Typ `automation` persistiert
 * (gleiches Muster wie `workflow`-Instanzen). `dispatchAutomations`
 * wird von Ereignis-Quellen (Buchung, Dokument-Upload, Frist-Anlage …)
 * aufgerufen, lädt die aktiven Regeln der Brain und führt die passenden
 * Aktionen aus. Fehler einzelner Regeln werden gesammelt statt geworfen,
 * damit ein fehlerhafter Trigger den fachlichen Ablauf nicht blockiert.
 */

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { sendMail } from "@/lib/mail";
import {
  buildWorkflowFrontmatter,
  buildWorkflowSlug,
  buildWorkflowTitle,
  getTemplate,
} from "@/lib/workflow";
import { logger } from "@/lib/logger";

const log = logger("automation");

// ── Types ────────────────────────────────────────────────────────────

export const TRIGGER_EVENTS = [
  "document.uploaded",
  "deadline.created",
  "deadline.due_soon",
  "case.created",
  "case.status_changed",
  "message.received",
  "booking.created",
  "invoice.overdue",
] as const;

export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

export const TRIGGER_EVENT_LABELS: Record<TriggerEvent, string> = {
  "document.uploaded": "Dokument hochgeladen",
  "deadline.created": "Frist angelegt",
  "deadline.due_soon": "Frist läuft bald ab",
  "case.created": "Akte angelegt",
  "case.status_changed": "Aktenstatus geändert",
  "message.received": "Nachricht eingegangen",
  "booking.created": "Termin gebucht",
  "invoice.overdue": "Rechnung überfällig",
};

export const TRIGGER_ACTION_TYPES = [
  "create_task",
  "notify",
  "send_mail",
  "start_workflow",
] as const;

export type TriggerActionType = (typeof TRIGGER_ACTION_TYPES)[number];

export const TRIGGER_ACTION_LABELS: Record<TriggerActionType, string> = {
  create_task: "Aufgabe in der Akte anlegen",
  notify: "In-App-Benachrichtigung",
  send_mail: "E-Mail senden",
  start_workflow: "Workflow starten",
};

export interface AutomationAction {
  type: TriggerActionType;
  /** Titel-Template mit {platzhaltern} aus dem Event-Payload. */
  title?: string;
  /** Nachricht/Beschreibung-Template. */
  message?: string;
  /** create_task: Name des Zuständigen. */
  assignee?: string;
  /** create_task: Fälligkeit in Tagen ab Event. */
  due_in_days?: number;
  /** start_workflow: ID aus WORKFLOW_TEMPLATES. */
  workflow_template_id?: string;
  /** send_mail: Empfänger-Adresse (oder {key} aus dem Payload). */
  recipient?: string;
}

export interface AutomationRule {
  slug: string;
  name: string;
  enabled: boolean;
  event: TriggerEvent;
  /** Gleichheitsfilter auf Payload-Felder (z. B. { channel: "whatsapp" }). */
  filters?: Record<string, string>;
  action: AutomationAction;
  /** Idempotenz-Keys zustandsbasierter Trigger (deadline.due_soon,
   *  invoice.overdue): der Cron merkt sich hier, für welche Entities die
   *  Regel bereits gefeuert hat. FIFO-gekappt auf MAX_FIRED_KEYS. */
  fired_keys?: string[];
  created_at: string;
  created_by: string;
}

/** Cap der Idempotenz-Keys pro Regel (FIFO-Verdrängung, älteste zuerst). */
export const MAX_FIRED_KEYS = 500;

/** Verdrängt alte Keys bei Überschreitung des Caps (FIFO). */
export function mergeFiredKeys(existing: string[] | undefined, newKeys: string[]): string[] {
  const merged = [...(existing ?? [])];
  for (const k of newKeys) if (!merged.includes(k)) merged.push(k);
  return merged.slice(-MAX_FIRED_KEYS);
}

/** Payload, das Ereignis-Quellen an dispatchAutomations übergeben. */
export interface AutomationEventPayload {
  case_slug?: string;
  title?: string;
  [key: string]: unknown;
}

// ── Pure helpers ─────────────────────────────────────────────────────

function payloadValue(payload: AutomationEventPayload, path: string): unknown {
  let cur: unknown = payload;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Ersetzt {feld} / {feld.sub} Platzhalter aus dem Event-Payload. */
export function interpolateTemplate(template: string, payload: AutomationEventPayload): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_m, key: string) => {
    const v = payloadValue(payload, key);
    return v === undefined || v === null ? "" : String(v);
  });
}

/** True, wenn die Regel auf das Event passt (Event-Typ + alle Filter). */
export function ruleMatches(
  rule: AutomationRule,
  event: TriggerEvent,
  payload: AutomationEventPayload
): boolean {
  if (!rule.enabled || rule.event !== event) return false;
  for (const [key, expected] of Object.entries(rule.filters ?? {})) {
    const actual = payloadValue(payload, key);
    if (String(actual ?? "") !== expected) return false;
  }
  return true;
}

export function buildAutomationSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `automation-${base || "regel"}-${Date.now().toString(36)}`;
}

// ── Persistence (Engine-Seiten, type: "automation") ──────────────────

interface EnginePage {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
}

export function fmToAutomation(page: EnginePage): AutomationRule | null {
  const fm = page.frontmatter;
  if (!fm || fm.type !== "automation") return null;
  const event = fm.event;
  const action = fm.action;
  if (typeof event !== "string" || !TRIGGER_EVENTS.includes(event as TriggerEvent)) {
    return null;
  }
  if (!action || typeof action !== "object") return null;
  const a = action as Record<string, unknown>;
  if (typeof a.type !== "string" || !TRIGGER_ACTION_TYPES.includes(a.type as TriggerActionType)) {
    return null;
  }
  return {
    slug: page.slug,
    name: page.title,
    enabled: fm.enabled !== false,
    event: event as TriggerEvent,
    filters:
      fm.filters && typeof fm.filters === "object"
        ? (fm.filters as Record<string, string>)
        : undefined,
    action: {
      type: a.type as TriggerActionType,
      title: typeof a.title === "string" ? a.title : undefined,
      message: typeof a.message === "string" ? a.message : undefined,
      assignee: typeof a.assignee === "string" ? a.assignee : undefined,
      due_in_days: typeof a.due_in_days === "number" ? a.due_in_days : undefined,
      workflow_template_id:
        typeof a.workflow_template_id === "string" ? a.workflow_template_id : undefined,
      recipient: typeof a.recipient === "string" ? a.recipient : undefined,
    },
    fired_keys: Array.isArray(fm.fired_keys)
      ? (fm.fired_keys.filter((k) => typeof k === "string") as string[]).slice(-MAX_FIRED_KEYS)
      : undefined,
    created_at: typeof fm.created_at === "string" ? fm.created_at : "",
    created_by: typeof fm.created_by === "string" ? fm.created_by : "",
  };
}

export function automationToFrontmatter(rule: AutomationRule): Record<string, unknown> {
  return {
    type: "automation",
    enabled: rule.enabled,
    event: rule.event,
    filters: rule.filters ?? {},
    action: rule.action,
    fired_keys: rule.fired_keys ?? [],
    created_at: rule.created_at,
    created_by: rule.created_by,
  };
}

async function engineFetch(brainId: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: { ...engineHeadersForBrain(brainId), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
}

export async function listAutomations(brainId: string): Promise<AutomationRule[]> {
  const res = await engineFetch(brainId, "/api/pages?type=automation&limit=200");
  if (!res.ok) return [];
  const raw = await res.json();
  const pages = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.pages)
      ? ((raw as Record<string, unknown>).pages as EnginePage[])
      : [];
  return pages
    .map((p) => fmToAutomation(p as EnginePage))
    .filter((r): r is AutomationRule => r !== null);
}

export async function saveAutomation(brainId: string, rule: AutomationRule): Promise<boolean> {
  const res = await engineFetch(brainId, "/api/pages", {
    method: "POST",
    body: JSON.stringify({
      slug: rule.slug,
      title: rule.name,
      type: "automation",
      content: `${TRIGGER_EVENT_LABELS[rule.event]} → ${TRIGGER_ACTION_LABELS[rule.action.type]}`,
      frontmatter: automationToFrontmatter(rule),
    }),
  });
  return res.ok;
}

export async function updateAutomation(brainId: string, rule: AutomationRule): Promise<boolean> {
  // Die Engine kennt kein PUT auf /api/pages — Merge-Update via POST.
  const res = await engineFetch(brainId, "/api/pages", {
    method: "POST",
    body: JSON.stringify({
      slug: rule.slug,
      title: rule.name,
      type: "automation",
      merge: true,
      frontmatter: automationToFrontmatter(rule),
    }),
  });
  return res.ok;
}

export async function deleteAutomation(brainId: string, slug: string): Promise<boolean> {
  const res = await engineFetch(brainId, `/api/pages/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
  return res.ok;
}

// ── Dispatcher ───────────────────────────────────────────────────────

export interface DispatchResult {
  matched: number;
  executed: number;
  errors: string[];
}

async function executeAction(
  brainId: string,
  rule: AutomationRule,
  payload: AutomationEventPayload
): Promise<void> {
  const a = rule.action;
  const title = interpolateTemplate(a.title ?? rule.name, payload);
  const message = interpolateTemplate(a.message ?? "", payload);

  switch (a.type) {
    case "notify":
      broadcastSseEvent(brainId, "automation.fired", {
        rule: rule.slug,
        event: rule.event,
        title,
        message,
        case_slug: payload.case_slug,
      });
      return;

    case "send_mail": {
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
      if (!caseSlug) throw new Error("create_task: kein case_slug im Event");
      const pageRes = await engineFetch(brainId, `/api/pages/${encodeURIComponent(caseSlug)}`);
      if (!pageRes.ok) throw new Error(`create_task: Akte ${caseSlug} nicht lesbar`);
      const page = (await pageRes.json()) as EnginePage;
      const tasks = Array.isArray(page.frontmatter?.tasks)
        ? (page.frontmatter!.tasks as Array<Record<string, unknown>>)
        : [];
      const dueDate =
        typeof a.due_in_days === "number" && a.due_in_days > 0
          ? new Date(Date.now() + a.due_in_days * 86_400_000).toISOString().slice(0, 10)
          : undefined;
      tasks.push({
        id: `auto-${Date.now().toString(36)}`,
        text: title,
        done: false,
        ...(dueDate ? { dueDate } : {}),
        ...(a.assignee ? { assigneeName: a.assignee } : {}),
        createdAt: new Date().toISOString(),
        source: `automation:${rule.slug}`,
      });
      const putRes = await engineFetch(brainId, `/api/pages/${encodeURIComponent(caseSlug)}`, {
        method: "PUT",
        body: JSON.stringify({
          frontmatter: { ...(page.frontmatter ?? {}), tasks },
        }),
      });
      if (!putRes.ok) throw new Error("create_task: Schreiben fehlgeschlagen");
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
      const res = await engineFetch(brainId, "/api/pages", {
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
 * Ereignis-Quellen rufen diese Funktion fire-and-forget auf. Lädt die
 * aktiven Regeln, führt passende Aktionen aus und liefert ein Ergebnis —
 * wirft nie, damit der fachliche Ablauf nicht blockiert wird.
 */
export async function dispatchAutomations(
  brainId: string,
  event: TriggerEvent,
  payload: AutomationEventPayload
): Promise<DispatchResult> {
  const result: DispatchResult = { matched: 0, executed: 0, errors: [] };
  try {
    const rules = await listAutomations(brainId);
    const matching = rules.filter((r) => ruleMatches(r, event, payload));
    result.matched = matching.length;
    for (const rule of matching) {
      try {
        await executeAction(brainId, rule, payload);
        result.executed += 1;
      } catch (err) {
        const msg = `${rule.slug}: ${err instanceof Error ? err.message : "unknown"}`;
        result.errors.push(msg);
        log.warn("automation action failed", { rule: rule.slug, error: msg });
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "dispatch failed");
    log.warn("automation dispatch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return result;
}
