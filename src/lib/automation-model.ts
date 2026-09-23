/**
 * Automatisierungsregeln „Wenn X, dann Y" — das EINE Regelmodell.
 *
 * Eine Regel ist eine Engine-Seite vom Typ `automation`. Die Oberfläche
 * (AutomationsPanel → /api/automations), der Copilot (create_automation_rule)
 * und der Cron (/api/cron/automations) lesen und schreiben genau dieses
 * Modell. Regeln des früheren UI-Modells (`automation_rule`) werden vom Cron
 * einmalig und idempotent hierher übernommen (automation-migration.ts).
 *
 * Diese Datei ist frei von Server-Abhängigkeiten, damit die Oberfläche
 * dieselben Typen, Beschriftungen und Regeln verwendet wie der Server.
 */

import { caseStatusSchema } from "@/lib/schemas/case";
import { pageTypeOf } from "@/lib/types";

// ── Auslöser ─────────────────────────────────────────────────────────

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

/** Auslöser-Namen des früheren UI-Modells und Schreibweisen mit Unterstrich. */
const TRIGGER_EVENT_ALIASES: Record<string, TriggerEvent> = {
  case_created: "case.created",
  deadline_approaching: "deadline.due_soon",
  invoice_overdue: "invoice.overdue",
  document_uploaded: "document.uploaded",
  booking_created: "booking.created",
  deadline_created: "deadline.created",
  deadline_due_soon: "deadline.due_soon",
  case_status_changed: "case.status_changed",
  message_received: "message.received",
};

/** Kanonischer Auslöser für eine Eingabe (auch Alt-Namen), sonst null. */
export function normalizeTriggerEvent(raw: unknown): TriggerEvent | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if ((TRIGGER_EVENTS as readonly string[]).includes(v)) return v as TriggerEvent;
  return TRIGGER_EVENT_ALIASES[v] ?? null;
}

/** deadline.due_soon: Vorlauf in Tagen, wenn die Regel keinen eigenen hat. */
export const DEFAULT_DUE_SOON_DAYS = 7;
export const MAX_DUE_SOON_DAYS = 365;

// ── Aktionen ─────────────────────────────────────────────────────────

export const TRIGGER_ACTION_TYPES = [
  "create_task",
  "notify",
  "send_mail",
  "start_workflow",
  "set_status",
] as const;

export type TriggerActionType = (typeof TRIGGER_ACTION_TYPES)[number];

export const TRIGGER_ACTION_LABELS: Record<TriggerActionType, string> = {
  create_task: "Aufgabe in der Akte anlegen",
  notify: "In-App-Benachrichtigung",
  send_mail: "E-Mail senden",
  start_workflow: "Workflow starten",
  set_status: "Aktenstatus setzen",
};

/** Höchstzahl der Aktionen je Regel. */
export const MAX_ACTIONS = 5;

export const CASE_STATUS_VALUES = caseStatusSchema.options;
export type CaseStatusValue = (typeof CASE_STATUS_VALUES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatusValue, string> = {
  open: "Offen",
  pending: "Anhängig",
  settled: "Erledigt",
  won: "Gewonnen",
  lost: "Verloren",
  appealed: "Berufung",
  dormant: "Ruhend",
};

export function isCaseStatus(v: unknown): v is CaseStatusValue {
  return typeof v === "string" && (CASE_STATUS_VALUES as readonly string[]).includes(v);
}

export interface AutomationAction {
  type: TriggerActionType;
  /** Titel-Template mit {platzhaltern} aus dem Event (Aufgabe, Betreff, Hinweis). */
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
  /** set_status: neuer Aktenstatus. */
  status?: string;
}

// ── Regel ────────────────────────────────────────────────────────────

export type AutomationPauseReason = "owner_missing" | "owner_inactive";

/** Shown to the firm for a rule the cron paused. */
export const AUTOMATION_PAUSE_MESSAGES: Record<AutomationPauseReason, string> = {
  owner_missing: "Besitzer fehlt — bitte neu speichern",
  owner_inactive: "Besitzer nicht mehr in der Kanzlei aktiv — bitte neu speichern",
};

export interface AutomationRule {
  slug: string;
  name: string;
  enabled: boolean;
  event: TriggerEvent;
  /** Gleichheitsfilter auf Payload-Felder (z. B. { channel: "whatsapp" }). */
  filters?: Record<string, string>;
  /** deadline.due_soon: feuert, sobald die Frist in <= so vielen Tagen abläuft. */
  within_days?: number;
  /** 1..MAX_ACTIONS Aktionen, in dieser Reihenfolge ausgeführt. */
  actions: AutomationAction[];
  /** Idempotenz-Keys: für welche Entities die Regel schon gefeuert hat
   *  (oder die beim Stichtag schon bestanden). FIFO-gekappt. */
  fired_keys?: string[];
  created_at: string;
  created_by: string;
  /**
   * The web user the rule runs for (who created or last saved it). The cron
   * evaluates the rule with this person's matter access; without an owner a
   * rule never sends matter content out (see ruleSendsExternally).
   */
  owner_user_id?: string;
  /** Set by the cron when the rule cannot run; cleared by saving it again. */
  paused_reason?: AutomationPauseReason;
  /**
   * Stichtag: die Regel reagiert nur auf Ereignisse ab diesem Zeitpunkt.
   * Gesetzt, wann immer eine Regel (wieder) ausführbar wird — Anlage,
   * Übernahme aus dem Altmodell, Reaktivieren, neuer Besitzer, geänderter
   * Auslöser oder Aktion. Verhindert, dass alte Ereignisse nachgeholt werden.
   */
  active_since?: string;
  /** Für welchen Stichtag der Cron den Bestand bereits erfasst hat. */
  baseline_done_for?: string;
  /** Letzter Lauf, in dem die Regel etwas ausgeführt hat. */
  last_run_at?: string;
  last_error?: string;
  last_error_at?: string;
  /** Herkunft bei übernommenen Regeln (z. B. "automation_rule"). */
  migrated_from?: string;
}

/** Actions that carry event content (matter titles, names) out of the firm. */
export function ruleSendsExternally(rule: Pick<AutomationRule, "actions">): boolean {
  return rule.actions.some((a) => a.type === "send_mail");
}

/**
 * Cap der Idempotenz-Keys pro Regel (FIFO-Verdrängung, älteste zuerst).
 * Deckt die Beobachtungsmenge des Crons (bis 1000 Seiten je Typ) ab; ältere
 * Ereignisse fängt zusätzlich der Stichtag ab.
 */
export const MAX_FIRED_KEYS = 2000;

/** Verdrängt alte Keys bei Überschreitung des Caps (FIFO). */
export function mergeFiredKeys(existing: string[] | undefined, newKeys: string[]): string[] {
  const merged = [...(existing ?? [])];
  const seen = new Set(merged);
  for (const k of newKeys) {
    if (!seen.has(k)) {
      merged.push(k);
      seen.add(k);
    }
  }
  return merged.slice(-MAX_FIRED_KEYS);
}

/** Payload, das Ereignis-Quellen an die Regeln übergeben. */
export interface AutomationEventPayload {
  case_slug?: string;
  title?: string;
  [key: string]: unknown;
}

/** Standardtext einer In-App-Benachrichtigung, wenn die Regel keinen hat. */
export const DEFAULT_EVENT_MESSAGES: Record<TriggerEvent, string> = {
  "document.uploaded": "Dokument hochgeladen: {title}",
  "deadline.created": "Neue Frist „{deadline_title}“ in Akte {case_title} (fällig {due_date})",
  "deadline.due_soon":
    "Frist „{deadline_title}“ in Akte {case_title} läuft in {days_left} Tag(en) ab ({due_date})",
  "case.created": "Neue Akte angelegt: {title}",
  "case.status_changed": "Akte {title}: Status {status}",
  "message.received": "Nachricht eingegangen: {title}",
  "booking.created": "Termin gebucht: {name} ({date})",
  "invoice.overdue": "Rechnung {invoice_number} ist seit {due_date} überfällig",
};

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

export function dueSoonWindow(rule: Pick<AutomationRule, "within_days">): number {
  const d = rule.within_days;
  return typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= MAX_DUE_SOON_DAYS
    ? d
    : DEFAULT_DUE_SOON_DAYS;
}

/** True, wenn die Regel auf das Event passt (Event-Typ, Vorlauf, alle Filter). */
export function ruleMatches(
  rule: AutomationRule,
  event: TriggerEvent,
  payload: AutomationEventPayload
): boolean {
  if (!rule.enabled || rule.event !== event) return false;
  if (event === "deadline.due_soon" && payload.days_left !== undefined) {
    const left = Number(payload.days_left);
    if (!Number.isFinite(left) || left > dueSoonWindow(rule)) return false;
  }
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

// ── Stichtag: nur Ereignisse nach Aktivierung ────────────────────────

function toMillis(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** Ab wann eine Regel reagiert: Stichtag, sonst (Altregeln) ihre Anlage. */
export function ruleFloor(
  rule: Pick<AutomationRule, "active_since" | "created_at">
): number | null {
  return toMillis(rule.active_since) ?? toMillis(rule.created_at);
}

/** Eine beobachtete Entity, die ein Trigger-Event auslösen kann. */
export interface Observation {
  event: TriggerEvent;
  /** Idempotenz-Key — dedupliziert über fired_keys der Regel. */
  fireKey: string;
  payload: AutomationEventPayload;
  /**
   * Genauer Zeitpunkt des Ereignisses, wenn verlässlich bekannt (ISO).
   * Bei „Frist läuft bald ab": die Anlage der Frist (der Eintritt ins
   * Vorlauf-Fenster hängt von der Regel ab und wird dort ergänzt).
   */
  occurredAt?: string;
  /** Untergrenze: das Ereignis trat sicher nicht vorher ein (ISO). */
  notBefore?: string;
}

export type FloorVerdict = "new" | "old" | "unknown";

/**
 * Liegt das Ereignis nach dem Stichtag der Regel?
 *   new     — sicher danach (ausführen);
 *   old     — sicher davor (nie ausführen);
 *   unknown — Zeitpunkt unbekannt: beim ersten Lauf nach dem Stichtag wird
 *             so etwas nur gemerkt, danach gilt es als neu (fired_keys).
 */
export function floorVerdict(rule: AutomationRule, obs: Observation): FloorVerdict {
  const floor = ruleFloor(rule);
  if (floor === null) return "new";
  let exact = toMillis(obs.occurredAt);
  let lower = toMillis(obs.notBefore);
  if (obs.event === "deadline.due_soon") {
    // „Bald fällig" tritt ein, sobald die Frist ins Vorlauf-Fenster der
    // Regel rückt — frühestens aber mit ihrer Anlage.
    const due = typeof obs.payload.due_date === "string" ? obs.payload.due_date : "";
    const dueAt = toMillis(due ? `${due.slice(0, 10)}T00:00:00Z` : undefined);
    const entered = dueAt === null ? null : dueAt - dueSoonWindow(rule) * 86_400_000;
    if (entered !== null) {
      exact = exact === null ? null : Math.max(exact, entered);
      lower = lower === null ? entered : Math.max(lower, entered);
    }
  }
  if (exact !== null) return exact >= floor ? "new" : "old";
  if (lower !== null && lower >= floor) return "new";
  return "unknown";
}

/** Der Cron muss für den aktuellen Stichtag erst den Bestand erfassen. */
export function needsBaseline(rule: AutomationRule): boolean {
  return !!rule.active_since && rule.baseline_done_for !== rule.active_since;
}

// ── Persistenz-Abbildung (Engine-Seiten, type: "automation") ─────────

export interface AutomationPage {
  slug: string;
  title: string;
  type?: string;
  frontmatter?: Record<string, unknown>;
}

function optStr(v: unknown, max = 2000): string | undefined {
  return typeof v === "string" && v.trim() ? v.slice(0, max) : undefined;
}

function optInt(v: unknown, min: number, max: number): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
}

export function parseAutomationAction(raw: unknown): AutomationAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.type !== "string" || !(TRIGGER_ACTION_TYPES as readonly string[]).includes(a.type)) {
    return null;
  }
  const action: AutomationAction = { type: a.type as TriggerActionType };
  const title = optStr(a.title, 300);
  const message = optStr(a.message);
  const assignee = optStr(a.assignee, 200);
  const dueInDays = optInt(a.due_in_days, 0, 365);
  const tpl = optStr(a.workflow_template_id, 200);
  const recipient = optStr(a.recipient, 300);
  const status = optStr(a.status, 100);
  if (title) action.title = title;
  if (message) action.message = message;
  if (assignee) action.assignee = assignee;
  if (dueInDays !== undefined) action.due_in_days = dueInDays;
  if (tpl) action.workflow_template_id = tpl;
  if (recipient) action.recipient = recipient;
  if (status) action.status = status;
  return action;
}

export function fmToAutomation(page: AutomationPage): AutomationRule | null {
  const fm = page.frontmatter;
  // The engine keeps the page type in a column and strips it from the
  // returned frontmatter — read it from the page, not only from fm.type.
  if (!fm || pageTypeOf(page) !== "automation") return null;
  if (fm.status === "tombstoned") return null;
  const event = normalizeTriggerEvent(fm.event);
  if (!event) return null;
  const rawActions = Array.isArray(fm.actions) ? fm.actions : fm.action ? [fm.action] : [];
  const actions = rawActions
    .map(parseAutomationAction)
    .filter((a): a is AutomationAction => a !== null)
    .slice(0, MAX_ACTIONS);
  if (actions.length === 0) return null;
  const filters =
    fm.filters && typeof fm.filters === "object" && !Array.isArray(fm.filters)
      ? Object.fromEntries(
          Object.entries(fm.filters as Record<string, unknown>).map(([k, v]) => [k, String(v)])
        )
      : undefined;
  const pausedReason =
    fm.paused_reason === "owner_missing" || fm.paused_reason === "owner_inactive"
      ? (fm.paused_reason as AutomationPauseReason)
      : undefined;
  const withinDays = optInt(fm.within_days, 0, MAX_DUE_SOON_DAYS);
  return {
    slug: page.slug,
    name: page.title,
    enabled: fm.enabled !== false,
    event,
    ...(filters && Object.keys(filters).length > 0 ? { filters } : {}),
    ...(withinDays !== undefined ? { within_days: withinDays } : {}),
    actions,
    fired_keys: Array.isArray(fm.fired_keys)
      ? (fm.fired_keys.filter((k) => typeof k === "string") as string[]).slice(-MAX_FIRED_KEYS)
      : undefined,
    created_at: typeof fm.created_at === "string" ? fm.created_at : "",
    created_by: typeof fm.created_by === "string" ? fm.created_by : "",
    ...(optStr(fm.owner_user_id) ? { owner_user_id: fm.owner_user_id as string } : {}),
    ...(pausedReason ? { paused_reason: pausedReason } : {}),
    ...(optStr(fm.active_since) ? { active_since: fm.active_since as string } : {}),
    ...(optStr(fm.baseline_done_for) ? { baseline_done_for: fm.baseline_done_for as string } : {}),
    ...(optStr(fm.last_run_at) ? { last_run_at: fm.last_run_at as string } : {}),
    ...(optStr(fm.last_error) ? { last_error: fm.last_error as string } : {}),
    ...(optStr(fm.last_error_at) ? { last_error_at: fm.last_error_at as string } : {}),
    ...(optStr(fm.migrated_from) ? { migrated_from: fm.migrated_from as string } : {}),
  };
}

/** Frontmatter-Felder, die nur der Cron pflegt (Laufzustand). */
export type AutomationRunState = Partial<
  Pick<
    AutomationRule,
    | "fired_keys"
    | "paused_reason"
    | "baseline_done_for"
    | "last_run_at"
    | "last_error"
    | "last_error_at"
  >
>;

/**
 * Frontmatter für ein Teil-Update des Laufzustands. Merge-Updates können
 * keine Schlüssel löschen — `null` leert einen Wert ausdrücklich.
 */
export function automationStateFrontmatter(
  state: AutomationRunState,
  clear: Array<keyof AutomationRunState> = []
): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) if (v !== undefined) fm[k] = v;
  for (const k of clear) fm[k] = null;
  if ("paused_reason" in fm) {
    fm.status_message = fm.paused_reason
      ? AUTOMATION_PAUSE_MESSAGES[fm.paused_reason as AutomationPauseReason]
      : null;
  }
  return fm;
}

export function automationToFrontmatter(rule: AutomationRule): Record<string, unknown> {
  return {
    type: "automation",
    enabled: rule.enabled,
    event: rule.event,
    filters: rule.filters ?? {},
    within_days: rule.within_days ?? null,
    actions: rule.actions,
    // Erste Aktion zusätzlich unter dem alten Schlüssel — ein zurückgerollter
    // Stand liest dann weiterhin eine gültige Regel.
    action: rule.actions[0] ?? null,
    fired_keys: rule.fired_keys ?? [],
    created_at: rule.created_at,
    created_by: rule.created_by,
    // Merge updates cannot delete keys — write explicit empties instead.
    owner_user_id: rule.owner_user_id ?? null,
    paused_reason: rule.paused_reason ?? null,
    status_message: rule.paused_reason ? AUTOMATION_PAUSE_MESSAGES[rule.paused_reason] : null,
    active_since: rule.active_since ?? null,
    baseline_done_for: rule.baseline_done_for ?? null,
    last_run_at: rule.last_run_at ?? null,
    last_error: rule.last_error ?? null,
    last_error_at: rule.last_error_at ?? null,
    migrated_from: rule.migrated_from ?? null,
  };
}

/** Kurzbeschreibung „Auslöser → Aktion + Aktion" (Seiteninhalt, Anzeige). */
export function describeRule(
  rule: Pick<AutomationRule, "event" | "actions" | "within_days">
): string {
  const trigger =
    rule.event === "deadline.due_soon"
      ? `${TRIGGER_EVENT_LABELS[rule.event]} (${dueSoonWindow(rule)} Tage)`
      : TRIGGER_EVENT_LABELS[rule.event];
  return `${trigger} → ${rule.actions.map((a) => TRIGGER_ACTION_LABELS[a.type]).join(" + ")}`;
}

// ── Anlegen und Bearbeiten ───────────────────────────────────────────

/** Fachliche Pflichtfelder je Aktion; Fehlertext oder null. */
export function validateActions(actions: AutomationAction[]): string | null {
  if (actions.length === 0) return "Mindestens eine Aktion ist erforderlich.";
  if (actions.length > MAX_ACTIONS) return `Höchstens ${MAX_ACTIONS} Aktionen je Regel.`;
  for (const a of actions) {
    if (a.type === "send_mail") {
      const r = a.recipient ?? "";
      if (!(r.includes("@") || /^\{[a-zA-Z0-9_.]+\}$/.test(r.trim()))) {
        return "E-Mail-Aktionen brauchen einen Empfänger (Adresse oder {platzhalter} aus dem Ereignis).";
      }
    }
    if (a.type === "start_workflow" && !a.workflow_template_id) {
      return "Workflow-Aktionen brauchen eine Vorlage.";
    }
    if (a.type === "set_status" && !isCaseStatus(a.status)) {
      return "Die Aktion „Aktenstatus setzen“ braucht einen gültigen Status.";
    }
  }
  return null;
}

export interface NewAutomationInput {
  name: string;
  event: TriggerEvent;
  filters?: Record<string, string>;
  within_days?: number;
  actions: AutomationAction[];
}

/**
 * Neue Regel: wer sie anlegt, ist Besitzer (sie läuft mit seiner
 * Akten-Sicht), und sie reagiert erst auf Ereignisse ab jetzt.
 */
export function buildNewAutomationRule(
  input: NewAutomationInput,
  creator: { userId: string; label: string },
  now: Date = new Date()
): AutomationRule {
  const iso = now.toISOString();
  return {
    slug: buildAutomationSlug(input.name),
    name: input.name,
    enabled: true,
    event: input.event,
    ...(input.filters && Object.keys(input.filters).length > 0 ? { filters: input.filters } : {}),
    ...(input.event === "deadline.due_soon" && input.within_days !== undefined
      ? { within_days: input.within_days }
      : {}),
    actions: input.actions.slice(0, MAX_ACTIONS),
    fired_keys: [],
    created_at: iso,
    created_by: creator.label,
    owner_user_id: creator.userId,
    active_since: iso,
  };
}

export interface AutomationEdit {
  name?: string;
  enabled?: boolean;
  event?: TriggerEvent;
  within_days?: number | null;
  actions?: AutomationAction[];
}

/**
 * Speichern einer Regel: der Speichernde wird Besitzer, eine Pause endet.
 * Wird die Regel dadurch (wieder) ausführbar — aktiviert, neuer Besitzer,
 * Pause aufgehoben, Auslöser oder Aktionen geändert, oder sie hatte noch
 * keinen Stichtag —, beginnt ein neuer Stichtag: nichts wird nachgeholt.
 */
export function applyAutomationEdit(
  rule: AutomationRule,
  edit: AutomationEdit,
  saverId: string,
  now: Date = new Date()
): AutomationRule {
  const event = edit.event ?? rule.event;
  const withinDays =
    event !== "deadline.due_soon"
      ? undefined
      : edit.within_days === null
        ? undefined
        : (edit.within_days ?? rule.within_days);
  const actions = edit.actions ? edit.actions.slice(0, MAX_ACTIONS) : rule.actions;
  const enabled = edit.enabled ?? rule.enabled;
  const behaviourChanged =
    event !== rule.event ||
    withinDays !== rule.within_days ||
    JSON.stringify(actions) !== JSON.stringify(rule.actions);
  const becomesRunnable =
    enabled &&
    (!rule.enabled ||
      !!rule.paused_reason ||
      rule.owner_user_id !== saverId ||
      behaviourChanged ||
      !rule.active_since);
  const updated: AutomationRule = {
    ...rule,
    name: edit.name ?? rule.name,
    enabled,
    event,
    actions,
    owner_user_id: saverId,
    paused_reason: undefined,
  };
  if (withinDays === undefined) delete updated.within_days;
  else updated.within_days = withinDays;
  if (becomesRunnable) {
    updated.active_since = now.toISOString();
    // Keys des alten Auslösers passen nicht mehr — neu erfassen.
    if (event !== rule.event) updated.fired_keys = [];
    updated.last_error = undefined;
    updated.last_error_at = undefined;
  }
  return updated;
}
