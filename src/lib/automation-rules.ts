/**
 * WP-4.17 — Workflow-Engine „wenn X dann Y" (Automation Rules).
 *
 * Eine Regel ist eine Brain-Page (type="automation_rule") mit einem Trigger
 * und einer Liste von Aktionen. Der Cron-Evaluator
 * (`/api/cron/automations`) lädt alle aktiven Regeln je Brain, prüft die
 * Trigger-Bedingungen gegen Cases/Deadlines/Rechnungen/Dokumente und führt
 * die Aktionen aus.
 *
 * Idempotenz: `fired_keys` auf der Regel-Page merkt sich pro Entity, dass
 * die Regel bereits gefeuert hat — ein Deadline-Reminder feuert also genau
 * einmal pro Frist, nicht bei jedem Cron-Lauf. Keys sind auf
 * MAX_FIRED_KEYS gekappt (älteste werden verdrängt, FIFO).
 */

import type { EnginePage } from "@/lib/cron-utils";

// ── Types ──────────────────────────────────────────────────────────────

export type AutomationTriggerType =
  | "case_created"
  | "deadline_approaching"
  | "invoice_overdue"
  | "document_uploaded"
  | "booking_created";

export const AUTOMATION_TRIGGER_TYPES: readonly AutomationTriggerType[] = [
  "case_created",
  "deadline_approaching",
  "invoice_overdue",
  "document_uploaded",
  "booking_created",
];

export type AutomationActionType = "create_task" | "notify_kanzlei" | "set_status";

export const AUTOMATION_ACTION_TYPES: readonly AutomationActionType[] = [
  "create_task",
  "notify_kanzlei",
  "set_status",
];

export interface AutomationTrigger {
  type: AutomationTriggerType;
  /** deadline_approaching: feuert wenn due_date <= now + days. */
  days?: number;
}

export interface AutomationAction {
  type: AutomationActionType;
  /** create_task: Aufgabentext. */
  text?: string;
  /** create_task: Fälligkeit der Aufgabe in Tagen ab jetzt. */
  dueInDays?: number;
  /** set_status: neuer Case-Status. */
  status?: string;
}

export interface AutomationRule {
  slug: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  /** Entity-Keys für die die Regel bereits gefeuert hat (Idempotenz). */
  firedKeys: string[];
  createdBy?: string;
  createdAt?: string;
  lastRunAt?: string;
}

/** Eine ausgelöste Regel-Ausführung — vom Cron verarbeitet. */
export interface AutomationFire {
  rule: AutomationRule;
  /** Eindeutiger Idempotenz-Key für diese Entity-Auslösung. */
  fireKey: string;
  /** Case-Slug, auf den sich die Aktion bezieht (leer = brain-weit). */
  caseSlug: string;
  /** Menschenlesbarer Kontext (z.B. "Frist 'Berufung' in 3 Tagen"). */
  context: string;
  action: AutomationAction;
}

/** Cap der Idempotenz-Keys pro Regel (FIFO-Verdrängung). */
export const MAX_FIRED_KEYS = 500;

// ── Parsing ────────────────────────────────────────────────────────────

function str(v: unknown, max = 500): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

export function parseAutomationTrigger(raw: unknown): AutomationTrigger | null {
  if (!raw || typeof raw !== "object") return null;
  const t = (raw as Record<string, unknown>).type;
  if (!AUTOMATION_TRIGGER_TYPES.includes(t as AutomationTriggerType)) return null;
  const days = (raw as Record<string, unknown>).days;
  const trigger: AutomationTrigger = { type: t as AutomationTriggerType };
  if (typeof days === "number" && Number.isInteger(days) && days >= 0 && days <= 365) {
    trigger.days = days;
  }
  return trigger;
}

export function parseAutomationAction(raw: unknown): AutomationAction | null {
  if (!raw || typeof raw !== "object") return null;
  const t = (raw as Record<string, unknown>).type;
  if (!AUTOMATION_ACTION_TYPES.includes(t as AutomationActionType)) return null;
  const o = raw as Record<string, unknown>;
  const action: AutomationAction = { type: t as AutomationActionType };
  if (str(o.text)) action.text = str(o.text);
  if (str(o.status)) action.status = str(o.status, 100);
  const dueInDays = o.dueInDays;
  if (
    typeof dueInDays === "number" &&
    Number.isInteger(dueInDays) &&
    dueInDays >= 0 &&
    dueInDays <= 365
  ) {
    action.dueInDays = dueInDays;
  }
  // set_status braucht einen Status — sonst ist die Aktion wirkungslos.
  if (action.type === "set_status" && !action.status) return null;
  return action;
}

export function fmToAutomationRule(page: EnginePage): AutomationRule | null {
  const fm = page.frontmatter ?? {};
  // Tombstoned (via PATCH delete:true) = gelöscht — weder listen noch feuern.
  if (fm.status === "tombstoned") return null;
  const trigger = parseAutomationTrigger(fm.trigger);
  if (!trigger) return null;
  const actions = Array.isArray(fm.actions)
    ? fm.actions.map(parseAutomationAction).filter((a): a is AutomationAction => a !== null)
    : [];
  if (actions.length === 0) return null;
  return {
    slug: page.slug,
    name: str(fm.name, 200) ?? page.title ?? page.slug,
    enabled: fm.enabled !== false,
    trigger,
    actions,
    firedKeys: Array.isArray(fm.fired_keys)
      ? fm.fired_keys.filter((k): k is string => typeof k === "string").slice(-MAX_FIRED_KEYS)
      : [],
    createdBy: str(fm.created_by),
    createdAt: str(fm.created_at),
    lastRunAt: str(fm.last_run_at),
  };
}

export function buildAutomationRuleFrontmatter(rule: {
  name: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  createdBy?: string;
}): Record<string, unknown> {
  return {
    type: "automation_rule",
    name: rule.name.slice(0, 200),
    enabled: true,
    trigger: rule.trigger,
    actions: rule.actions,
    fired_keys: [],
    created_by: rule.createdBy,
    created_at: new Date().toISOString(),
  };
}

// ── Evaluation ─────────────────────────────────────────────────────────

function daysUntil(iso: string, now: Date): number | null {
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const msPerDay = 86_400_000;
  return Math.ceil((due.getTime() - now.getTime()) / msPerDay);
}

function caseSlugOf(page: EnginePage): string {
  const fm = page.frontmatter ?? {};
  return typeof fm.case_slug === "string" ? fm.case_slug : page.slug;
}

interface DeadlineLike {
  id?: string;
  title?: string;
  due_date?: string;
  status?: string;
}

/**
 * Reine Auswertung: welche Regeln feuern auf welche Entities?
 * Gibt flache AutomationFire-Liste zurück — der Cron führt sie aus.
 * Bereits gefeuerte Keys werden übersprungen (Idempotenz).
 */
export function evaluateAutomations(opts: {
  rules: AutomationRule[];
  cases: EnginePage[];
  invoices: EnginePage[];
  documents: EnginePage[];
  bookings?: EnginePage[];
  now?: Date;
}): AutomationFire[] {
  const now = opts.now ?? new Date();
  const fires: AutomationFire[] = [];

  for (const rule of opts.rules) {
    if (!rule.enabled) continue;
    const fired = new Set(rule.firedKeys);
    const push = (fireKey: string, caseSlug: string, context: string) => {
      if (fired.has(fireKey)) return;
      for (const action of rule.actions) {
        fires.push({ rule, fireKey, caseSlug, context, action });
      }
    };

    switch (rule.trigger.type) {
      case "case_created": {
        for (const c of opts.cases) {
          const title = c.title ?? c.slug;
          push(`case:${c.slug}`, c.slug, `Neue Akte angelegt: ${title}`);
        }
        break;
      }
      case "deadline_approaching": {
        const window = rule.trigger.days ?? 7;
        for (const c of opts.cases) {
          const deadlines = Array.isArray(c.frontmatter?.deadlines)
            ? (c.frontmatter.deadlines as DeadlineLike[])
            : [];
          for (const dl of deadlines) {
            if (!dl.due_date || dl.status === "done") continue;
            const left = daysUntil(dl.due_date, now);
            if (left === null || left < 0 || left > window) continue;
            const dlId = dl.id ?? dl.due_date;
            push(
              `deadline:${c.slug}:${dlId}`,
              c.slug,
              `Frist „${dl.title ?? "Frist"}" in Akte ${c.title ?? c.slug} läuft in ${left} Tag(en) ab (${dl.due_date})`
            );
          }
        }
        break;
      }
      case "invoice_overdue": {
        const today = now.toISOString().slice(0, 10);
        for (const inv of opts.invoices) {
          const fm = inv.frontmatter ?? {};
          if (fm.status === "paid" || fm.status === "draft" || fm.status === "cancelled") continue;
          const due = typeof fm.due_date === "string" ? fm.due_date : "";
          if (!due || due >= today) continue;
          const nr = typeof fm.invoice_number === "string" ? fm.invoice_number : inv.slug;
          const caseSlug = typeof fm.case_slug === "string" ? fm.case_slug : "";
          push(`invoice:${inv.slug}`, caseSlug, `Rechnung ${nr} ist seit ${due} überfällig`);
        }
        break;
      }
      case "document_uploaded": {
        for (const d of opts.documents) {
          const title = d.title ?? d.slug;
          push(`doc:${d.slug}`, caseSlugOf(d), `Dokument hochgeladen: ${title}`);
        }
        break;
      }
      case "booking_created": {
        for (const b of opts.bookings ?? []) {
          const fm = b.frontmatter ?? {};
          const name = typeof fm.client_name === "string" ? fm.client_name : b.title;
          const when =
            typeof fm.slot_start === "string"
              ? fm.slot_start
              : typeof fm.date === "string"
                ? fm.date
                : "";
          push(
            `booking:${b.slug}`,
            caseSlugOf(b),
            `Termin gebucht: ${name}${when ? ` (${when})` : ""}`
          );
        }
        break;
      }
    }
  }
  return fires;
}

/** Verdrängt alte Keys bei Überschreitung des Caps (FIFO). */
export function updatedFiredKeys(rule: AutomationRule, newKeys: string[]): string[] {
  const merged = [...rule.firedKeys];
  for (const k of newKeys) {
    if (!merged.includes(k)) merged.push(k);
  }
  return merged.slice(-MAX_FIRED_KEYS);
}
