/**
 * T7.4 / WP7.4.1 — Tamper-evident Audit Hash Chain Verification
 *
 * Independently verifies the integrity of the audit log hash chain.
 * Each audit entry's hash = SHA-256(prev_hash + entry_data).
 * If any entry is modified, inserted, or deleted, the chain breaks.
 *
 * This module is designed for independent verification — it does NOT
 * trust the stored hash values. Instead, it recomputes every hash from
 * the raw entry data and compares.
 */

import { createHash } from "node:crypto";

export interface AuditChainEntry {
  id: string | number;
  brain_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  user_email: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  hash: string | null;
  prev_hash: string | null;
  created_at: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  brokenAt: number | null;
  brokenEntryId: string | number | null;
  errors: Array<{
    entryId: string | number;
    index: number;
    expectedHash: string;
    actualHash: string | null;
    error: string;
  }>;
  firstHash: string | null;
  lastHash: string | null;
}

/**
 * Recompute the hash for a single audit entry.
 * This must match the formula in audit.ts:logAudit().
 */
export function computeEntryHash(
  prevHash: string | null,
  entry: {
    action: string;
    entity_type: string;
    entity_id: string | null;
    user_id: string | null;
    user_email: string | null;
    details: Record<string, unknown> | null;
    ip: string | null;
    created_at: string;
  }
): string {
  const detailsStr = JSON.stringify(entry.details ?? {});
  const data = `${entry.action}:${entry.entity_type}:${entry.entity_id ?? ""}:${entry.user_id ?? ""}:${entry.user_email ?? ""}:${detailsStr}:${entry.ip ?? ""}:${entry.created_at}`;
  return createHash("sha256")
    .update(`${prevHash ?? ""}${data}`)
    .digest("hex");
}

/**
 * Verify an entire audit chain.
 *
 * This independently recomputes every hash and checks:
 * 1. Each entry's hash matches the recomputed hash
 * 2. Each entry's prev_hash matches the previous entry's hash
 * 3. The chain starts with a null prev_hash (genesis entry)
 *
 * @param entries - Audit entries ordered by id ASCENDING (oldest first)
 */
export function verifyAuditChain(entries: AuditChainEntry[]): ChainVerificationResult {
  const result: ChainVerificationResult = {
    valid: true,
    totalEntries: entries.length,
    verifiedEntries: 0,
    brokenAt: null,
    brokenEntryId: null,
    errors: [],
    firstHash: null,
    lastHash: null,
  };

  if (entries.length === 0) {
    return result;
  }

  let expectedPrevHash: string | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check prev_hash linkage
    if (i === 0) {
      // Genesis entry must have null prev_hash
      if (entry.prev_hash !== null && entry.prev_hash !== undefined) {
        result.valid = false;
        result.brokenAt = i;
        result.brokenEntryId = entry.id;
        result.errors.push({
          entryId: entry.id,
          index: i,
          expectedHash: "null",
          actualHash: entry.prev_hash,
          error: "Genesis entry must have null prev_hash",
        });
      }
    } else {
      // Each entry's prev_hash must match the previous entry's hash
      if (entry.prev_hash !== entries[i - 1].hash) {
        result.valid = false;
        result.brokenAt = i;
        result.brokenEntryId = entry.id;
        result.errors.push({
          entryId: entry.id,
          index: i,
          expectedHash: entries[i - 1].hash ?? "null",
          actualHash: entry.prev_hash,
          error: "prev_hash does not match previous entry's hash",
        });
      }
    }

    // Recompute the hash from raw data
    const recomputedHash = computeEntryHash(expectedPrevHash, entry);

    // Check stored hash matches recomputed hash
    if (entry.hash !== recomputedHash) {
      result.valid = false;
      if (result.brokenAt === null) {
        result.brokenAt = i;
        result.brokenEntryId = entry.id;
      }
      result.errors.push({
        entryId: entry.id,
        index: i,
        expectedHash: recomputedHash,
        actualHash: entry.hash,
        error: "Stored hash does not match recomputed hash (tampering detected)",
      });
    }

    expectedPrevHash = entry.hash;
    if (result.valid) result.verifiedEntries++;
  }

  result.firstHash = entries[0].hash;
  result.lastHash = entries[entries.length - 1].hash;

  return result;
}

/**
 * Verify a single entry's hash without needing the full chain.
 * Useful for spot-checks.
 */
export function verifySingleEntry(entry: AuditChainEntry, prevHash: string | null): boolean {
  const recomputed = computeEntryHash(prevHash, entry);
  return entry.hash === recomputed;
}

/**
 * Detect gaps in the chain (missing entries).
 * A gap is indicated by prev_hash not matching the previous entry's hash.
 */
export function detectChainGaps(entries: AuditChainEntry[]): Array<{
  index: number;
  entryId: string | number;
  expectedPrevHash: string;
  actualPrevHash: string | null;
}> {
  const gaps: Array<{
    index: number;
    entryId: string | number;
    expectedPrevHash: string;
    actualPrevHash: string | null;
  }> = [];

  for (let i = 1; i < entries.length; i++) {
    const expected = entries[i - 1].hash;
    const actual = entries[i].prev_hash;
    if (expected !== actual) {
      gaps.push({
        index: i,
        entryId: entries[i].id,
        expectedPrevHash: expected ?? "null",
        actualPrevHash: actual,
      });
    }
  }

  return gaps;
}

/**
 * Generate a human-readable verification report.
 */
export function formatVerificationReport(result: ChainVerificationResult): string {
  const lines: string[] = [];
  lines.push("=== Tamper-Evident Audit Chain Verification Report ===");
  lines.push(`Timestamp: ${new Date().toISOString()}`);
  lines.push(`Total entries: ${result.totalEntries}`);
  lines.push(`Verified entries: ${result.verifiedEntries}`);
  lines.push(`Chain valid: ${result.valid ? "YES ✓" : "NO ✗"}`);
  lines.push(`First hash: ${result.firstHash ?? "—"}`);
  lines.push(`Last hash: ${result.lastHash ?? "—"}`);

  if (result.brokenAt !== null) {
    lines.push(`Broken at index: ${result.brokenAt} (entry ID: ${result.brokenEntryId})`);
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    for (const err of result.errors.slice(0, 20)) {
      lines.push(`  [${err.index}] Entry ${err.entryId}: ${err.error}`);
      lines.push(`    Expected: ${err.expectedHash.slice(0, 16)}...`);
      lines.push(`    Actual:   ${err.actualHash?.slice(0, 16) ?? "null"}...`);
    }
    if (result.errors.length > 20) {
      lines.push(`  ... and ${result.errors.length - 20} more errors`);
    }
  }

  lines.push("");
  lines.push("=== End Report ===");
  return lines.join("\n");
}
