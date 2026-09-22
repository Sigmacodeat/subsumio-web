import { NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import {
  batchFetchPages,
  getRecipientsByBrain,
  mapWithConcurrency,
  type EnginePage,
} from "@/lib/cron-utils";
import {
  dispatchAutomations,
  listAutomations,
  mergeFiredKeys,
  ruleMatches,
  updateAutomation,
  type AutomationEventPayload,
  type AutomationRule,
  type TriggerEvent,
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

/** Eine beobachtete Entity, die ein Trigger-Event auslösen kann. */
interface Observation {
  event: TriggerEvent;
  /** Idempotenz-Key — dedupliziert über fired_keys der Regel. */
  fireKey: string;
  payload: AutomationEventPayload;
}

function fm(page: EnginePage): Record<string, unknown> {
  return page.frontmatter ?? {};
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/**
 * Scannt die Entity-Pages einer Brain und erzeugt Observations für jeden
 * Trigger-Typ. „Erstellt"-Events feuern einmal pro Entity; „Status geändert"
 * einmal pro Statuswert; „bald fällig/überfällig" einmal pro Frist/Rechnung.
 */
export function collectObservations(
  rules: AutomationRule[],
  pages: Record<string, EnginePage[]>,
  now: Date
): Observation[] {
  const events = new Set(rules.map((r) => r.event));
  const out: Observation[] = [];
  const cases = pages.legal_case ?? [];

  if (events.has("case.created") || events.has("case.status_changed")) {
    for (const c of cases) {
      if (events.has("case.created")) {
        out.push({
          event: "case.created",
          fireKey: `case:${c.slug}`,
          payload: { case_slug: c.slug, title: c.title ?? c.slug },
        });
      }
      const status = str(fm(c).status);
      if (events.has("case.status_changed") && status) {
        out.push({
          event: "case.status_changed",
          fireKey: `status:${c.slug}:${status}`,
          payload: { case_slug: c.slug, title: c.title ?? c.slug, status },
        });
      }
    }
  }

  if (events.has("document.uploaded")) {
    for (const d of pages.document ?? []) {
      const m = fm(d);
      out.push({
        event: "document.uploaded",
        fireKey: `doc:${d.slug}`,
        payload: {
          case_slug: str(m.case_slug),
          title: d.title ?? d.slug,
          document_slug: d.slug,
          doc_type: str(m.doc_type),
          source: str(m.source),
        },
      });
    }
  }

  if (events.has("message.received")) {
    for (const e of pages.inbound_entry ?? []) {
      const m = fm(e);
      out.push({
        event: "message.received",
        fireKey: `msg:${e.slug}`,
        payload: {
          case_slug: str(m.case_slug),
          title: e.title ?? str(m.subject) ?? e.slug,
          channel: str(m.channel),
          sender: str(m.sender_name) ?? str(m.sender_address),
        },
      });
    }
  }

  if (events.has("booking.created")) {
    for (const b of pages.booking ?? []) {
      const m = fm(b);
      out.push({
        event: "booking.created",
        fireKey: `booking:${b.slug}`,
        payload: {
          title: b.title ?? b.slug,
          name: str(m.client_name),
          email: str(m.client_email),
          matter: str(m.matter),
          legal_area: str(m.legal_area),
          date: str(m.slot_start)?.slice(0, 10),
          start: str(m.slot_start),
          end: str(m.slot_end),
        },
      });
    }
  }

  if (events.has("deadline.created") || events.has("deadline.due_soon")) {
    for (const c of cases) {
      const deadlines = Array.isArray(fm(c).deadlines) ? (fm(c).deadlines as DeadlineLike[]) : [];
      for (const dl of deadlines) {
        if (!dl.due_date || dl.status === "done") continue;
        const dlId = dl.id ?? dl.due_date;
        const base: AutomationEventPayload = {
          case_slug: c.slug,
          case_title: c.title ?? c.slug,
          deadline_id: dlId,
          deadline_title: dl.title ?? "Frist",
          due_date: dl.due_date,
          title: dl.title ?? c.title ?? c.slug,
        };
        if (events.has("deadline.created")) {
          out.push({
            event: "deadline.created",
            fireKey: `dl:${c.slug}:${dlId}`,
            payload: base,
          });
        }
        if (events.has("deadline.due_soon")) {
          const due = new Date(`${dl.due_date}T00:00:00Z`);
          const daysLeft = Number.isNaN(due.getTime())
            ? null
            : Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
          if (daysLeft !== null && daysLeft >= 0 && daysLeft <= DUE_SOON_DAYS) {
            out.push({
              event: "deadline.due_soon",
              fireKey: `due:${c.slug}:${dlId}`,
              payload: { ...base, days_left: String(daysLeft) },
            });
          }
        }
      }
    }
  }

  if (events.has("invoice.overdue")) {
    const today = now.toISOString().slice(0, 10);
    for (const inv of pages.invoice ?? []) {
      const m = fm(inv);
      if (m.status === "paid" || m.status === "draft" || m.status === "cancelled") continue;
      const due = str(m.due_date);
      if (!due || due >= today) continue;
      const nr = str(m.invoice_number) ?? inv.slug;
      out.push({
        event: "invoice.overdue",
        fireKey: `invoice:${inv.slug}`,
        payload: {
          case_slug: str(m.case_slug),
          invoice_slug: inv.slug,
          invoice_number: nr,
          due_date: due,
          title: `Rechnung ${nr}`,
        },
      });
    }
  }

  return out;
}

/**
 * WP-4.17 — „Wenn X dann Y"-Cron-Evaluator.
 *
 * Alle Trigger werden zustandsbasiert ausgewertet: der Cron scannt die
 * Entity-Pages (Cases, Dokumente, Posteingang, Buchungen, Rechnungen),
 * dispatcht ein Event pro beobachteter Entity und merkt sich in
 * `fired_keys` der Regel, für welche Entities sie bereits ausgelöst hat —
 * kein Doppel-Feuern bei wiederholten Läufen.
 */
export const GET = createCronHandler(async () => {
  const recipientsByBrain = await getRecipientsByBrain();
  const now = new Date();

  let brainsChecked = 0;
  let dispatched = 0;
  const errors: string[] = [];

  for (const [brainId] of recipientsByBrain) {
    brainsChecked++;
    try {
      const rules = (await listAutomations(brainId)).filter((r) => r.enabled);
      if (rules.length === 0) continue;

      const pages = await batchFetchPages(
        brainId,
        ["legal_case", "invoice", "document", "inbound_entry", "booking"],
        1000
      );
      const observations = collectObservations(rules, pages, now);
      if (observations.length === 0) continue;

      // Regeln je Event gruppieren; Dedup-Check pro (Regel, fireKey).
      const rulesByEvent = new Map<TriggerEvent, AutomationRule[]>();
      for (const r of rules) {
        const list = rulesByEvent.get(r.event) ?? [];
        list.push(r);
        rulesByEvent.set(r.event, list);
      }

      const pending: { obs: Observation; matching: AutomationRule[] }[] = [];
      for (const obs of observations) {
        const candidates = rulesByEvent.get(obs.event) ?? [];
        const matching = candidates.filter(
          (r) =>
            !(r.fired_keys ?? []).includes(obs.fireKey) && ruleMatches(r, obs.event, obs.payload)
        );
        if (matching.length > 0) pending.push({ obs, matching });
      }
      if (pending.length === 0) continue;

      const touchedRules = new Map<string, { rule: AutomationRule; keys: string[] }>();

      await mapWithConcurrency(
        pending,
        async ({ obs, matching }) => {
          try {
            const res = await dispatchAutomations(brainId, obs.event, obs.payload);
            if (res.errors.length > 0) {
              errors.push(...res.errors.map((e) => `${brainId}:${e}`));
            }
            dispatched += res.executed;
            for (const rule of matching) {
              const t = touchedRules.get(rule.slug) ?? { rule, keys: [] };
              t.keys.push(obs.fireKey);
              touchedRules.set(rule.slug, t);
            }
          } catch (err) {
            errors.push(
              `${brainId}:${obs.fireKey}: ${err instanceof Error ? err.message : String(err)}`
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
