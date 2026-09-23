/**
 * ALTMODELL — nur noch Lesen für die Übernahme.
 *
 * Bis 2026-09 legte die Oberfläche Regeln als Seiten vom Typ
 * `automation_rule` an (ein Trigger, mehrere Aktionen). Ausgeführt wurden
 * sie nie. Das eine Regelmodell ist heute `automation` (automation-model.ts);
 * automation-migration.ts übernimmt Altregeln mit diesen Parsern.
 * Nichts schreibt mehr Seiten dieses Typs.
 */

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
