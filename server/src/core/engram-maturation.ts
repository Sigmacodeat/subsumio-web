/**
 * v0.45 — Engram Maturation library.
 *
 * Implements the sigmoid activation function inspired by Kitamura et al. (2017):
 * engrams form immediately but remain "silent" for days before becoming
 * explicitly retrievable. The activation strength follows a sigmoid curve
 * parameterized by:
 *
 *   t_half: maturation half-life (default 168h = 7 days)
 *   k:      slope parameter (default 48)
 *
 * A(t) = 1 / (1 + exp(-k * (t - t_half)))
 *
 * Below A=0.5 (before t_half): memory is "implicit" — influences relevance
 * scoring but is NOT surfaced as a citation.
 * Above A=0.5 (after t_half): memory is "explicit" — fully available for
 * answers and citations.
 *
 * The module also provides:
 *   - isExplicit(A): whether a memory is above the retrieval threshold
 *   - isImplicit(A): whether a memory is below the threshold but non-zero
 *   - isSilent(A):   whether a memory is effectively zero (brand new)
 *   - computeActivation(createdAt, now, opts): pure sigmoid computation
 *   - shouldBackfill(fact): whether a pre-v119 fact needs activation backfill
 */

/** Default maturation half-life in hours (7 days). */
export const DEFAULT_MATURATION_HALF_LIFE_HOURS = 168;

/** Default slope parameter. */
export const DEFAULT_MATURATION_SLOPE = 48;

/** Activation threshold for "explicit" memories. */
export const EXPLICIT_THRESHOLD = 0.5;

/** Near-zero threshold for "silent" memories. */
export const SILENT_THRESHOLD = 0.03;

export interface MaturationParams {
  halfLifeHours?: number;
  slope?: number;
}

/**
 * Compute the sigmoid activation strength for a fact given its age.
 *
 * @param createdAt - When the fact was first encoded
 * @param now - Current time (defaults to new Date())
 * @param params - Optional tuning parameters
 * @returns A number in [0, 1] representing the activation strength
 */
export function computeActivation(
  createdAt: Date,
  now: Date = new Date(),
  params?: MaturationParams
): number {
  const tHalf = params?.halfLifeHours ?? DEFAULT_MATURATION_HALF_LIFE_HOURS;
  const k = params?.slope ?? DEFAULT_MATURATION_SLOPE;

  const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  if (ageHours <= 0) return 0;

  const activation = 1 / (1 + Math.exp(-k * (ageHours / tHalf - 1)));
  return Math.max(0, Math.min(1, activation));
}

/**
 * Whether a fact's activation strength makes it "explicit" —
 * available for answers and citations.
 */
export function isExplicit(activationStrength: number): boolean {
  return activationStrength >= EXPLICIT_THRESHOLD;
}

/**
 * Whether a fact's activation strength makes it "implicit" —
 * influences relevance scoring but is not surfaced.
 */
export function isImplicit(activationStrength: number): boolean {
  return activationStrength > SILENT_THRESHOLD && activationStrength < EXPLICIT_THRESHOLD;
}

/**
 * Whether a fact's activation strength makes it "silent" —
 * brand new, not yet influencing anything meaningfully.
 */
export function isSilent(activationStrength: number): boolean {
  return activationStrength <= SILENT_THRESHOLD;
}

/**
 * Human-readable label for the maturation state of a fact.
 */
export function maturationLabel(activationStrength: number): "silent" | "implicit" | "explicit" {
  if (isSilent(activationStrength)) return "silent";
  if (isImplicit(activationStrength)) return "implicit";
  return "explicit";
}

/**
 * Whether a pre-v119 fact (activation_strength = 0.0 by default) should
 * be backfilled to 1.0. This is true when the fact is older than 7 days
 * — it was created before the engram maturation feature existed and
 * should be treated as fully mature.
 */
export function shouldBackfill(createdAt: Date, now: Date = new Date()): boolean {
  const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  return ageHours > DEFAULT_MATURATION_HALF_LIFE_HOURS;
}
