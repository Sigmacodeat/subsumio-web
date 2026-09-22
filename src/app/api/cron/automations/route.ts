import { NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { batchFetchPages, getRecipientsByBrain, mapWithConcurrency } from "@/lib/cron-utils";
import {
  dispatchAutomations,
  listAutomations,
  mergeFiredKeys,
  ruleMatches,
  updateAutomation,
  type AutomationRule,
} from "@/lib/automation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = logger("cron/automations");

/** Fristen gelten als „bald fällig" wenn sie in <= 7 Tagen ablaufen. */
const DUE_SOON_DAYS = 7;

interface DeadlineLike {
  id?: string;
  title?: string;
  due_date?: string;
  status?: string;
}

interface PendingFire {
  rule: AutomationRule;
  fireKey: string;
  payload: Record<string, unknown>;
}

/**
 * WP-4.17 — Cron-Evaluator für zustandsbasierte Trigger.
 *
 * Ereignisbasierte Trigger (booking.created, document.uploaded, …) werden
 * direkt an der Quelle via dispatchAutomations angestoßen. Zustandsbasierte
 * Trigger (deadline.due_soon, invoice.overdue) feuern hier periodisch:
 * der Evaluator scannt Cases/Rechnungen, dispatcht ein Event pro Entity
 * und merkt sich in `fired_keys` der Regel, für welche Entities sie bereits
 * ausgelöst hat — kein Doppel-Feuern bei jedem Lauf.
 */
export const GET = createCronHandler(async () => {
  const recipientsByBrain = await getRecipientsByBrain();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  let brainsChecked = 0;
  let dispatched = 0;
  const errors: string[] = [];

  for (const [brainId] of recipientsByBrain) {
    brainsChecked++;
    try {
      const rules = (await listAutomations(brainId)).filter((r) => r.enabled);
      const dueSoonRules = rules.filter((r) => r.event === "deadline.due_soon");
      const overdueRules = rules.filter((r) => r.event === "invoice.overdue");
      if (dueSoonRules.length === 0 && overdueRules.length === 0) continue;

      const byType = await batchFetchPages(brainId, ["legal_case", "invoice"], 1000);
      const pending: PendingFire[] = [];

      // deadline.due_soon: Case-Deadlines innerhalb des Fensters.
      for (const rule of dueSoonRules) {
        const fired = new Set(rule.fired_keys ?? []);
        for (const c of byType.legal_case ?? []) {
          const deadlines = Array.isArray(c.frontmatter?.deadlines)
            ? (c.frontmatter.deadlines as DeadlineLike[])
            : [];
          for (const dl of deadlines) {
            if (!dl.due_date || dl.status === "done") continue;
            const due = new Date(`${dl.due_date}T00:00:00Z`);
            if (Number.isNaN(due.getTime())) continue;
            const daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
            if (daysLeft < 0 || daysLeft > DUE_SOON_DAYS) continue;
            const dlId = dl.id ?? dl.due_date;
            const key = `deadline:${c.slug}:${dlId}`;
            if (fired.has(key)) continue;
            pending.push({
              rule,
              fireKey: key,
              payload: {
                case_slug: c.slug,
                case_title: c.title ?? c.slug,
                deadline_id: dlId,
                deadline_title: dl.title ?? "Frist",
                due_date: dl.due_date,
                days_left: String(daysLeft),
                title: dl.title ?? c.title ?? c.slug,
              },
            });
          }
        }
      }

      // invoice.overdue: unbezahlte Rechnungen mit überschrittenem Fälligkeitsdatum.
      for (const rule of overdueRules) {
        const fired = new Set(rule.fired_keys ?? []);
        for (const inv of byType.invoice ?? []) {
          const fm = inv.frontmatter ?? {};
          if (fm.status === "paid" || fm.status === "draft" || fm.status === "cancelled") {
            continue;
          }
          const due = typeof fm.due_date === "string" ? fm.due_date : "";
          if (!due || due >= today) continue;
          const key = `invoice:${inv.slug}`;
          if (fired.has(key)) continue;
          pending.push({
            rule,
            fireKey: key,
            payload: {
              case_slug: typeof fm.case_slug === "string" ? fm.case_slug : undefined,
              invoice_slug: inv.slug,
              invoice_number: typeof fm.invoice_number === "string" ? fm.invoice_number : inv.slug,
              due_date: due,
              title: `Rechnung ${typeof fm.invoice_number === "string" ? fm.invoice_number : inv.slug}`,
            },
          });
        }
      }

      if (pending.length === 0) continue;

      // Nach Entity gruppieren: pro Entity ein Dispatch (trifft alle
      // passenden Regeln), danach fireKey auf allen gematchten Regeln setzen.
      const byEntity = new Map<string, PendingFire[]>();
      for (const p of pending) {
        const list = byEntity.get(p.fireKey) ?? [];
        list.push(p);
        byEntity.set(p.fireKey, list);
      }
      const touchedRules = new Map<string, { rule: AutomationRule; keys: string[] }>();

      await mapWithConcurrency(
        [...byEntity.entries()],
        async ([fireKey, group]) => {
          const event = group[0]!.rule.event;
          try {
            const res = await dispatchAutomations(brainId, event, group[0]!.payload);
            if (res.errors.length > 0) errors.push(...res.errors.map((e) => `${brainId}:${e}`));
            dispatched += res.executed;
            for (const p of group) {
              if (!ruleMatches(p.rule, event, p.payload)) continue;
              const t = touchedRules.get(p.rule.slug) ?? { rule: p.rule, keys: [] as string[] };
              if (!t.keys.includes(fireKey)) t.keys.push(fireKey);
              touchedRules.set(p.rule.slug, t);
            }
          } catch (err) {
            errors.push(
              `${brainId}:${fireKey}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        },
        4
      );

      // fired_keys persistieren — PUT ersetzt das Frontmatter, daher muss
      // die gemergte Liste vollständig zurückgeschrieben werden.
      for (const { rule, keys } of touchedRules.values()) {
        await updateAutomation(brainId, {
          ...rule,
          fired_keys: mergeFiredKeys(rule.fired_keys, keys),
        }).catch(() => {});
      }
    } catch (err) {
      errors.push(`${brainId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log.info("automations evaluated", { brainsChecked, dispatched, errors: errors.length });
  return NextResponse.json({ ok: errors.length === 0, brainsChecked, dispatched, errors });
});
