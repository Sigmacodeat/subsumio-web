/**
 * Litigation Analytics Data Model — P1-LITAN-001
 * ================================================
 * Datenmodell für Litigation-Analytics: Gericht, Richter,
 * Gegner, Kanzlei, Outcome und Dauer.
 */

export type CaseOutcome = "won" | "lost" | "settled" | "withdrawn" | "pending" | "unknown";
export type CaseStage = "pre_filing" | "filed" | "discovery" | "pre_trial" | "trial" | "appeal" | "closed";
export type CourtType = "local" | "regional" | "higher_regional" | "federal" | "constitutional" | "administrative" | "labor" | "social" | "tax" | "european";

export interface CourtRecord {
  id: string;
  name: string;
  type: CourtType;
  city: string;
  state: string;
  country: string;
  /** Stats */
  total_cases: number;
  win_rate_plaintiff: number;
  win_rate_defendant: number;
  avg_duration_days: number;
  median_duration_days: number;
}

export interface JudgeRecord {
  id: string;
  name: string;
  court_id: string;
  /** Stats */
  total_cases: number;
  plaintiff_win_rate: number;
  defendant_win_rate: number;
  settlement_rate: number;
  avg_duration_days: number;
  /** Tendencies */
  tends_to_dismiss: number;
  tends_to_deny_motions: number;
  allows_discovery_broadly: number;
}

export interface OpponentRecord {
  id: string;
  name: string;
  type: "individual" | "law_firm" | "company" | "government";
  /** Stats */
  total_cases: number;
  win_rate: number;
  loss_rate: number;
  settlement_rate: number;
  avg_case_duration_days: number;
  /** Strategy indicators */
  tends_to_settle: number;
  tends_to_litigate: number;
  avg_settlement_amount?: number;
}

export interface LitigationCase {
  id: string;
  case_slug: string;
  brain_id: string;
  org_id: string;
  /** Case details */
  title: string;
  court_id: string;
  judge_id?: string;
  opponent_id: string;
  our_client: string;
  our_role: "plaintiff" | "defendant" | "counsel";
  stage: CaseStage;
  outcome: CaseOutcome;
  /** Timing */
  filed_date?: string;
  closed_date?: string;
  duration_days?: number;
  /** Financials */
  claim_amount?: number;
  settlement_amount?: number;
  legal_costs?: number;
  /** Metadata */
  practice_area: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface LitigationAnalyticsSummary {
  total_cases: number;
  by_outcome: Record<CaseOutcome, number>;
  by_stage: Record<CaseStage, number>;
  win_rate: number;
  settlement_rate: number;
  avg_duration_days: number;
  avg_claim_amount: number;
  avg_settlement_amount: number;
  by_court: Record<string, { total: number; win_rate: number }>;
  by_judge: Record<string, { total: number; win_rate: number }>;
  by_opponent: Record<string, { total: number; win_rate: number }>;
}

// ── Factory ───────────────────────────────────────────────────────────

export function createLitigationCase(params: {
  case_slug: string;
  brain_id: string;
  org_id: string;
  title: string;
  court_id: string;
  opponent_id: string;
  our_client: string;
  our_role: "plaintiff" | "defendant" | "counsel";
  practice_area: string;
}): LitigationCase {
  const now = new Date().toISOString();
  return {
    id: `lit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: params.case_slug,
    brain_id: params.brain_id,
    org_id: params.org_id,
    title: params.title,
    court_id: params.court_id,
    opponent_id: params.opponent_id,
    our_client: params.our_client,
    our_role: params.our_role,
    stage: "pre_filing",
    outcome: "pending",
    practice_area: params.practice_area,
    tags: [],
    created_at: now,
    updated_at: now,
  };
}

// ── Analytics ─────────────────────────────────────────────────────────

export function calculateAnalytics(cases: LitigationCase[]): LitigationAnalyticsSummary {
  const byOutcome: Partial<Record<CaseOutcome, number>> = {};
  const byStage: Partial<Record<CaseStage, number>> = {};
  const byCourt: Record<string, { total: number; wins: number }> = {};
  const byJudge: Record<string, { total: number; wins: number }> = {};
  const byOpponent: Record<string, { total: number; wins: number }> = {};

  let totalDuration = 0;
  let durationCount = 0;
  let totalClaim = 0;
  let claimCount = 0;
  let totalSettlement = 0;
  let settlementCount = 0;
  let wins = 0;

  for (const c of cases) {
    byOutcome[c.outcome] = (byOutcome[c.outcome] ?? 0) + 1;
    byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;

    if (c.outcome === "won") wins++;
    if (c.duration_days) { totalDuration += c.duration_days; durationCount++; }
    if (c.claim_amount) { totalClaim += c.claim_amount; claimCount++; }
    if (c.settlement_amount) { totalSettlement += c.settlement_amount; settlementCount++; }

    if (!byCourt[c.court_id]) byCourt[c.court_id] = { total: 0, wins: 0 };
    byCourt[c.court_id].total++;
    if (c.outcome === "won") byCourt[c.court_id].wins++;

    if (c.judge_id) {
      if (!byJudge[c.judge_id]) byJudge[c.judge_id] = { total: 0, wins: 0 };
      byJudge[c.judge_id].total++;
      if (c.outcome === "won") byJudge[c.judge_id].wins++;
    }

    if (!byOpponent[c.opponent_id]) byOpponent[c.opponent_id] = { total: 0, wins: 0 };
    byOpponent[c.opponent_id].total++;
    if (c.outcome === "won") byOpponent[c.opponent_id].wins++;
  }

  const total = cases.length;
  const courtSummary: Record<string, { total: number; win_rate: number }> = {};
  for (const [k, v] of Object.entries(byCourt)) {
    courtSummary[k] = { total: v.total, win_rate: v.wins / v.total };
  }
  const judgeSummary: Record<string, { total: number; win_rate: number }> = {};
  for (const [k, v] of Object.entries(byJudge)) {
    judgeSummary[k] = { total: v.total, win_rate: v.wins / v.total };
  }
  const opponentSummary: Record<string, { total: number; win_rate: number }> = {};
  for (const [k, v] of Object.entries(byOpponent)) {
    opponentSummary[k] = { total: v.total, win_rate: v.wins / v.total };
  }

  return {
    total_cases: total,
    by_outcome: byOutcome as Record<CaseOutcome, number>,
    by_stage: byStage as Record<CaseStage, number>,
    win_rate: total > 0 ? wins / total : 0,
    settlement_rate: total > 0 ? (byOutcome["settled"] ?? 0) / total : 0,
    avg_duration_days: durationCount > 0 ? totalDuration / durationCount : 0,
    avg_claim_amount: claimCount > 0 ? totalClaim / claimCount : 0,
    avg_settlement_amount: settlementCount > 0 ? totalSettlement / settlementCount : 0,
    by_court: courtSummary,
    by_judge: judgeSummary,
    by_opponent: opponentSummary,
  };
}

export const OUTCOME_LABELS: Record<CaseOutcome, string> = {
  won: "Gewonnen",
  lost: "Verloren",
  settled: "Verglichen",
  withdrawn: "Zurückgezogen",
  pending: "Ausstehend",
  unknown: "Unbekannt",
};

export const STAGE_LABELS: Record<CaseStage, string> = {
  pre_filing: "Vor Klageeinreichung",
  filed: "Eingereicht",
  discovery: "Beweisaufnahme",
  pre_trial: "Vor Verhandlung",
  trial: "Verhandlung",
  appeal: "Berufung",
  closed: "Abgeschlossen",
};
