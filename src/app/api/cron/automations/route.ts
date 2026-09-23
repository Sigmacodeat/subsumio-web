import { NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { getRecipientsByBrain, type EnginePage } from "@/lib/cron-utils";
import { engineHeadersForBrain } from "@/lib/engine";
import {
  groupRulesByRunner,
  listAutomations,
  mergeFiredKeys,
  needsBaseline,
  patchAutomationState,
  runAutomationRule,
  type AutomationCaller,
  type AutomationRunState,
} from "@/lib/automation";
import { collectObservations, planRuleRuns } from "@/lib/automation-observe";
import { migrateLegacyAutomationRules, ownerByEmailIn } from "@/lib/automation-migration";
import { listEnginePages } from "@/lib/engine-pages";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = logger("cron/automations");

/** The entity page types the cron observes. */
const OBSERVED_TYPES = ["legal_case", "invoice", "document", "inbound_entry", "booking"];

/**
 * Pages of the observed types as `caller` sees them: the firm view for
 * ownerless rules, the owner's view (walls, restricted matters, grants
 * applied by the engine) for everyone else. Throws when a read fails — a
 * failed read must never look like "nothing there" (the first run after a
 * new cutoff would otherwise record an empty inventory and later replay it).
 */
async function pagesFor(caller: AutomationCaller): Promise<Record<string, EnginePage[]>> {
  const headers = typeof caller === "string" ? engineHeadersForBrain(caller) : caller.headers;
  const entries = await Promise.all(
    OBSERVED_TYPES.map(
      async (type) => [type, await listEnginePages(headers, type, 1000, { strict: true })] as const
    )
  );
  return Object.fromEntries(entries);
}

function shortError(msg: string): string {
  return msg.length > 500 ? `${msg.slice(0, 497)}…` : msg;
}

/**
 * WP-4.17 — „Wenn X dann Y"-Cron-Evaluator.
 *
 * Alle Trigger werden zustandsbasiert ausgewertet: der Cron scannt die
 * Entity-Pages (Cases, Dokumente, Posteingang, Buchungen, Rechnungen),
 * führt die passenden Regeln pro beobachteter Entity aus und merkt sich in
 * `fired_keys` der Regel, für welche Entities sie bereits ausgelöst hat —
 * kein Doppel-Feuern bei wiederholten Läufen. Regeln reagieren nur auf
 * Ereignisse ab ihrem Stichtag (active_since); alte werden nie nachgeholt.
 *
 * Vorab übernimmt der Cron Regeln des früheren UI-Modells (automation_rule)
 * idempotent in das eine Modell (automation-migration.ts).
 *
 * Ethical Walls: jede Regel läuft mit der Akten-Sicht ihres Besitzers
 * (owner_user_id) — sie sieht nur Entities, die er sehen darf, und schreibt
 * mit seinen Rechten. Regeln ohne Besitzer laufen nur, wenn sie nichts nach
 * außen senden; E-Mail-Regeln ohne Besitzer werden pausiert
 * („Besitzer fehlt — bitte neu speichern").
 */
export const GET = createCronHandler(async () => {
  const recipientsByBrain = await getRecipientsByBrain();
  const now = new Date();
  const nowIso = now.toISOString();

  let brainsChecked = 0;
  let dispatched = 0;
  let skippedRules = 0;
  let pausedRules = 0;
  let migratedRules = 0;
  let baselinedRules = 0;
  const errors: string[] = [];

  for (const [brainId] of recipientsByBrain) {
    brainsChecked++;
    try {
      const migration = await migrateLegacyAutomationRules(brainId, ownerByEmailIn(brainId), now);
      migratedRules += migration.migrated.length;
      for (const slug of migration.failed)
        errors.push(`${brainId}:${slug}: Übernahme fehlgeschlagen`);

      const rules = (await listAutomations(brainId)).filter((r) => r.enabled);
      if (rules.length === 0) continue;

      const { groups, paused, skipped } = await groupRulesByRunner(brainId, rules);
      for (const rule of paused) {
        pausedRules++;
        if (rule.paused_reason === "owner_missing") continue;
        log.warn("automation paused: no owner for an outgoing action", {
          brainId,
          rule: rule.slug,
        });
        await patchAutomationState(brainId, rule.slug, { paused_reason: "owner_missing" }).catch(
          () => false
        );
      }
      for (const rule of skipped) {
        skippedRules++;
        if (rule.paused_reason === "owner_inactive") continue;
        log.warn("automation paused: owner no longer active in this firm", {
          brainId,
          rule: rule.slug,
        });
        await patchAutomationState(brainId, rule.slug, { paused_reason: "owner_inactive" }).catch(
          () => false
        );
      }

      for (const group of groups) {
        let pages: Record<string, EnginePage[]>;
        try {
          pages = await pagesFor(group.caller);
        } catch (err) {
          // Nothing runs and no inventory is recorded — next run tries again.
          errors.push(`${brainId}:${group.label}: ${err instanceof Error ? err.message : err}`);
          continue;
        }
        const observations = collectObservations(group.rules, pages, now);
        const { runs, baseline } = planRuleRuns(group.rules, observations);

        const executedKeys = new Map<string, string[]>();
        const ruleErrors = new Map<string, string[]>();
        // One after the other: several rules may write the same matter
        // (tasks, status) — parallel read-modify-writes would lose updates.
        for (const { rule, obs } of runs) {
          const outcome = await runAutomationRule(brainId, rule, obs.payload, group.caller);
          if (outcome === "skipped") continue;
          if (outcome.errors.length > 0) {
            ruleErrors.set(rule.slug, [...(ruleErrors.get(rule.slug) ?? []), ...outcome.errors]);
            errors.push(...outcome.errors.map((e) => `${brainId}:${e}`));
          }
          // Once any action ran, the event counts as handled — a retry
          // would repeat the actions that did run (e.g. a sent e-mail).
          if (outcome.executed > 0) {
            dispatched++;
            executedKeys.set(rule.slug, [...(executedKeys.get(rule.slug) ?? []), obs.fireKey]);
          }
        }

        for (const rule of group.rules) {
          const ran = executedKeys.get(rule.slug) ?? [];
          const known = baseline.get(rule.slug) ?? [];
          const errs = ruleErrors.get(rule.slug) ?? [];
          const state: AutomationRunState = {};
          const clear: Array<keyof AutomationRunState> = [];
          if (ran.length > 0 || known.length > 0) {
            state.fired_keys = mergeFiredKeys(rule.fired_keys, [...known, ...ran]);
          }
          if (needsBaseline(rule)) {
            state.baseline_done_for = rule.active_since;
            if (known.length > 0) baselinedRules++;
          }
          if (ran.length > 0) state.last_run_at = nowIso;
          if (errs.length > 0) {
            state.last_error = shortError(errs[0]!);
            state.last_error_at = nowIso;
          } else if (ran.length > 0 && rule.last_error) {
            clear.push("last_error", "last_error_at");
          }
          // Runs again (e.g. its owner is back): drop the stale pause notice.
          if (rule.paused_reason) clear.push("paused_reason");
          if (Object.keys(state).length === 0 && clear.length === 0) continue;
          await patchAutomationState(brainId, rule.slug, state, clear).catch(() => false);
        }
      }
    } catch (err) {
      errors.push(`${brainId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log.info("automations evaluated", {
    brainsChecked,
    dispatched,
    skippedRules,
    pausedRules,
    migratedRules,
    baselinedRules,
    errors: errors.length,
  });
  return NextResponse.json({
    ok: errors.length === 0,
    brainsChecked,
    dispatched,
    skippedRules,
    pausedRules,
    migratedRules,
    baselinedRules,
    errors,
  });
});
