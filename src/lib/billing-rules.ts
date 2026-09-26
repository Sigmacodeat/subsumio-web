/**
 * Abrechnungsregeln der Kanzlei — Abrechnungstakt und Satz-Herkunft beim
 * Übernehmen von Zeiteinträgen in eine Rechnung.
 *
 * Opt-in: nur wenn `billingRulesEnabled === true` in den
 * Kanzlei-Einstellungen. Ist der Schalter aus, rechnet jede Rechnung exakt
 * wie bisher (erfasste Minuten × Satz des Eintrags bzw. Kanzlei-Stundensatz).
 *
 * Ist er an:
 *  - die abrechenbare Dauer wird auf den nächsten Takt AUFGERUNDET
 *    (22 min bei Takt 10 → 30 min). Der Zeiteintrag selbst bleibt
 *    unverändert; die Position speichert erfasste (`recorded_minutes`) und
 *    abgerechnete (`billed_minutes`) Minuten;
 *  - der Satz kommt aus: Satz am Zeiteintrag (individuell vereinbart, auch
 *    0 = pro bono) > Honorarvereinbarung der Akte > Satz je Rechtsgebiet der
 *    Akte > Kanzlei-Stundensatz. Jede Position trägt `rate_source`.
 *    Ohne gültigen Satz wird keiner erfunden (rate null → Hinweis).
 *
 * Browser (Rechnungsdialog), Copilot-Entwurf und Serverprüfung
 * (POST /api/invoices) nutzen dieselben Funktionen.
 */
import { parseHourlyRate, roundEur, toCents } from "@/lib/invoice-totals";

export const BILLING_INCREMENT_MIN = 1;
export const BILLING_INCREMENT_MAX = 60;

export type RateSource = "time_entry" | "fee_agreement" | "legal_area" | "firm_default";

export const RATE_SOURCES: readonly RateSource[] = [
  "time_entry",
  "fee_agreement",
  "legal_area",
  "firm_default",
];

export const RATE_SOURCE_LABELS_DE: Record<RateSource, string> = {
  time_entry: "Satz am Zeiteintrag",
  fee_agreement: "Honorarvereinbarung der Akte",
  legal_area: "Satz je Rechtsgebiet",
  firm_default: "Kanzlei-Stundensatz",
};

/** The settings fields the rules read. */
export interface BillingRuleSettings {
  billingRulesEnabled?: boolean;
  abrechnungstakt?: string | number;
  stundensatz?: string | number;
  rechtsgebietSaetze?: Record<string, number>;
}

/**
 * Abrechnungstakt in ganzen Minuten, 1–60. Alles andere (leer, 0, 61, 7,5,
 * Text) → null: dann wird nicht gerundet.
 */
export function parseBillingIncrement(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(raw) || !Number.isInteger(raw)) return null;
  if (raw < BILLING_INCREMENT_MIN || raw > BILLING_INCREMENT_MAX) return null;
  return raw;
}

export interface ActiveBillingRules {
  /** Takt in Minuten; null = Takt ungültig/leer, dann keine Rundung. */
  increment: number | null;
}

/** The active rules, or null when the firm has not switched them on. */
export function activeBillingRules(
  settings: BillingRuleSettings | null | undefined
): ActiveBillingRules | null {
  if (settings?.billingRulesEnabled !== true) return null;
  return { increment: parseBillingIncrement(settings.abrechnungstakt) };
}

/**
 * Round a recorded duration UP to the next increment. 0 (or less, or not a
 * number) stays 0 — no work, nothing billed. Without an increment the
 * duration is returned unchanged.
 */
export function roundUpToIncrement(minutes: number, increment: number | null): number {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return 0;
  if (increment === null || increment === undefined) return m;
  // The epsilon keeps an exact multiple (30.000000001 from a float sum) from
  // jumping a whole increment.
  return Math.ceil(m / increment - 1e-9) * increment;
}

/** Hours with four decimals — 20 min = 0,3333 h. */
export function roundHours(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Amount of a time position: minutes × hourly rate, rounded to the cent. */
export function timeLineAmount(minutes: number, rate: number): number {
  const m = Number.isFinite(minutes) ? minutes : 0;
  const r = Number.isFinite(rate) ? rate : 0;
  return roundEur((m * r) / 60);
}

/** Normalise a practice-area key: "Arbeitsrecht " → "arbeitsrecht". */
function areaKey(value: string): string {
  return value.trim().toLocaleLowerCase("de-AT");
}

/** Rate for the matter's practice area from `rechtsgebietSaetze`, or null. */
export function legalAreaRate(
  saetze: Record<string, number> | null | undefined,
  legalArea: string | null | undefined
): number | null {
  if (!saetze || !legalArea || !legalArea.trim()) return null;
  const wanted = areaKey(legalArea);
  for (const [key, value] of Object.entries(saetze)) {
    if (areaKey(key) === wanted) return parseHourlyRate(value);
  }
  return null;
}

export interface FeeAgreementLike {
  case_slug?: string;
  hourly_rate?: number | string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Hourly rate of the matter's fee agreement (the most recently updated one
 * with a usable hourly rate), or null.
 */
export function feeAgreementRate(
  agreements: FeeAgreementLike[] | null | undefined,
  caseSlug: string
): number | null {
  const withRate = (agreements ?? [])
    .filter((a) => a && a.case_slug === caseSlug)
    .map((a) => ({ a, rate: parseHourlyRate(a.hourly_rate ?? null) }))
    .filter((x): x is { a: FeeAgreementLike; rate: number } => x.rate !== null);
  if (withRate.length === 0) return null;
  const stamp = (a: FeeAgreementLike) => String(a.updated_at ?? a.created_at ?? "");
  withRate.sort((x, y) => stamp(y.a).localeCompare(stamp(x.a)));
  return withRate[0].rate;
}

export interface RateContext {
  /** Rate from the matter's fee agreement (see feeAgreementRate). */
  feeAgreementRate: number | null;
  /** The matter's `legal_area`. */
  legalArea?: string | null;
  settings: BillingRuleSettings | null | undefined;
}

export interface ResolvedRate {
  rate: number | null;
  source: RateSource | null;
}

/**
 * Which hourly rate a time entry is billed at, and where it comes from.
 * An explicit rate on the entry (including 0 = pro bono) always wins.
 */
export function resolveHourlyRate(entryRate: unknown, ctx: RateContext): ResolvedRate {
  if (entryRate !== null && entryRate !== undefined && entryRate !== "") {
    const n = Number(entryRate);
    if (Number.isFinite(n) && n >= 0) return { rate: n, source: "time_entry" };
  }
  if (ctx.feeAgreementRate !== null && ctx.feeAgreementRate > 0) {
    return { rate: ctx.feeAgreementRate, source: "fee_agreement" };
  }
  const area = legalAreaRate(ctx.settings?.rechtsgebietSaetze, ctx.legalArea);
  if (area !== null) return { rate: area, source: "legal_area" };
  const firm = parseHourlyRate(ctx.settings?.stundensatz ?? null);
  if (firm !== null) return { rate: firm, source: "firm_default" };
  return { rate: null, source: null };
}

export interface TimeEntryLike {
  /** Entry id; carried into the position as `time_entry_id`. */
  id?: string;
  description: string;
  date?: string;
  minutes: number;
  rate?: number | null;
}

export interface RuledTimeItem {
  description: string;
  date: string;
  hours: number;
  rate: number;
  amount: number;
  recorded_minutes: number;
  billed_minutes: number;
  rate_source: RateSource;
  /** The time entry this position bills (the server check pairs by it). */
  time_entry_id?: string;
}

/**
 * The invoice position of one time entry under the active rules. Returns
 * null when no rate can be found — the caller shows a hint and must not
 * invent one.
 */
export function ruledTimeItem(
  entry: TimeEntryLike,
  rules: ActiveBillingRules,
  ctx: RateContext
): RuledTimeItem | null {
  const { rate, source } = resolveHourlyRate(entry.rate, ctx);
  if (rate === null || source === null) return null;
  const recorded = Number.isFinite(Number(entry.minutes)) ? Math.max(0, Number(entry.minutes)) : 0;
  const billed = roundUpToIncrement(recorded, rules.increment);
  return {
    description: entry.description,
    date: String(entry.date ?? "").split("T")[0],
    hours: roundHours(billed / 60),
    rate,
    amount: timeLineAmount(billed, rate),
    recorded_minutes: recorded,
    billed_minutes: billed,
    rate_source: source,
    ...(typeof entry.id === "string" && entry.id ? { time_entry_id: entry.id } : {}),
  };
}

/**
 * Positions for several time entries of one matter. `missingRate` counts the
 * entries without any usable rate — the invoice must not be created then.
 */
export function ruledTimeItems(
  entries: TimeEntryLike[],
  rules: ActiveBillingRules,
  ctx: RateContext
): { items: RuledTimeItem[]; missingRate: number } {
  const items: RuledTimeItem[] = [];
  let missingRate = 0;
  for (const entry of entries) {
    const item = ruledTimeItem(entry, rules, ctx);
    if (item) items.push(item);
    else missingRate++;
  }
  return { items, missingRate };
}

/** A billed duration as "1 h 30 min" / "22 min". */
export function formatMinutesDe(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

// ── Serverprüfung ─────────────────────────────────────────────────────────

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Checks the time positions of an invoice against the firm's billing rules —
 * the same functions the dialog used to build them. Returns the problems
 * (empty = consistent).
 *
 *  - Rules off: a position may carry recorded/billed minutes, but billed must
 *    equal recorded (no rounding without the switch).
 *  - Rules on: every time entry the invoice bills has exactly one position
 *    with recorded/billed minutes; billed = recorded rounded up to the
 *    increment.
 *  - Always, for such a position: hours and amount follow from the billed
 *    minutes and the rate, and `rate_source` is a known value.
 */
export function checkTimeItemBilling(
  fm: Record<string, unknown>,
  rules: ActiveBillingRules | null
): string[] {
  const problems: string[] = [];
  const items = Array.isArray(fm.items) ? (fm.items as Array<Record<string, unknown>>) : [];
  const timeEntryIds = Array.isArray(fm.time_entry_ids) ? fm.time_entry_ids : [];
  let ruled = 0;
  items.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;
    const hasRecorded = item.recorded_minutes !== undefined;
    const hasBilled = item.billed_minutes !== undefined;
    if (!hasRecorded && !hasBilled) return;
    ruled++;
    const recorded = item.recorded_minutes;
    const billed = item.billed_minutes;
    if (!isNum(recorded) || !isNum(billed) || recorded < 0 || billed < 0) {
      problems.push(`items[${idx}].minutes`);
      return;
    }
    const expected = rules ? roundUpToIncrement(recorded, rules.increment) : recorded;
    if (Math.abs(billed - expected) > 1e-6) problems.push(`items[${idx}].billed_minutes`);
    const rate = Number(item.rate);
    if (!Number.isFinite(rate) || rate < 0) {
      problems.push(`items[${idx}].rate`);
      return;
    }
    if (Math.abs(Number(item.hours) - roundHours(billed / 60)) > 1e-9) {
      problems.push(`items[${idx}].hours`);
    }
    if (toCents(item.amount) !== toCents(timeLineAmount(billed, rate))) {
      problems.push(`items[${idx}].amount`);
    }
    if (item.rate_source !== undefined && !RATE_SOURCES.includes(item.rate_source as RateSource)) {
      problems.push(`items[${idx}].rate_source`);
    }
  });
  if (rules && timeEntryIds.length > 0 && ruled !== timeEntryIds.length) {
    problems.push("time_items");
  }
  return problems;
}

/**
 * Checks the time positions against the STORED time entries they bill — not
 * only against themselves. Every id in `time_entry_ids` needs exactly one
 * position (paired by `time_entry_id`, or — for positions without it — in
 * the order of `time_entry_ids`), and that position must carry the entry's
 * recorded minutes and the rate that applies to it:
 *
 *  - rules on: exactly the position `ruledTimeItem` builds from the stored
 *    entry (rounding, rate by entry > fee agreement > practice area > firm,
 *    `rate_source`, amount);
 *  - rules off: the entry's minutes at the entry's rate (firm rate when the
 *    entry has none), amount = minutes / 60 × rate.
 *
 * `stored` maps entry id → stored entry; an id without a stored entry is a
 * problem. Returns the problems (empty = the positions follow the records).
 */
export function checkTimeItemsAgainstEntries(
  fm: Record<string, unknown>,
  stored: ReadonlyMap<string, TimeEntryLike>,
  rules: ActiveBillingRules | null,
  ctx: RateContext
): string[] {
  const problems: string[] = [];
  const ids = Array.isArray(fm.time_entry_ids) ? [...new Set(fm.time_entry_ids.map(String))] : [];
  const items = Array.isArray(fm.items) ? (fm.items as Array<Record<string, unknown>>) : [];
  const timeItems = items
    .map((item, idx) => ({ item, idx }))
    .filter(
      ({ item }) =>
        !!item &&
        typeof item === "object" &&
        (typeof item.time_entry_id === "string" ||
          item.recorded_minutes !== undefined ||
          item.billed_minutes !== undefined ||
          Number(item.hours) > 0)
    );
  if (ids.length === 0) {
    // Time positions without billed time entries are not bound to any record.
    for (const { idx } of timeItems) problems.push(`items[${idx}].time_entry_id`);
    return problems;
  }

  const pairs: Array<{ id: string; item: Record<string, unknown>; idx: number }> = [];
  if (
    timeItems.length > 0 &&
    timeItems.every(({ item }) => typeof item.time_entry_id === "string")
  ) {
    const wanted = new Set(ids);
    const seen = new Set<string>();
    for (const { item, idx } of timeItems) {
      const id = String(item.time_entry_id);
      if (!wanted.has(id) || seen.has(id)) {
        problems.push(`items[${idx}].time_entry_id`);
        continue;
      }
      seen.add(id);
      pairs.push({ id, item, idx });
    }
    if (seen.size !== wanted.size) problems.push("time_items");
  } else if (timeItems.length !== ids.length) {
    problems.push("time_items");
  } else {
    ids.forEach((id, i) => pairs.push({ id, ...timeItems[i]! }));
  }

  const firmRate = parseHourlyRate(ctx.settings?.stundensatz ?? null);
  for (const { id, item, idx } of pairs) {
    const entry = stored.get(id);
    const at = `items[${idx}]`;
    if (!entry) {
      problems.push(`${at}.time_entry`);
      continue;
    }
    if (rules) {
      const want = ruledTimeItem(entry, rules, ctx);
      if (!want) {
        problems.push(`${at}.rate`);
        continue;
      }
      if (Number(item.recorded_minutes) !== want.recorded_minutes) {
        problems.push(`${at}.recorded_minutes`);
      }
      if (Math.abs(Number(item.billed_minutes) - want.billed_minutes) > 1e-6) {
        problems.push(`${at}.billed_minutes`);
      }
      if (toCents(item.rate) !== toCents(want.rate)) problems.push(`${at}.rate`);
      if (item.rate_source !== want.rate_source) problems.push(`${at}.rate_source`);
      if (toCents(item.amount) !== toCents(want.amount)) problems.push(`${at}.amount`);
      continue;
    }
    const minutes = Math.max(0, Number(entry.minutes) || 0);
    const own = Number(entry.rate);
    const rate = Number.isFinite(own) && own !== 0 ? own : firmRate;
    if (rate === null || rate < 0) {
      problems.push(`${at}.rate`);
      continue;
    }
    if (item.recorded_minutes !== undefined && Number(item.recorded_minutes) !== minutes) {
      problems.push(`${at}.recorded_minutes`);
    }
    if (Math.abs(Number(item.hours) - roundHours(minutes / 60)) > 1e-9) {
      problems.push(`${at}.hours`);
    }
    if (toCents(item.rate) !== toCents(rate)) problems.push(`${at}.rate`);
    if (toCents(item.amount) !== toCents(roundEur((minutes / 60) * rate))) {
      problems.push(`${at}.amount`);
    }
  }
  return problems;
}
