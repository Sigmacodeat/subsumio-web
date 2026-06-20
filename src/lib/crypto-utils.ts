/**
 * Timing-safe string comparison — prevents timing attacks on secret/token checks.
 *
 * Uses node:crypto timingSafeEqual under the hood, with a length check
 * that also runs in constant time (returns false immediately on length mismatch,
 * which is safe because the length is not secret).
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Compare two strings in constant time.
 * @returns true if both strings are equal.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
