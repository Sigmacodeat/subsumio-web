/**
 * Case scanner (on demand) — client-safe constants and pricing.
 *
 * A scan runs only when a lawyer or admin starts it for one matter, a
 * selection or all open matters they may see. Each matter is one agent run,
 * billed at CREDIT_COSTS.case_scan after the user confirmed the preview.
 */
import { CREDIT_COSTS } from "@/lib/billing/credit-constants";

/** Most matters one scan may cover (the engine enforces the same cap). */
export const CASE_SCAN_MAX_CASES = 50;

export type CaseScanScope = "case" | "selection" | "all_open";

/** Credits a scan of `count` matters costs. */
export function caseScanCost(count: number): number {
  return Math.max(0, Math.floor(count)) * CREDIT_COSTS.case_scan;
}

/**
 * Idempotency key of one matter's booking in a scan — the same key refunds it
 * when the run delivers no result.
 */
export function caseScanBookingKey(scanId: string, caseSlug: string): string {
  return `case-scan:${scanId}:${caseSlug}`;
}

/** Run states that ended without a result (the booking is refunded). */
export const CASE_SCAN_FAILED_STATES: ReadonlySet<string> = new Set([
  "failed",
  "dead",
  "cancelled",
]);

export interface CaseScanPreviewCase {
  case_slug: string;
  title: string;
  reasons: string[];
}

export interface CaseScanSkipped {
  case_slug: string;
  reason: string;
}

export interface CaseScanPreview {
  cases: CaseScanPreviewCase[];
  skipped: CaseScanSkipped[];
  truncated: boolean;
  count: number;
  credits_per_case: number;
  total_credits: number;
  balance: number | null;
  sufficient: boolean;
  max_cases: number;
}

export interface CaseScanStartResult {
  scan_id: string;
  launched: Array<{ case_slug: string; job_id: number }>;
  failed: CaseScanSkipped[];
  skipped: CaseScanSkipped[];
  charged_credits: number;
  refunded_credits: number;
}

export interface CaseScanStatus {
  scan_id: string;
  runs: Array<{ job_id: number; case_slug: string; status: string; refunded: boolean }>;
}

/** Longest finding text shown (and grounded) per review item. */
export const CASE_SCAN_FINDING_MAX_CHARS = 8000;

// Section headings of an agent run's result page (engine supervisor handler).
const RESULT_HEADING = "## Ergebnis";
const REVISED_HEADING = "## Überarbeitetes Ergebnis (nach Critic)";
const CRITIC_HEADING = "## Critic-Review";
const SPECIALISTS_HEADING = "## Specialist-Ergebnisse";

/**
 * The finding of a scan run's result page: the revised result when the
 * critic asked for one, else the result section, else the whole page — capped
 * at CASE_SCAN_FINDING_MAX_CHARS.
 */
export function extractScanFinding(content: string | null | undefined): string {
  const text = (content ?? "").trim();
  if (!text) return "";
  // The result itself may use "##" headings: a section ends only at one of the
  // headings the result page puts after it.
  const section = (heading: string, endHeadings: string[]): string | null => {
    const marker = `\n${heading}\n`;
    const start = text.indexOf(marker);
    if (start < 0) return null;
    const body = text.slice(start + marker.length);
    const ends = endHeadings.map((h) => body.indexOf(`\n${h}\n`)).filter((i) => i >= 0);
    const end = ends.length > 0 ? Math.min(...ends) : body.length;
    return body.slice(0, end).trim() || null;
  };
  const finding =
    section(REVISED_HEADING, [CRITIC_HEADING, SPECIALISTS_HEADING]) ??
    section(RESULT_HEADING, [REVISED_HEADING, CRITIC_HEADING, SPECIALISTS_HEADING]) ??
    text;
  return finding.length > CASE_SCAN_FINDING_MAX_CHARS
    ? `${finding.slice(0, CASE_SCAN_FINDING_MAX_CHARS)}…`
    : finding;
}
