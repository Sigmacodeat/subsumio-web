/**
 * Connector Reliability — Golden Files, Schema-Drift, Quarantine, Idempotency
 *
 * T3.3: Silent failure verboten. Every connector must:
 *   - Validate parser output against golden files
 *   - Detect schema drift (structure changes in source)
 *   - Quarantine items that fail parsing
 *   - Enforce idempotency (no duplicate imports)
 *   - Log all errors with structured context
 *
 * @module server/src/core/legal/connector-reliability
 */

import type { Pool } from "pg";
import { createHash } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────

export type QuarantineReason =
  | "parse_error"
  | "schema_drift"
  | "hash_mismatch"
  | "rate_limited"
  | "auth_failed"
  | "content_empty"
  | "content_too_large"
  | "encoding_error"
  | "manual_quarantine";

export interface ParserGoldenFile {
  id: number;
  source_id: string;
  parser_version: string;
  fixture_name: string;
  fixture_hash: string;
  expected_output_hash: string;
  expected_paragraph_count: number | null;
  expected_metadata: Record<string, unknown>;
  created_at: string;
  validated_at: string | null;
  validation_error: string | null;
}

export interface QuarantinedItem {
  id: number;
  source_id: string;
  item_id: string;
  item_url: string | null;
  reason: QuarantineReason;
  error_detail: string | null;
  item_metadata: Record<string, unknown>;
  quarantined_at: string;
  released_at: string | null;
  released_by: string | null;
  release_reason: string | null;
}

export interface SchemaDriftResult {
  source_id: string;
  drifted: boolean;
  details: string;
  checked_at: string;
  golden_file_id: number | null;
}

export interface IdempotencyRecord {
  source_id: string;
  item_id: string;
  content_hash: string;
  imported_at: string;
}

// ── Golden File Store ─────────────────────────────────────────────────

/**
 * GoldenFileStore — DB-backed parser golden file management.
 *
 * Golden files are reference fixtures used to validate that a parser
 * produces consistent output. When a source changes its HTML/XML structure,
 * the golden file validation fails → schema drift detected.
 */
export class GoldenFileStore {
  constructor(private pool: Pool) {}

  /**
   * Register a golden file for a source + parser version.
   */
  async register(opts: {
    source_id: string;
    parser_version: string;
    fixture_name: string;
    fixture_content: string;
    expected_output: string;
    expected_paragraph_count?: number;
    expected_metadata?: Record<string, unknown>;
  }): Promise<ParserGoldenFile> {
    const fixtureHash = hashContent(opts.fixture_content);
    const expectedOutputHash = hashContent(opts.expected_output);

    const result = await this.pool.query(
      `INSERT INTO parser_golden_files
       (source_id, parser_version, fixture_name, fixture_hash, expected_output_hash,
        expected_paragraph_count, expected_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (source_id, fixture_name, parser_version)
       DO UPDATE SET
         fixture_hash = EXCLUDED.fixture_hash,
         expected_output_hash = EXCLUDED.expected_output_hash,
         expected_paragraph_count = EXCLUDED.expected_paragraph_count,
         expected_metadata = EXCLUDED.expected_metadata
       RETURNING *`,
      [
        opts.source_id,
        opts.parser_version,
        opts.fixture_name,
        fixtureHash,
        expectedOutputHash,
        opts.expected_paragraph_count ?? null,
        JSON.stringify(opts.expected_metadata ?? {}),
      ]
    );
    return rowToGoldenFile(result.rows[0]!);
  }

  /**
   * Get all golden files for a source.
   */
  async getBySource(sourceId: string): Promise<ParserGoldenFile[]> {
    const result = await this.pool.query(
      `SELECT * FROM parser_golden_files WHERE source_id = $1 ORDER BY created_at DESC`,
      [sourceId]
    );
    return result.rows.map(rowToGoldenFile);
  }

  /**
   * Validate parser output against golden files.
   * Returns drift details if the output doesn't match.
   */
  async validate(
    sourceId: string,
    parserVersion: string,
    fixtureName: string,
    actualOutput: string
  ): Promise<{ matches: boolean; drift?: SchemaDriftResult; goldenFile?: ParserGoldenFile }> {
    const result = await this.pool.query(
      `SELECT * FROM parser_golden_files
       WHERE source_id = $1 AND parser_version = $2 AND fixture_name = $3
       LIMIT 1`,
      [sourceId, parserVersion, fixtureName]
    );

    const goldenRow = result.rows[0];
    if (!goldenRow) {
      return {
        matches: false,
        drift: {
          source_id: sourceId,
          drifted: true,
          details: `No golden file found for ${sourceId}/${parserVersion}/${fixtureName}`,
          checked_at: new Date().toISOString(),
          golden_file_id: null,
        },
      };
    }

    const goldenFile = rowToGoldenFile(goldenRow);
    const actualHash = hashContent(actualOutput);
    const matches = actualHash === goldenFile.expected_output_hash;

    if (matches) {
      // Update validated_at
      await this.pool.query(
        `UPDATE parser_golden_files SET validated_at = NOW(), validation_error = NULL WHERE id = $1`,
        [goldenFile.id]
      );
      return { matches: true, goldenFile };
    }

    const drift: SchemaDriftResult = {
      source_id: sourceId,
      drifted: true,
      details: `Output hash mismatch: expected ${goldenFile.expected_output_hash.slice(0, 16)}, got ${actualHash.slice(0, 16)}`,
      checked_at: new Date().toISOString(),
      golden_file_id: goldenFile.id,
    };

    // Record validation error
    await this.pool.query(`UPDATE parser_golden_files SET validation_error = $2 WHERE id = $1`, [
      goldenFile.id,
      drift.details,
    ]);

    return { matches: false, drift, goldenFile };
  }

  /**
   * Check if any golden files have validation errors.
   */
  async getDriftedFiles(): Promise<ParserGoldenFile[]> {
    const result = await this.pool.query(
      `SELECT * FROM parser_golden_files WHERE validation_error IS NOT NULL ORDER BY created_at DESC`
    );
    return result.rows.map(rowToGoldenFile);
  }
}

// ── Quarantine Store ──────────────────────────────────────────────────

/**
 * QuarantineStore — DB-backed quarantine for items that failed processing.
 *
 * Items in quarantine are excluded from normal processing until released
 * by an admin or automatically after the underlying issue is fixed.
 */
export class QuarantineStore {
  constructor(private pool: Pool) {}

  /**
   * Quarantine an item.
   */
  async quarantine(opts: {
    source_id: string;
    item_id: string;
    item_url?: string;
    reason: QuarantineReason;
    error_detail?: string;
    item_metadata?: Record<string, unknown>;
  }): Promise<QuarantinedItem> {
    const result = await this.pool.query(
      `INSERT INTO connector_quarantine
       (source_id, item_id, item_url, reason, error_detail, item_metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (source_id, item_id, reason) DO UPDATE SET
         error_detail = EXCLUDED.error_detail,
         item_metadata = EXCLUDED.item_metadata,
         quarantined_at = NOW()
       RETURNING *`,
      [
        opts.source_id,
        opts.item_id,
        opts.item_url ?? null,
        opts.reason,
        opts.error_detail ?? null,
        JSON.stringify(opts.item_metadata ?? {}),
      ]
    );
    return rowToQuarantinedItem(result.rows[0]!);
  }

  /**
   * Release an item from quarantine.
   */
  async release(
    sourceId: string,
    itemId: string,
    releasedBy: string,
    releaseReason: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE connector_quarantine
       SET released_at = NOW(), released_by = $3, release_reason = $4
       WHERE source_id = $1 AND item_id = $2 AND released_at IS NULL`,
      [sourceId, itemId, releasedBy, releaseReason]
    );
  }

  /**
   * Get all quarantined items for a source (unreleased only by default).
   */
  async getBySource(sourceId: string, includeReleased = false): Promise<QuarantinedItem[]> {
    const query = includeReleased
      ? `SELECT * FROM connector_quarantine WHERE source_id = $1 ORDER BY quarantined_at DESC`
      : `SELECT * FROM connector_quarantine WHERE source_id = $1 AND released_at IS NULL ORDER BY quarantined_at DESC`;
    const result = await this.pool.query(query, [sourceId]);
    return result.rows.map(rowToQuarantinedItem);
  }

  /**
   * Check if an item is currently quarantined.
   */
  async isQuarantined(sourceId: string, itemId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM connector_quarantine
       WHERE source_id = $1 AND item_id = $2 AND released_at IS NULL LIMIT 1`,
      [sourceId, itemId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get quarantine stats for a source.
   */
  async getStats(sourceId: string): Promise<{
    total: number;
    active: number;
    released: number;
    by_reason: Record<string, number>;
  }> {
    const result = await this.pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE released_at IS NULL) as active,
         COUNT(*) FILTER (WHERE released_at IS NOT NULL) as released,
         reason
       FROM connector_quarantine
       WHERE source_id = $1
       GROUP BY reason`,
      [sourceId]
    );

    const byReason: Record<string, number> = {};
    let total = 0;
    let active = 0;
    let released = 0;

    for (const row of result.rows) {
      byReason[row.reason as string] = Number(row.total);
      total += Number(row.total);
      active += Number(row.active);
      released += Number(row.released);
    }

    return { total, active, released, by_reason: byReason };
  }

  /**
   * Get all quarantined items across all sources (for admin dashboard).
   */
  async getAllActive(limit = 100): Promise<QuarantinedItem[]> {
    const result = await this.pool.query(
      `SELECT * FROM connector_quarantine WHERE released_at IS NULL ORDER BY quarantined_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map(rowToQuarantinedItem);
  }
}

// ── Idempotency Store ─────────────────────────────────────────────────

/**
 * IdempotencyStore — Prevents duplicate imports of the same content.
 *
 * Every import records a (source_id, item_id, content_hash) triple.
 * Before importing, check if the same hash already exists → skip.
 */
export class IdempotencyStore {
  constructor(private pool: Pool) {}

  /**
   * Ensure the idempotency table exists.
   * This is a lightweight table created on demand.
   */
  async ensureTable(): Promise<void> {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS connector_idempotency (
        id              BIGSERIAL PRIMARY KEY,
        source_id       TEXT NOT NULL,
        item_id         TEXT NOT NULL,
        content_hash    TEXT NOT NULL,
        imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (source_id, item_id, content_hash)
      )`
    );
  }

  /**
   * Check if content has already been imported.
   */
  async isAlreadyImported(sourceId: string, itemId: string, contentHash: string): Promise<boolean> {
    await this.ensureTable();
    const result = await this.pool.query(
      `SELECT 1 FROM connector_idempotency
       WHERE source_id = $1 AND item_id = $2 AND content_hash = $3 LIMIT 1`,
      [sourceId, itemId, contentHash]
    );
    return result.rows.length > 0;
  }

  /**
   * Record a successful import.
   */
  async recordImport(sourceId: string, itemId: string, contentHash: string): Promise<void> {
    await this.ensureTable();
    await this.pool.query(
      `INSERT INTO connector_idempotency (source_id, item_id, content_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [sourceId, itemId, contentHash]
    );
  }

  /**
   * Check and record in one step. Returns true if this is a new import.
   */
  async checkAndRecord(sourceId: string, itemId: string, contentHash: string): Promise<boolean> {
    const already = await this.isAlreadyImported(sourceId, itemId, contentHash);
    if (already) return false;
    await this.recordImport(sourceId, itemId, contentHash);
    return true;
  }
}

// ── Structured Error Logging ──────────────────────────────────────────

/**
 * ConnectorError — structured error that prohibits silent failures.
 *
 * Every connector error must be logged with:
 *   - source_id, item_id, reason, error_detail, timestamp
 *   - Either resolved (import succeeded after retry) or quarantined
 */
export interface ConnectorErrorLog {
  source_id: string;
  item_id: string;
  reason: QuarantineReason;
  error_detail: string;
  timestamp: string;
  resolved: boolean;
  quarantined: boolean;
}

/**
 * Log a connector error. This is the anti-silent-failure mechanism.
 * Errors are either logged as resolved (after retry) or quarantined.
 */
export function logConnectorError(
  sourceId: string,
  itemId: string,
  reason: QuarantineReason,
  errorDetail: string,
  opts?: { resolved?: boolean; quarantined?: boolean }
): ConnectorErrorLog {
  const log: ConnectorErrorLog = {
    source_id: sourceId,
    item_id: itemId,
    reason,
    error_detail: errorDetail,
    timestamp: new Date().toISOString(),
    resolved: opts?.resolved ?? false,
    quarantined: opts?.quarantined ?? false,
  };

  // Structured console output — never silent
  if (log.resolved) {
    console.warn(
      `[connector] ${sourceId}/${itemId}: ${reason} — resolved after retry: ${errorDetail}`
    );
  } else if (log.quarantined) {
    console.error(`[connector] ${sourceId}/${itemId}: ${reason} — QUARANTINED: ${errorDetail}`);
  } else {
    console.error(`[connector] ${sourceId}/${itemId}: ${reason} — UNRESOLVED: ${errorDetail}`);
  }

  return log;
}

// ── Helpers ───────────────────────────────────────────────────────────

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function rowToGoldenFile(row: Record<string, unknown>): ParserGoldenFile {
  return {
    id: Number(row.id),
    source_id: row.source_id as string,
    parser_version: row.parser_version as string,
    fixture_name: row.fixture_name as string,
    fixture_hash: row.fixture_hash as string,
    expected_output_hash: row.expected_output_hash as string,
    expected_paragraph_count: (row.expected_paragraph_count as number) ?? null,
    expected_metadata: (row.expected_metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
    validated_at: (row.validated_at as string) ?? null,
    validation_error: (row.validation_error as string) ?? null,
  };
}

function rowToQuarantinedItem(row: Record<string, unknown>): QuarantinedItem {
  return {
    id: Number(row.id),
    source_id: row.source_id as string,
    item_id: row.item_id as string,
    item_url: (row.item_url as string) ?? null,
    reason: row.reason as QuarantineReason,
    error_detail: (row.error_detail as string) ?? null,
    item_metadata: (row.item_metadata as Record<string, unknown>) ?? {},
    quarantined_at: row.quarantined_at as string,
    released_at: (row.released_at as string) ?? null,
    released_by: (row.released_by as string) ?? null,
    release_reason: (row.release_reason as string) ?? null,
  };
}
