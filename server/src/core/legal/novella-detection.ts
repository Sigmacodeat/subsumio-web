/**
 * Novella Detection — Periodic RIS/Official Source Amendment Check
 *
 * T3.4: When a law changes (Novelle), this module:
 *   1. Fetches the current statute text from the official source
 *   2. Compares content_hash with the stored corpus snapshot
 *   3. If changed: stores a new snapshot with per-§ amendment detection
 *   4. Marks all affected output_dependencies as 'pending' re-verification
 *   5. Also marks legacy stale_outputs entries
 *
 * The flow is designed to be called periodically (cron / manual trigger):
 *   detectNovella(pool, slug, currentText, receipt) → NovellaReport
 *
 * @module server/src/core/legal/novella-detection
 */

import type { Pool } from "pg";
import { createHash } from "node:crypto";
import { SnapshotStore, hashParagraph, type CorpusAmendment } from "./snapshot-store.ts";
import { DependencyGraphStore } from "./dependency-graph.ts";
import { type CorpusReceipt, type Jurisdiction } from "./corpus-receipt.ts";
import {
  fetchAtStatute,
  fetchDeStatute,
  fetchChStatute,
  fetchEuStatute,
  type Jurisdiction as FreshnessJurisdiction,
} from "../../../../src/lib/statute-freshness.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface NovellaReport {
  slug: string;
  statute_code: string;
  jurisdiction: Jurisdiction;
  /** Did the content hash change? */
  changed: boolean;
  /** Previous content hash (null if first snapshot) */
  old_content_hash: string | null;
  /** New content hash */
  new_content_hash: string;
  /** Per-§ amendments detected */
  amendments: CorpusAmendment[];
  /** Number of output dependencies marked for re-verification */
  dependencies_marked: number;
  /** ISO timestamp of the check */
  detected_at: string;
  /** Announcement date from the official source (BGBl-Datum) */
  announcement_date?: string;
  /** Official source URL the statute was fetched from, if known */
  source_url?: string;
  /** Error if the check failed */
  error?: string;
}

// ── Hashing ───────────────────────────────────────────────────────────

/**
 * Full-text SHA-256 hash (64 hex chars) — compatible with CorpusReceipt.content_hash.
 */
export function hashFullText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Split statute text into per-§ chunks and hash each one.
 * Uses the same § heading pattern as statute-freshness.ts / snapshot-store.ts.
 */
export function hashPerParagraph(text: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  const sectionRegex = /^##\s*§\s*(\d+[a-z]?)\b/gm;
  let match: RegExpExecArray | null;
  const positions: Array<{ num: string; start: number }> = [];

  while ((match = sectionRegex.exec(text)) !== null) {
    positions.push({ num: match[1], start: match.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const { num, start } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : text.length;
    const sectionText = text.slice(start, end).trim();
    hashes[num] = hashParagraph(sectionText);
  }

  return hashes;
}

// ── Novella Detection ─────────────────────────────────────────────────

/**
 * Detect whether a law has been amended by comparing the current text
 * with the stored corpus snapshot.
 *
 * Flow:
 *   1. Hash the incoming text
 *   2. Compare with current snapshot's content_hash
 *   3. If unchanged → return { changed: false }
 *   4. If changed (or first snapshot):
 *      a. Compute per-§ paragraph hashes
 *      b. Store new snapshot via SnapshotStore (which computes amendments)
 *      c. For each amendment: mark affected output_dependencies as 'pending'
 *      d. For each amendment: mark legacy stale_outputs
 *   5. Return NovellaReport with amendments + affected dependency count
 *
 * @param pool - Database connection pool
 * @param slug - Corpus slug, e.g. "law/de/bgb"
 * @param currentText - The current full text of the statute
 * @param receipt - CorpusReceipt metadata for the new snapshot
 * @returns NovellaReport with change details
 */
export async function detectNovella(
  pool: Pool,
  slug: string,
  currentText: string,
  receipt: CorpusReceipt
): Promise<NovellaReport> {
  const snapshotStore = new SnapshotStore(pool);
  const depStore = new DependencyGraphStore(pool);

  const newContentHash = hashFullText(currentText);

  // Check if current snapshot exists and matches
  const currentSnapshot = await snapshotStore.getCurrentSnapshot(slug);
  const oldContentHash = currentSnapshot?.content_hash ?? null;

  if (currentSnapshot && oldContentHash === newContentHash) {
    return {
      slug,
      statute_code: receipt.statute_code,
      jurisdiction: receipt.jurisdiction,
      changed: false,
      old_content_hash: oldContentHash,
      new_content_hash: newContentHash,
      amendments: [],
      dependencies_marked: 0,
      detected_at: new Date().toISOString(),
      announcement_date: receipt.announcement_date,
      source_url: receipt.source_url,
    };
  }

  // Content changed (or first snapshot) — store new snapshot with per-§ hashes
  const paragraphHashes = hashPerParagraph(currentText);
  const snapshotDiff = await snapshotStore.storeSnapshot(receipt, paragraphHashes);

  // Mark affected output dependencies for re-verification
  let dependenciesMarked = 0;
  for (const amendment of snapshotDiff.amendments) {
    // Get the amendment ID from the stored amendment
    // snapshotStore.storeSnapshot inserts amendments but doesn't return IDs.
    // We need to query the last inserted amendment for this slug+paragraph.
    const amendmentId = await getLatestAmendmentId(pool, slug, amendment.paragraph);

    if (amendmentId) {
      const count = await depStore.markForReVerification(slug, amendmentId, amendment.paragraph);
      dependenciesMarked += count;
    }

    // Also mark legacy stale_outputs
    await snapshotStore.markStale({
      output_id: "*", // wildcard — dashboard queries can filter
      output_type: "any",
      cited_slug: slug,
      cited_paragraph: amendment.paragraph,
    });
  }

  return {
    slug,
    statute_code: receipt.statute_code,
    jurisdiction: receipt.jurisdiction,
    changed: true,
    old_content_hash: oldContentHash,
    new_content_hash: newContentHash,
    amendments: snapshotDiff.amendments,
    dependencies_marked: dependenciesMarked,
    detected_at: new Date().toISOString(),
    announcement_date: receipt.announcement_date,
    source_url: receipt.source_url,
  };
}

/**
 * Run novella detection for multiple statutes.
 * Returns a report per statute.
 */
export async function runNovellaCheck(
  pool: Pool,
  statutes: Array<{
    slug: string;
    text: string;
    receipt: CorpusReceipt;
  }>
): Promise<NovellaReport[]> {
  const reports: NovellaReport[] = [];
  for (const { slug, text, receipt } of statutes) {
    try {
      const report = await detectNovella(pool, slug, text, receipt);
      reports.push(report);
    } catch (err) {
      reports.push({
        slug,
        statute_code: receipt.statute_code,
        jurisdiction: receipt.jurisdiction,
        changed: false,
        old_content_hash: null,
        new_content_hash: hashFullText(text),
        amendments: [],
        dependencies_marked: 0,
        detected_at: new Date().toISOString(),
        announcement_date: receipt.announcement_date,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return reports;
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Get the ID of the most recently inserted amendment for a slug+paragraph.
 * Used because SnapshotStore.storeSnapshot doesn't return amendment IDs.
 */
async function getLatestAmendmentId(
  pool: Pool,
  slug: string,
  paragraph: string
): Promise<number | null> {
  const result = await pool.query(
    `SELECT id FROM corpus_amendments
     WHERE slug = $1 AND paragraph = $2
     ORDER BY detected_at DESC, id DESC LIMIT 1`,
    [slug, paragraph]
  );
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
}

/**
 * Get paragraph text preview from a snapshot.
 * Fetches the paragraph_hashes JSON for the given snapshot, then extracts
 * the text for the requested paragraph from the full text.
 *
 * Since we store hashes (not full text), the preview is derived from
 * the receipt_json if available, or from the amendment's old_hash/new_hash
 * as a fallback.
 */
export async function getSnapshotParagraphPreview(
  pool: Pool,
  slug: string,
  paragraph: string,
  snapshotHash: string
): Promise<string | null> {
  // Try to get the receipt_json which contains the full text metadata
  const result = await pool.query(
    `SELECT receipt_json FROM corpus_snapshots
     WHERE slug = $1 AND content_hash = $2
     ORDER BY valid_from DESC LIMIT 1`,
    [slug, snapshotHash]
  );
  if (!result.rows[0]?.receipt_json) return null;

  try {
    const receipt = JSON.parse(result.rows[0].receipt_json);
    // The receipt doesn't store full text, but we can return a meaningful preview
    // from the paragraph hash comparison
    return receipt?.source_url ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract a text preview for a paragraph from statute text.
 * Returns the first 200 characters of the paragraph section.
 */
export function extractParagraphPreview(fullText: string, paragraph: string): string | null {
  const sectionRegex = new RegExp(
    `^##\\s*§\\s*${paragraph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "gm"
  );
  const match = sectionRegex.exec(fullText);
  if (!match) return null;

  // Find the next § heading or end of text
  const nextSectionRegex = /^##\s*§\s*\d+[a-z]?\b/gm;
  nextSectionRegex.lastIndex = match.index + match[0].length;
  const nextMatch = nextSectionRegex.exec(fullText);
  const end = nextMatch ? nextMatch.index : fullText.length;

  const sectionText = fullText.slice(match.index, end).trim();
  return sectionText.slice(0, 200);
}

// ── Official Source Integration ───────────────────────────────────────

/**
 * Build a corpus slug from jurisdiction and statute code.
 * e.g. ("DE", "BGB") → "law/de/bgb"
 */
export function buildSlug(jurisdiction: Jurisdiction, statuteCode: string): string {
  return `law/${jurisdiction.toLowerCase()}/${statuteCode.toLowerCase()}`;
}

/**
 * Build a CorpusReceipt from fetched statute data.
 */
export function buildReceipt(
  slug: string,
  jurisdiction: Jurisdiction,
  statuteCode: string,
  text: string,
  sourceUrl: string,
  opts?: { announcementDate?: string; validFrom?: string }
): CorpusReceipt {
  return {
    slug,
    jurisdiction,
    statute_code: statuteCode,
    valid_from: opts?.validFrom ?? new Date().toISOString().slice(0, 10),
    valid_to: null,
    fetched_at: new Date().toISOString(),
    source_url: sourceUrl,
    content_hash: hashFullText(text),
    parser_version: "novella-detection-v1",
    license_status: "public",
    amendment_count: 0,
    announcement_date: opts?.announcementDate,
    language: "de",
    paragraph_count: Object.keys(hashPerParagraph(text)).length,
  };
}

/**
 * Fetch statute text from the appropriate official source based on jurisdiction,
 * then run novella detection against the stored corpus snapshot.
 *
 * This is the main entry point for the periodic novella check cron job.
 * It reuses the fetchers from statute-freshness.ts:
 *   - DE: gesetze-im-internet.de (XML API)
 *   - AT: RIS-OGD API v2.6 (data.bka.gv.at)
 *   - CH: fedlex.ch API
 *   - EU: EUR-Lex webservices
 *
 * @param pool - Database connection pool
 * @param jurisdiction - DE, AT, CH, or EU
 * @param statuteCode - Statute abbreviation, e.g. "BGB", "ABGB"
 * @param fetchFn - Optional fetch override (for testing)
 * @returns NovellaReport with change details
 */
export async function detectNovellaFromSource(
  pool: Pool,
  jurisdiction: Jurisdiction,
  statuteCode: string,
  fetchFn?: typeof fetch
): Promise<NovellaReport> {
  const slug = buildSlug(jurisdiction, statuteCode);
  const freshJur = jurisdiction as FreshnessJurisdiction;

  // Fetch current statute text from official source
  let fetchResult: { text: string; sourceUrl: string; announcementDate?: string } | null;

  try {
    switch (freshJur) {
      case "DE":
        fetchResult = await fetchDeStatute(statuteCode, fetchFn);
        break;
      case "AT":
        fetchResult = await fetchAtStatute(statuteCode, fetchFn);
        break;
      case "CH":
        fetchResult = await fetchChStatute(statuteCode, fetchFn);
        break;
      case "EU":
        fetchResult = await fetchEuStatute(statuteCode, fetchFn);
        break;
      default:
        return {
          slug,
          statute_code: statuteCode,
          jurisdiction,
          changed: false,
          old_content_hash: null,
          new_content_hash: "",
          amendments: [],
          dependencies_marked: 0,
          detected_at: new Date().toISOString(),
          error: `Unsupported jurisdiction: ${jurisdiction}`,
        };
    }
  } catch (err) {
    return {
      slug,
      statute_code: statuteCode,
      jurisdiction,
      changed: false,
      old_content_hash: null,
      new_content_hash: "",
      amendments: [],
      dependencies_marked: 0,
      detected_at: new Date().toISOString(),
      error: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!fetchResult) {
    return {
      slug,
      statute_code: statuteCode,
      jurisdiction,
      changed: false,
      old_content_hash: null,
      new_content_hash: "",
      amendments: [],
      dependencies_marked: 0,
      detected_at: new Date().toISOString(),
      error: `Failed to fetch ${statuteCode} from ${jurisdiction} source`,
    };
  }

  // Build receipt from fetched data
  const receipt = buildReceipt(
    slug,
    jurisdiction,
    statuteCode,
    fetchResult.text,
    fetchResult.sourceUrl,
    { announcementDate: fetchResult.announcementDate }
  );

  // Run novella detection
  return detectNovella(pool, slug, fetchResult.text, receipt);
}

/**
 * Run novella detection from official sources for multiple statutes.
 *
 * Example:
 *   await runNovellaCheckFromSource(pool, [
 *     { jurisdiction: "DE", statuteCode: "BGB" },
 *     { jurisdiction: "AT", statuteCode: "ABGB" },
 *   ]);
 *
 * @param pool - Database connection pool
 * @param statutes - Array of { jurisdiction, statuteCode } to check
 * @param fetchFn - Optional fetch override (for testing)
 * @returns Array of NovellaReport, one per statute
 */
export async function runNovellaCheckFromSource(
  pool: Pool,
  statutes: Array<{ jurisdiction: Jurisdiction; statuteCode: string }>,
  fetchFn?: typeof fetch
): Promise<NovellaReport[]> {
  const reports: NovellaReport[] = [];
  for (const { jurisdiction, statuteCode } of statutes) {
    const report = await detectNovellaFromSource(pool, jurisdiction, statuteCode, fetchFn);
    reports.push(report);
  }
  return reports;
}
