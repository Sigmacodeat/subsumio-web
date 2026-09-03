/**
 * Deterministic Deadline Post-Check
 *
 * Cross-references AI-extracted deadlines from pipeline output against
 * the deterministic DEADLINE_RULES + computeDueDate calculation.
 * Flags discrepancies where the AI-extracted date doesn't match the
 * statutory calculation — a purely code-based verification layer
 * that doesn't rely on AI, preventing silent deadline errors.
 */

import {
  DEADLINE_RULES,
  computeDueDate,
  type DeadlineRule,
  type Bundesland,
  type Canton,
} from "@/lib/legal-deadlines";

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

/**
 * Match a deadline label/description against a DEADLINE_RULE by keyword matching.
 * Returns the best matching rule or null.
 */
function matchRule(label: string, law?: string): DeadlineRule | null {
  const lower = label.toLowerCase();

  // First try exact law citation match
  if (law) {
    const lawLower = law.toLowerCase();
    const byLaw = DEADLINE_RULES.find((r) => r.law.toLowerCase() === lawLower);
    if (byLaw) return byLaw;
  }

  // Keyword-based matching
  const matchers: Array<{ keywords: string[]; ruleKey: string }> = [
    { keywords: ["verteidigungsanzeige"], ruleKey: "zpo-verteidigungsanzeige" },
    { keywords: ["klageerwiderung", "erwiderung auf die klage"], ruleKey: "zpo-klageerwiderung" },
    { keywords: ["einspruch", "versäumnisurteil"], ruleKey: "zpo-einspruch-vu" },
    { keywords: ["berufung"], ruleKey: "zpo-berufung" },
    { keywords: ["berufungsbegründung"], ruleKey: "zpo-berufungsbegruendung" },
    { keywords: ["revision"], ruleKey: "zpo-revision" },
    { keywords: ["sofortige beschwerde", "beschwerde"], ruleKey: "zpo-beschwerde" },
    { keywords: ["wiedereinsetzung"], ruleKey: "zpo-wiedereinsetzung" },
    { keywords: ["verjährung", "verjaehrung"], ruleKey: "abgb-verjaehrung" },
    { keywords: ["widerspruch", "verwaltungsakt"], ruleKey: "vwgo-widerspruch" },
    { keywords: ["klagefrist", "anfechtungsklage"], ruleKey: "vwgo-klage" },
    {
      keywords: ["vollziehung", "einstweilige verfügung", "einstw. verfügung"],
      ruleKey: "zpo-vollziehung-ev",
    },
  ];

  for (const m of matchers) {
    if (m.keywords.some((k) => lower.includes(k))) {
      const rule = DEADLINE_RULES.find((r) => r.key === m.ruleKey);
      if (rule) return rule;
    }
  }

  return null;
}

/**
 * Run deterministic post-check on a single extracted deadline.
 * Returns null if no matching rule is found (can't verify deterministically).
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
  const rule = matchRule(label, law);
  if (!rule) return null;

  const { dueDate, note } = computeDueDate(rule, startDate, state, country);

  // Compare dates
  const ai = new Date(aiDate + "T12:00:00Z");
  const det = new Date(dueDate + "T12:00:00Z");
  const diffMs = ai.getTime() - det.getTime();
  const discrepancyDays = Math.round(diffMs / 86_400_000);

  let severity: DeadlineCheckResult["severity"];
  if (Math.abs(discrepancyDays) === 0) {
    severity = "ok";
  } else if (Math.abs(discrepancyDays) <= 3) {
    severity = "warning";
  } else {
    severity = "critical";
  }

  return {
    caseSlug,
    caseTitle,
    deadlineLabel: label,
    aiDate,
    deterministicDate: dueDate,
    ruleKey: rule.key,
    ruleLaw: rule.law,
    discrepancyDays,
    severity,
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
