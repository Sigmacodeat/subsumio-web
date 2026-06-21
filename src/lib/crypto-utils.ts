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
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
