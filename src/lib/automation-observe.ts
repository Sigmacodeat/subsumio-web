/**
 * Reine Auswertungslogik des Automations-Crons: aus Entity-Seiten werden
 * Beobachtungen (Ereignisse), aus Beobachtungen und Regeln ein Ausführungs-
 * plan. Ohne I/O — der Cron (/api/cron/automations) liest und schreibt.
 */

import {
  dueSoonWindow,
  floorVerdict,
  needsBaseline,
  ruleMatches,
  type AutomationEventPayload,
  type AutomationRule,
  type Observation,
} from "@/lib/automation-model";

/** Eine Entity-Seite, wie die Engine sie listet. */
export interface ObservedPage {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown>;
  /** Engine-Anlagezeit — bleibt bei jedem Speichern erhalten. */
  created_at?: string;
}

interface DeadlineLike {
  id?: string;
  title?: string;
  due_date?: string;
  status?: string;
  created_at?: string;
  createdAt?: string;
}

function fm(page: ObservedPage): Record<string, unknown> {
  return page.frontmatter ?? {};
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function validIso(v: unknown): string | undefined {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : undefined;
}

/**
 * Wann eine Entity entstand: die Engine-Anlagezeit, sonst ein Zeitstempel
 * aus dem Frontmatter.
 */
function createdAt(page: ObservedPage, ...fmKeys: string[]): string | undefined {
  const engine = validIso(page.created_at);
  if (engine) return engine;
  for (const k of fmKeys) {
    const v = validIso(fm(page)[k]);
    if (v) return v;
  }
  return undefined;
}

function dayAfter(isoDate: string): string | undefined {
  const t = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? undefined : new Date(t + 86_400_000).toISOString();
}

function laterOf(a: string | undefined, b: string | undefined): string | undefined {
  if (!a || !b) return undefined;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * Scannt die Entity-Pages einer Brain und erzeugt Observations für jeden
 * Trigger-Typ. „Erstellt"-Events feuern einmal pro Entity; „Status geändert"
 * einmal pro Statuswert; „bald fällig/überfällig" einmal pro Frist/Rechnung.
 * Jede Observation trägt, soweit bekannt, den Zeitpunkt des Ereignisses —
 * damit übergeht eine Regel alles vor ihrem Stichtag.
 */
export function collectObservations(
  rules: AutomationRule[],
  pages: Record<string, ObservedPage[]>,
  now: Date
): Observation[] {
  const events = new Set(rules.map((r) => r.event));
  const dueSoonDays = Math.max(
    0,
    ...rules.filter((r) => r.event === "deadline.due_soon").map((r) => dueSoonWindow(r))
  );
  const out: Observation[] = [];
  const cases = pages.legal_case ?? [];

  if (events.has("case.created") || events.has("case.status_changed")) {
    for (const c of cases) {
      const caseCreated = createdAt(c, "created_at", "createdAt");
      if (events.has("case.created")) {
        out.push({
          event: "case.created",
          fireKey: `case:${c.slug}`,
          payload: { case_slug: c.slug, title: c.title ?? c.slug },
          occurredAt: caseCreated,
        });
      }
      const status = str(fm(c).status);
      if (events.has("case.status_changed") && status) {
        out.push({
          event: "case.status_changed",
          fireKey: `status:${c.slug}:${status}`,
          payload: { case_slug: c.slug, title: c.title ?? c.slug, status },
          occurredAt: validIso(fm(c).status_changed_at),
          notBefore: caseCreated,
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
        occurredAt: createdAt(d, "uploaded_at", "created_at"),
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
        occurredAt: createdAt(e, "received_at", "created_at"),
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
        occurredAt: createdAt(b, "created_at", "booked_at"),
      });
    }
  }

  if (events.has("deadline.created") || events.has("deadline.due_soon")) {
    for (const c of cases) {
      const caseCreated = createdAt(c, "created_at", "createdAt");
      const deadlines = Array.isArray(fm(c).deadlines) ? (fm(c).deadlines as DeadlineLike[]) : [];
      for (const dl of deadlines) {
        if (!dl.due_date || dl.status === "done") continue;
        const dlId = dl.id ?? dl.due_date;
        const dlCreated = validIso(dl.created_at) ?? validIso(dl.createdAt);
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
            occurredAt: dlCreated,
            // A deadline never predates its matter.
            notBefore: caseCreated,
          });
        }
        if (events.has("deadline.due_soon")) {
          const due = new Date(`${dl.due_date}T00:00:00Z`);
          const daysLeft = Number.isNaN(due.getTime())
            ? null
            : Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
          if (daysLeft !== null && daysLeft >= 0 && daysLeft <= dueSoonDays) {
            out.push({
              event: "deadline.due_soon",
              fireKey: `due:${c.slug}:${dlId}`,
              payload: { ...base, days_left: String(daysLeft) },
              // The window entry depends on the rule — see floorVerdict.
              occurredAt: dlCreated,
              notBefore: caseCreated,
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
      // Überfällig ab dem Tag nach der Fälligkeit — frühestens ab Anlage.
      const overdueFrom = dayAfter(due);
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
        occurredAt: laterOf(overdueFrom, createdAt(inv, "created_at")),
        notBefore: overdueFrom,
      });
    }
  }

  return out;
}

export interface RulePlan {
  /** Auszuführen: neu seit dem Stichtag, noch nicht gefeuert. */
  runs: { rule: AutomationRule; obs: Observation }[];
  /** Bestand beim Stichtag mit unbekanntem Zeitpunkt: merken, nicht ausführen. */
  baseline: Map<string, string[]>;
}

/**
 * Welche Regel führt was aus? Rein und deterministisch:
 *   - nur passende Ereignisse, die die Regel noch nicht kennt (fired_keys);
 *   - nichts, was sicher vor dem Stichtag der Regel lag (active_since, bei
 *     Altregeln ihre Anlage);
 *   - beim ersten Lauf nach einem neuen Stichtag werden Ereignisse ohne
 *     bekannten Zeitpunkt nur gemerkt — sie könnten alt sein.
 */
export function planRuleRuns(rules: AutomationRule[], observations: Observation[]): RulePlan {
  const runs: RulePlan["runs"] = [];
  const baseline = new Map<string, string[]>();
  for (const rule of rules) {
    const fired = new Set(rule.fired_keys ?? []);
    const firstRun = needsBaseline(rule);
    for (const obs of observations) {
      if (fired.has(obs.fireKey) || !ruleMatches(rule, obs.event, obs.payload)) continue;
      const verdict = floorVerdict(rule, obs);
      if (verdict === "old") continue;
      if (verdict === "unknown" && firstRun) {
        const keys = baseline.get(rule.slug) ?? [];
        keys.push(obs.fireKey);
        baseline.set(rule.slug, keys);
        continue;
      }
      runs.push({ rule, obs });
    }
  }
  return { runs, baseline };
}
