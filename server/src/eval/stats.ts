/**
 * Statistical utilities for benchmark reporting.
 *
 * Provides:
 * - Bootstrap confidence intervals for proportions (hit rates, pass rates)
 * - Latency percentile calculation (p50, p95, p99)
 * - Wilson score confidence intervals (for small samples)
 */

/**
 * Compute percentile from a sorted array of values.
 * @param sorted - Pre-sorted array of numbers
 * @param p - Percentile (0-100)
 * @returns Percentile value
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

/**
 * Compute latency percentiles from an array of latencies.
 * @param latencies - Array of latency values (ms)
 * @returns p50, p95, p99, avg
 */
export function latencyPercentiles(latencies: number[]): {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
} {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    avg: latencies.reduce((s, v) => s + v, 0) / latencies.length,
  };
}

/**
 * Wilson score confidence interval for a proportion.
 * Better than normal approximation for small samples or extreme proportions.
 *
 * @param successes - Number of successes
 * @param total - Total trials
 * @param z - Z-score (default 1.96 for 95% CI)
 * @returns Wilson CI with lower, upper, point estimate
 */
export function wilsonCI(
  successes: number,
  total: number,
  z: number = 1.96
): { lower: number; upper: number; point: number; n: number } {
  if (total === 0) return { lower: 0, upper: 0, point: 0, n: 0 };
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denominator;
  return {
    lower: Math.max(0, centre - margin),
    upper: Math.min(1, centre + margin),
    point: p,
    n: total,
  };
}

/**
 * Bootstrap confidence interval for a proportion.
 * Resamples the data with replacement B times and computes the proportion
 * each time. The CI is the 2.5th and 97.5th percentile of the bootstrap distribution.
 *
 * More robust than Wilson for complex metrics (e.g. MRR, nDCG).
 *
 * @param values - Array of 0/1 values (miss/hit)
 * @param B - Number of bootstrap resamples (default 2000)
 * @param alpha - Significance level (default 0.05 for 95% CI)
 * @returns Bootstrap CI with lower, upper, point estimate
 */
export function bootstrapCI(
  values: number[],
  B: number = 2000,
  alpha: number = 0.05
): { lower: number; upper: number; point: number; n: number } {
  const n = values.length;
  if (n === 0) return { lower: 0, upper: 0, point: 0, n: 0 };

  const point = values.reduce((s, v) => s + v, 0) / n;
  const boots: number[] = [];

  // Use a simple LCG for reproducibility (avoid crypto overhead)
  let seed = 42;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let b = 0; b < B; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      sum += values[idx];
    }
    boots.push(sum / n);
  }

  boots.sort((a, b) => a - b);
  const lowerIdx = Math.floor((alpha / 2) * B);
  const upperIdx = Math.floor((1 - alpha / 2) * B);

  return {
    lower: boots[Math.max(0, lowerIdx)],
    upper: boots[Math.min(B - 1, upperIdx)],
    point,
    n,
  };
}

/**
 * Bootstrap CI for a generic metric (not just 0/1 proportions).
 * Computes the mean of resampled values.
 *
 * @param values - Array of numeric values
 * @param B - Number of bootstrap resamples
 * @param alpha - Significance level
 * @returns Bootstrap CI with lower, upper, point estimate
 */
export function bootstrapMeanCI(
  values: number[],
  B: number = 2000,
  alpha: number = 0.05
): { lower: number; upper: number; point: number; n: number } {
  const n = values.length;
  if (n === 0) return { lower: 0, upper: 0, point: 0, n: 0 };

  const point = values.reduce((s, v) => s + v, 0) / n;
  const boots: number[] = [];

  let seed = 42;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let b = 0; b < B; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      sum += values[idx];
    }
    boots.push(sum / n);
  }

  boots.sort((a, b) => a - b);
  return {
    lower: boots[Math.floor((alpha / 2) * B)],
    upper: boots[Math.floor((1 - alpha / 2) * B)],
    point,
    n,
  };
}

/**
 * Format a CI for display.
 */
export function formatCI(ci: { lower: number; upper: number; point: number }): string {
  return `${(ci.point * 100).toFixed(1)}% [${(ci.lower * 100).toFixed(1)}%–${(ci.upper * 100).toFixed(1)}%]`;
}
