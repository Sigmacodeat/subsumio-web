/**
 * Peer-Benchmarking — Anonymous Aggregate Comparison
 * ====================================================
 * Anonymized aggregates (realization rate, throughput time per legal area)
 * via opt-in export to central aggregation endpoint.
 * k-anonymity ≥5 law firms per comparison group, otherwise no value displayed.
 */

export interface BenchmarkMetric {
  legal_area: string;
  firm_count: number;
  avg_realization_rate: number;
  avg_throughput_days: number;
  median_throughput_days: number;
  your_realization_rate?: number;
  your_throughput_days?: number;
  percentile?: number;
}

export interface BenchmarkExport {
  firm_id_hash: string;
  legal_area: string;
  total_cases: number;
  won_cases: number;
  realization_rate: number;
  avg_throughput_days: number;
  period: { from: string; to: string };
  exported_at: string;
}

export const MIN_FIRMS_FOR_DISPLAY = 5;

export function computeRealizationRate(won: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((won / total) * 100) / 100;
}

export function computeThroughputStats(durations: number[]): { avg: number; median: number } {
  if (durations.length === 0) return { avg: 0, median: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
  return { avg, median };
}

export function buildBenchmarkExport(input: {
  firmId: string;
  legalArea: string;
  totalCases: number;
  wonCases: number;
  durations: number[];
  periodFrom: string;
  periodTo: string;
}): BenchmarkExport {
  const { avg } = computeThroughputStats(input.durations);
  return {
    firm_id_hash: hashFirmId(input.firmId),
    legal_area: input.legalArea,
    total_cases: input.totalCases,
    won_cases: input.wonCases,
    realization_rate: computeRealizationRate(input.wonCases, input.totalCases),
    avg_throughput_days: avg,
    period: { from: input.periodFrom, to: input.periodTo },
    exported_at: new Date().toISOString(),
  };
}

export function applyKAnonymity(metrics: BenchmarkMetric[]): BenchmarkMetric[] {
  return metrics.filter((m) => m.firm_count >= MIN_FIRMS_FOR_DISPLAY);
}

export function computePercentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 50;
  const sorted = [...allValues].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < value).length;
  return Math.round((below / sorted.length) * 100);
}

function hashFirmId(firmId: string): string {
  let hash = 0;
  for (let i = 0; i < firmId.length; i++) {
    const char = firmId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `firm_${Math.abs(hash).toString(36)}`;
}
