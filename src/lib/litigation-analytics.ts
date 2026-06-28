/**
 * Litigation Analytics — Gerichts-/Richter-/Outcome-Analytics für Kanzleien.
 *
 * DACH-konforme Analyse von Verfahrensergebnissen:
 *   - Gerichtsstatistik (Erfolgsquoten pro Gericht)
 *   - Richterprofil (Tendenzen, Erfolgsquoten)
 *   - Outcome-Tracking (gewonnen/verloren/vergleich/teilweise)
 *   - Verfahrensdauer-Analyse
 *   - Kanzlei-KPIs (Durchschnittsdauer, Erfolgsquote, Aufwand)
 *
 * Datenmodell: Analytics-Daten werden als Brain-Pages (type=litigation_analytics)
 * gespeichert, pro Verfahren ein Eintrag mit Gericht, Richter, Outcome, Dauer.
 */

export type OutcomeType = "won" | "lost" | "settled" | "partial" | "withdrawn" | "pending";
export type CourtLevel =
  | "amtsgericht"
  | "landesgericht"
  | "oberlandesgericht"
  | "bundesgericht"
  | "verwaltungsgericht"
  | "finanzgericht"
  | "arbeitsgericht"
  | "sozialgericht";
export type ProcedureType =
  | "zivil"
  | "straf"
  | "verwaltungs"
  | "finanz"
  | "arbeits"
  | "sozial"
  | "familie";

export interface CaseOutcome {
  slug: string;
  caseSlug: string;
  caseTitle: string;
  caseNumber?: string;
  court: string;
  courtLevel?: CourtLevel;
  judge?: string;
  procedureType: ProcedureType;
  outcome: OutcomeType;
  amountInDispute?: number;
  amountAwarded?: number;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  lawyerHours?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export const OUTCOME_LABELS_DE: Record<OutcomeType, string> = {
  won: "Gewonnen",
  lost: "Verloren",
  settled: "Vergleich",
  partial: "Teilweise",
  withdrawn: "Zurückgenommen",
  pending: "Anhängig",
};

export const OUTCOME_COLORS: Record<OutcomeType, string> = {
  won: "#22c55e",
  lost: "#ef4444",
  settled: "#6366f1",
  partial: "#f59e0b",
  withdrawn: "#8b5cf6",
  pending: "#6b7280",
};

export const COURT_LEVEL_LABELS_DE: Record<CourtLevel, string> = {
  amtsgericht: "Amtsgericht",
  landesgericht: "Landesgericht",
  oberlandesgericht: "Oberlandesgericht",
  bundesgericht: "Bundesgericht",
  verwaltungsgericht: "Verwaltungsgericht",
  finanzgericht: "Finanzgericht",
  arbeitsgericht: "Arbeitsgericht",
  sozialgericht: "Sozialgericht",
};

export const PROCEDURE_TYPE_LABELS_DE: Record<ProcedureType, string> = {
  zivil: "Zivilrecht",
  straf: "Strafrecht",
  verwaltungs: "Verwaltungsrecht",
  finanz: "Finanzrecht",
  arbeits: "Arbeitsrecht",
  sozial: "Sozialrecht",
  familie: "Familienrecht",
};

export interface CourtStats {
  court: string;
  total: number;
  won: number;
  lost: number;
  settled: number;
  partial: number;
  withdrawn: number;
  pending: number;
  winRate: number;
  avgDurationDays: number;
  avgAmountInDispute: number;
}

export interface JudgeStats {
  judge: string;
  total: number;
  won: number;
  lost: number;
  settled: number;
  winRate: number;
  avgDurationDays: number;
  courts: string[];
}

export interface KPISummary {
  totalCases: number;
  winRate: number;
  avgDurationDays: number;
  avgLawyerHours: number;
  totalAmountInDispute: number;
  totalAmountAwarded: number;
  outcomeDistribution: Record<OutcomeType, number>;
  topCourts: CourtStats[];
  topJudges: JudgeStats[];
  procedureDistribution: Record<ProcedureType, number>;
}

export function computeStats(outcomes: CaseOutcome[]): KPISummary {
  const total = outcomes.length;
  const won = outcomes.filter((o) => o.outcome === "won").length;
  const lost = outcomes.filter((o) => o.outcome === "lost").length;
  const settled = outcomes.filter((o) => o.outcome === "settled").length;
  const partial = outcomes.filter((o) => o.outcome === "partial").length;
  const withdrawn = outcomes.filter((o) => o.outcome === "withdrawn").length;
  const pending = outcomes.filter((o) => o.outcome === "pending").length;
  const completed = total - pending;
  const winRate = completed > 0 ? (won / completed) * 100 : 0;

  const durations = outcomes.filter((o) => o.durationDays != null).map((o) => o.durationDays!);
  const avgDurationDays =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const hours = outcomes.filter((o) => o.lawyerHours != null).map((o) => o.lawyerHours!);
  const avgLawyerHours = hours.length > 0 ? hours.reduce((a, b) => a + b, 0) / hours.length : 0;

  const amounts = outcomes.filter((o) => o.amountInDispute != null).map((o) => o.amountInDispute!);
  const totalAmountInDispute = amounts.reduce((a, b) => a + b, 0);

  const awarded = outcomes.filter((o) => o.amountAwarded != null).map((o) => o.amountAwarded!);
  const totalAmountAwarded = awarded.reduce((a, b) => a + b, 0);

  // Court stats
  const courtMap = new Map<string, CaseOutcome[]>();
  for (const o of outcomes) {
    if (!courtMap.has(o.court)) courtMap.set(o.court, []);
    courtMap.get(o.court)!.push(o);
  }
  const topCourts: CourtStats[] = Array.from(courtMap.entries())
    .map(([court, cases]) => {
      const cTotal = cases.length;
      const cWon = cases.filter((c) => c.outcome === "won").length;
      const cLost = cases.filter((c) => c.outcome === "lost").length;
      const cSettled = cases.filter((c) => c.outcome === "settled").length;
      const cPartial = cases.filter((c) => c.outcome === "partial").length;
      const cWithdrawn = cases.filter((c) => c.outcome === "withdrawn").length;
      const cPending = cases.filter((c) => c.outcome === "pending").length;
      const cCompleted = cTotal - cPending;
      const cDurations = cases.filter((c) => c.durationDays != null).map((c) => c.durationDays!);
      const cAmounts = cases
        .filter((c) => c.amountInDispute != null)
        .map((c) => c.amountInDispute!);
      return {
        court,
        total: cTotal,
        won: cWon,
        lost: cLost,
        settled: cSettled,
        partial: cPartial,
        withdrawn: cWithdrawn,
        pending: cPending,
        winRate: cCompleted > 0 ? (cWon / cCompleted) * 100 : 0,
        avgDurationDays:
          cDurations.length > 0 ? cDurations.reduce((a, b) => a + b, 0) / cDurations.length : 0,
        avgAmountInDispute:
          cAmounts.length > 0 ? cAmounts.reduce((a, b) => a + b, 0) / cAmounts.length : 0,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Judge stats
  const judgeMap = new Map<string, CaseOutcome[]>();
  for (const o of outcomes) {
    if (!o.judge) continue;
    if (!judgeMap.has(o.judge)) judgeMap.set(o.judge, []);
    judgeMap.get(o.judge)!.push(o);
  }
  const topJudges: JudgeStats[] = Array.from(judgeMap.entries())
    .map(([judge, cases]) => {
      const jTotal = cases.length;
      const jWon = cases.filter((c) => c.outcome === "won").length;
      const jLost = cases.filter((c) => c.outcome === "lost").length;
      const jSettled = cases.filter((c) => c.outcome === "settled").length;
      const jCompleted = jTotal - cases.filter((c) => c.outcome === "pending").length;
      const jDurations = cases.filter((c) => c.durationDays != null).map((c) => c.durationDays!);
      return {
        judge,
        total: jTotal,
        won: jWon,
        lost: jLost,
        settled: jSettled,
        winRate: jCompleted > 0 ? (jWon / jCompleted) * 100 : 0,
        avgDurationDays:
          jDurations.length > 0 ? jDurations.reduce((a, b) => a + b, 0) / jDurations.length : 0,
        courts: [...new Set(cases.map((c) => c.court))],
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Procedure distribution
  const procedureDistribution = {} as Record<ProcedureType, number>;
  for (const o of outcomes) {
    procedureDistribution[o.procedureType] = (procedureDistribution[o.procedureType] ?? 0) + 1;
  }

  return {
    totalCases: total,
    winRate,
    avgDurationDays,
    avgLawyerHours,
    totalAmountInDispute,
    totalAmountAwarded,
    outcomeDistribution: {
      won,
      lost,
      settled,
      partial,
      withdrawn,
      pending,
    },
    topCourts,
    topJudges,
    procedureDistribution,
  };
}

export function parseCaseOutcome(slug: string, fm: Record<string, unknown>): CaseOutcome | null {
  if (fm.type !== "litigation_analytics") return null;
  const startDate = fm.start_date as string | undefined;
  const endDate = fm.end_date as string | undefined;
  let durationDays: number | undefined;
  if (startDate && endDate) {
    durationDays = Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
  }
  return {
    slug,
    caseSlug: (fm.case_slug as string) ?? slug,
    caseTitle: (fm.case_title as string) ?? slug,
    caseNumber: fm.case_number as string | undefined,
    court: (fm.court as string) ?? "",
    courtLevel: fm.court_level as CourtLevel | undefined,
    judge: fm.judge as string | undefined,
    procedureType: (fm.procedure_type as ProcedureType) ?? "zivil",
    outcome: (fm.outcome as OutcomeType) ?? "pending",
    amountInDispute: fm.amount_in_dispute as number | undefined,
    amountAwarded: fm.amount_awarded as number | undefined,
    startDate,
    endDate,
    durationDays: durationDays ?? (fm.duration_days as number | undefined),
    lawyerHours: fm.lawyer_hours as number | undefined,
    notes: fm.notes as string | undefined,
    createdAt: (fm.created_at as string) ?? new Date().toISOString(),
    updatedAt: (fm.updated_at as string) ?? new Date().toISOString(),
  };
}

export function exportAnalyticsCsv(outcomes: CaseOutcome[]): string {
  const headers = [
    "Akte",
    "Aktenzeichen",
    "Gericht",
    "Richter",
    "Verfahrensart",
    "Ergebnis",
    "Streitwert",
    "Zugesprochen",
    "Dauer (Tage)",
    "Stunden",
    "Start",
    "Ende",
  ];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = outcomes.map((o) => [
    o.caseTitle,
    o.caseNumber ?? "",
    o.court,
    o.judge ?? "",
    PROCEDURE_TYPE_LABELS_DE[o.procedureType],
    OUTCOME_LABELS_DE[o.outcome],
    o.amountInDispute?.toFixed(2) ?? "",
    o.amountAwarded?.toFixed(2) ?? "",
    o.durationDays?.toString() ?? "",
    o.lawyerHours?.toString() ?? "",
    o.startDate ?? "",
    o.endDate ?? "",
  ]);
  return [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}
