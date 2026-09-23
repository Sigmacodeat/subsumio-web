/**
 * Übernahme der Regeln des früheren UI-Modells (`automation_rule`) in das
 * eine Regelmodell (`automation`, siehe automation-model.ts).
 *
 * Diese Regeln wurden in der Oberfläche angelegt, aber nie ausgeführt. Damit
 * sie nach der Übernahme nicht plötzlich alte Ereignisse nachholen, bekommen
 * sie den Übernahmezeitpunkt als Stichtag; der erste Cron-Lauf erfasst dann
 * nur den Bestand (siehe needsBaseline).
 *
 * Idempotent: die Seite behält ihren Slug und wechselt nur den Typ. Danach
 * taucht sie nicht mehr unter `automation_rule` auf — ein zweiter Lauf findet
 * nichts mehr, und es entsteht nie eine zweite Regel. Geschrieben wird nur
 * vom Cron und beim Speichern durch einen Menschen; die Liste in der
 * Oberfläche bildet noch nicht übernommene Regeln lediglich lesend ab.
 */

import { getStore } from "@/lib/auth/store";
import { engineHeadersForBrain, engineHeadersForUserId } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { pageTypeOf } from "@/lib/types";
import {
  parseAutomationAction as parseLegacyAction,
  parseAutomationTrigger,
} from "@/lib/automation-rules";
import { updateAutomation, type AutomationCaller } from "@/lib/automation";
import {
  MAX_ACTIONS,
  isCaseStatus,
  normalizeTriggerEvent,
  type AutomationAction,
  type AutomationPage,
  type AutomationRule,
} from "@/lib/automation-model";

export const LEGACY_RULE_TYPE = "automation_rule";

/** Aktionen des Altmodells → kanonische Aktionen. */
function mapLegacyAction(raw: unknown): AutomationAction | null {
  const a = parseLegacyAction(raw);
  if (!a) return null;
  switch (a.type) {
    case "create_task":
      return {
        type: "create_task",
        ...(a.text ? { title: a.text } : {}),
        ...(a.dueInDays !== undefined ? { due_in_days: a.dueInDays } : {}),
      };
    // Hieß „Kanzlei per E-Mail benachrichtigen", wurde aber nie ausgeführt.
    // Übernommen wird es als In-App-Hinweis: eine Regel, die bisher nichts
    // verschickt hat, beginnt nicht ungefragt E-Mails zu versenden.
    case "notify_kanzlei":
      return { type: "notify", ...(a.text ? { message: a.text } : {}) };
    case "set_status":
      return isCaseStatus(a.status) ? { type: "set_status", status: a.status } : null;
  }
}

/**
 * Reine Abbildung einer Altregel-Seite auf eine kanonische Regel (gleicher
 * Slug). null, wenn die Seite keine gültige, lebende Altregel ist.
 */
export function legacyRuleToAutomation(
  page: AutomationPage,
  opts: { now: Date; ownerUserId?: string }
): AutomationRule | null {
  if (pageTypeOf(page) !== LEGACY_RULE_TYPE) return null;
  const fm = page.frontmatter ?? {};
  if (fm.status === "tombstoned") return null;
  const trigger = parseAutomationTrigger(fm.trigger);
  const event = normalizeTriggerEvent(trigger?.type);
  if (!trigger || !event) return null;
  const actions = (Array.isArray(fm.actions) ? fm.actions : [])
    .map(mapLegacyAction)
    .filter((a): a is AutomationAction => a !== null)
    .slice(0, MAX_ACTIONS);
  if (actions.length === 0) return null;
  const nowIso = opts.now.toISOString();
  const name = (typeof fm.name === "string" && fm.name.trim()) || page.title || page.slug;
  return {
    slug: page.slug,
    name: name.slice(0, 200),
    enabled: fm.enabled !== false,
    event,
    ...(event === "deadline.due_soon" && trigger.days !== undefined
      ? { within_days: trigger.days }
      : {}),
    actions,
    fired_keys: [],
    created_at: typeof fm.created_at === "string" && fm.created_at ? fm.created_at : nowIso,
    created_by: typeof fm.created_by === "string" ? fm.created_by : "",
    ...(opts.ownerUserId ? { owner_user_id: opts.ownerUserId } : {}),
    active_since: nowIso,
    migrated_from: LEGACY_RULE_TYPE,
  };
}

/** Frontmatter-Schlüssel des Altmodells, die nach der Übernahme entfallen. */
export const LEGACY_KEYS_CLEARED = { trigger: null, name: null } as const;

/** Die rohen Altregel-Seiten einer Kanzlei (ohne gelöschte). */
export async function listLegacyRulePages(
  headers: Record<string, string>
): Promise<AutomationPage[]> {
  const pages = await listEnginePages(headers, LEGACY_RULE_TYPE, 500);
  // The listing is by type; a page that names no type at all counts as legacy.
  return pages
    .filter((p) => (pageTypeOf(p) ?? LEGACY_RULE_TYPE) === LEGACY_RULE_TYPE)
    .map((p) => ({ ...p, type: LEGACY_RULE_TYPE }) as AutomationPage);
}

/** Besitzer einer Altregel: ihr Ersteller (gespeichert als E-Mail), falls bekannt. */
export type LegacyOwnerResolver = (createdBy: string) => Promise<string | undefined>;

/**
 * Der Ersteller wird Besitzer, wenn er noch aktiv in DIESER Kanzlei arbeitet;
 * sonst bleibt die Regel ohne Besitzer (und läuft nur, wenn sie nichts nach
 * außen sendet — Altregeln senden nie nach außen).
 */
export function ownerByEmailIn(brainId: string): LegacyOwnerResolver {
  return async (createdBy) => {
    if (!createdBy.includes("@")) return undefined;
    const user = await getStore().getByEmail(createdBy.trim().toLowerCase());
    if (!user || user.deactivatedAt) return undefined;
    const owner = await engineHeadersForUserId(user.id).catch(() => null);
    return owner?.headers["x-subsumio-source"] === brainId ? user.id : undefined;
  };
}

export interface LegacyMigrationResult {
  migrated: string[];
  failed: string[];
}

/**
 * Übernimmt alle Altregeln einer Kanzlei. Sicher wiederholbar: jede Seite
 * wird an Ort und Stelle umgetypt und danach nicht mehr gefunden.
 */
export async function migrateLegacyAutomationRules(
  caller: AutomationCaller,
  resolveOwner: LegacyOwnerResolver,
  now: Date = new Date()
): Promise<LegacyMigrationResult> {
  const result: LegacyMigrationResult = { migrated: [], failed: [] };
  const headers = typeof caller === "string" ? engineHeadersForBrain(caller) : caller.headers;
  const pages = await listLegacyRulePages(headers);
  for (const page of pages) {
    const createdBy =
      typeof page.frontmatter?.created_by === "string" ? page.frontmatter.created_by : "";
    const ownerUserId = createdBy
      ? await resolveOwner(createdBy).catch(() => undefined)
      : undefined;
    const rule = legacyRuleToAutomation(page, { now, ownerUserId });
    if (!rule) continue; // ungültig oder gelöscht — bleibt, wie es ist
    const ok = await updateAutomation(caller, rule, { ...LEGACY_KEYS_CLEARED }).catch(() => false);
    (ok ? result.migrated : result.failed).push(page.slug);
  }
  return result;
}
