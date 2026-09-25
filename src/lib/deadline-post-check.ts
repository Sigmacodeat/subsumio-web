/**
 * Deterministic Deadline Post-Check
 *
 * Cross-references AI-extracted deadlines from pipeline output against the
 * deterministic calculation of the firm's Rechtsraum: Austria uses the AT
 * frist-engine (via computeFrist — § 222 ZPO, § 126 ZPO, Austrian holidays),
 * the same engine the pipeline itself uses; DE/CH use DEADLINE_RULES +
 * computeDueDate. A label that cannot be mapped safely to a Fristart is "not
 * verifiable" (null) — never checked against another country's rule.
 */

import {
  DEADLINE_RULES,
  computeDueDate,
  type DeadlineRule,
  type Bundesland,
  type Canton,
} from "@/lib/legal-deadlines";
import { computeFrist, fristOptionsFor, resolveFristCountry } from "@/lib/legal/frist-options";

export interface DeadlineCheckResult {
  caseSlug: string;
  caseTitle: string;
  deadlineLabel: string;
  aiDate: string;
  deterministicDate: string;
  ruleKey: string;
  ruleLaw: string;
  discrepancyDays: number;
  severity: "critical" | "warning" | "ok";
  note: string;
  startDate: string;
}

export interface DeadlineCheckSummary {
  total: number;
  checked: number;
  matched: number;
  discrepancies: number;
  critical: number;
  warnings: number;
  results: DeadlineCheckResult[];
}

/** Keyword → rule. Most specific first: "berufungsbegründung" before "berufung". */
type Matcher = { all: string[]; ruleKey: string };

const DE_MATCHERS: Matcher[] = [
  { all: ["verteidigungsanzeige"], ruleKey: "zpo-verteidigungsanzeige" },
  { all: ["klageerwiderung"], ruleKey: "zpo-klageerwiderung" },
  { all: ["erwiderung auf die klage"], ruleKey: "zpo-klageerwiderung" },
  { all: ["einspruch", "versäumnisurteil"], ruleKey: "zpo-einspruch-vu" },
  { all: ["berufungsbegründung"], ruleKey: "zpo-berufungsbegruendung" },
  { all: ["berufung"], ruleKey: "zpo-berufung" },
  { all: ["revision"], ruleKey: "zpo-revision" },
  { all: ["sofortige beschwerde"], ruleKey: "zpo-beschwerde" },
  { all: ["wiedereinsetzung"], ruleKey: "zpo-wiedereinsetzung" },
  { all: ["widerspruch", "verwaltungsakt"], ruleKey: "vwgo-widerspruch" },
  { all: ["anfechtungsklage"], ruleKey: "vwgo-klage" },
  { all: ["vollziehung", "verfügung"], ruleKey: "zpo-vollziehung-ev" },
];

const AT_MATCHERS: Matcher[] = [
  { all: ["berufungsbeantwortung"], ruleKey: "berufungsbeantwortung" },
  { all: ["revisionsrekurs"], ruleKey: "revisionsrekurs" },
  { all: ["revision", "vwgh"], ruleKey: "revision_vwgh" },
  { all: ["revision", "verwaltungsgerichtshof"], ruleKey: "revision_vwgh" },
  { all: ["beschwerde", "vfgh"], ruleKey: "beschwerde_vfgh" },
  { all: ["beschwerde", "verfassungsgerichtshof"], ruleKey: "beschwerde_vfgh" },
  { all: ["einspruch", "zahlungsbefehl"], ruleKey: "einspruch_zahlungsbefehl" },
  { all: ["widerspruch", "versäumungsurteil"], ruleKey: "widerspruch_versaeumungsurteil" },
  { all: ["klagebeantwortung"], ruleKey: "klagebeantwortung" },
  { all: ["wiedereinsetzung"], ruleKey: "wiedereinsetzung" },
  { all: ["bescheidbeschwerde"], ruleKey: "beschwerde_vwgvg" },
  { all: ["beschwerde", "verwaltungsgericht"], ruleKey: "beschwerde_vwgvg" },
  { all: ["vorstellung"], ruleKey: "vorstellung_avg" },
  { all: ["rekurs"], ruleKey: "rekurs" },
  { all: ["berufung"], ruleKey: "berufung" },
  { all: ["revision"], ruleKey: "revision" },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchKey(label: string, matchers: Matcher[]): string | null {
  const lower = norm(label);
  for (const m of matchers) {
    if (m.all.every((k) => lower.includes(k))) return m.ruleKey;
  }
  return null;
}

/** DE/CH: the generic DEADLINE_RULES table. */
function matchRule(label: string, law?: string): DeadlineRule | null {
  if (law) {
    const lawLower = norm(law);
    const byLaw = DEADLINE_RULES.find((r) => norm(r.law) === lawLower);
    if (byLaw) return byLaw;
  }
  const key = matchKey(label, DE_MATCHERS);
  return key ? (DEADLINE_RULES.find((r) => r.key === key) ?? null) : null;
}

/** AT: registry key by exact norm citation, else by keyword. */
function matchAtKey(label: string, law?: string): string | null {
  const options = fristOptionsFor("AT");
  if (law) {
    const lawLower = norm(law);
    const byLaw = options.filter((o) => norm(o.law) === lawLower);
    if (byLaw.length === 1) return byLaw[0].key;
  }
  const key = matchKey(label, AT_MATCHERS);
  return key && options.some((o) => o.key === key) ? key : null;
}

function severityFor(days: number): DeadlineCheckResult["severity"] {
  if (days === 0) return "ok";
  return Math.abs(days) <= 3 ? "warning" : "critical";
}

function dayDiff(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T12:00:00Z").getTime();
  const b = new Date(bIso + "T12:00:00Z").getTime();
  return Math.round((a - b) / 86_400_000);
}

/**
 * Run deterministic post-check on a single extracted deadline.
 * Returns null if no matching rule is found (can't verify deterministically).
 * `country` is the firm's Rechtsraum; without one the product's default
 * (Austria) applies — never German rules.
 */
export function checkSingleDeadline(
  caseSlug: string,
  caseTitle: string,
  label: string,
  aiDate: string,
  startDate: string,
  law?: string,
  state?: Bundesland | Canton,
  country?: "DE" | "AT" | "CH"
): DeadlineCheckResult | null {
  if (resolveFristCountry(country) === "AT") {
    const key = matchAtKey(label, law);
    if (!key) return null;
    let computed;
    try {
      computed = computeFrist(key, startDate, { country: "AT" });
    } catch {
      return null;
    }
    let dueDate = computed.dueDate;
    let note = computed.hinweise.join(" · ");
    // A Ferialsache (§ 222 Abs 2 ZPO) legitimately ends earlier — an AI date
    // that matches that variant is correct, not a discrepancy.
    if (computed.ferialsacheRelevant && aiDate !== dueDate) {
      const ferial = computeFrist(key, startDate, { country: "AT", ferialsache: true });
      if (ferial.dueDate === aiDate) {
        dueDate = ferial.dueDate;
        note = ferial.hinweise.join(" · ");
      }
    }
    const discrepancyDays = dayDiff(aiDate, dueDate);
    return {
      caseSlug,
      caseTitle,
      deadlineLabel: label,
      aiDate,
      deterministicDate: dueDate,
      ruleKey: key,
      ruleLaw: computed.law,
      discrepancyDays,
      severity: severityFor(discrepancyDays),
      note,
      startDate,
    };
  }

  const rule = matchRule(label, law);
  if (!rule) return null;
  const { dueDate, note } = computeDueDate(rule, startDate, state, country);
  const discrepancyDays = dayDiff(aiDate, dueDate);
  return {
    caseSlug,
    caseTitle,
    deadlineLabel: label,
    aiDate,
    deterministicDate: dueDate,
    ruleKey: rule.key,
    ruleLaw: rule.law,
    discrepancyDays,
    severity: severityFor(discrepancyDays),
    note,
    startDate,
  };
}

/**
 * Parse deadline calendar page content to extract deadline entries.
 * The pipeline writes deadline calendars as markdown tables.
 */
export function parseDeadlineCalendarPage(
  content: string,
  _caseSlug: string,
  _caseTitle: string
): Array<{ label: string; date: string; startDate: string; law?: string }> {
  const entries: Array<{ label: string; date: string; startDate: string; law?: string }> = [];

  // Parse markdown table rows: | Frist | Datum | ... |
  const lines = content.split("\n");
  for (const line of lines) {
    if (
      !line.startsWith("|") ||
      line.includes("---") ||
      (line.toLowerCase().includes("frist") &&
        line.toLowerCase().includes("datum") &&
        line.startsWith("| "))
    ) {
      // Skip header and separator rows
      if (
        line.includes("---") ||
        (line.toLowerCase().includes("frist") && line.toLowerCase().includes("datum"))
      )
        continue;
    }
    if (!line.startsWith("|")) continue;
    if (line.includes("---")) continue;

    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;

    // Try to find a date-like cell (YYYY-MM-DD or DD.MM.YYYY)
    let dateCell: string | undefined;
    let labelCell: string | undefined;
    let lawCell: string | undefined;
    let startDateCell: string | undefined;

    for (const cell of cells) {
      // ISO date
      const isoMatch = cell.match(/(\d{4}-\d{2}-\d{2})/);
      // DE date
      const deMatch = cell.match(/(\d{1,2})[.]\s*(\d{1,2})[.]\s*(\d{4})/);

      if (isoMatch && !dateCell) {
        dateCell = isoMatch[1];
      } else if (deMatch && !dateCell) {
        const [, d, m, y] = deMatch;
        dateCell = `${y}-${(m as string).padStart(2, "0")}-${(d as string).padStart(2, "0")}`;
      } else if (cell.match(/§|art\./i) && !lawCell) {
        lawCell = cell;
      } else if (cell.match(/zustell|beginn|ab dem|start/i) && !startDateCell) {
        const sdMatch = cell.match(/(\d{4}-\d{2}-\d{2})/);
        if (sdMatch) startDateCell = sdMatch[1];
      } else if (!labelCell && cell.length > 3 && !cell.match(/^\d/) && !cell.match(/§|art\./i)) {
        labelCell = cell;
      }
    }

    if (dateCell && labelCell) {
      entries.push({
        label: labelCell,
        date: dateCell,
        startDate: startDateCell ?? dateCell, // Fallback: use date as start if no start date found
        law: lawCell,
      });
    }
  }

  return entries;
}
