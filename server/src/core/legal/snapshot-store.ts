/**
 * Snapshot Store — Persistent Storage for Corpus Receipts & Amendments
 *
 * Replaces the in-memory snapshot mechanism in statute-freshness.ts.
 * Provides:
 *   1. Persistent storage of corpus snapshots (versioned law documents)
 *   2. Per-§ amendment tracking
 *   3. Stale output marking (outputs citing amended laws)
 *   4. Query API for "is this § still current?"
 *
 * DB tables (migration 004):
 *   corpus_snapshots, corpus_amendments, stale_outputs
 */

import type { Pool, PoolClient } from "pg";
import { createHash } from "node:crypto";
import {
  type CorpusReceipt,
  type Jurisdiction,
  validateReceipt,
  serializeReceipt,
  deserializeReceipt,
} from "./corpus-receipt.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface CorpusAmendment {
  id?: number;
  slug: string;
  statute_code: string;
  jurisdiction: Jurisdiction;
  paragraph: string;
  change_type: "added" | "modified" | "removed";
  old_hash?: string;
  new_hash?: string;
  detected_at: string;
  source_url?: string;
  announcement_date?: string;
}

export interface StaleOutput {
  id?: number;
  output_id: string;
  output_type: string;
  cited_slug: string;
  cited_paragraph?: string;
  amendment_id?: number;
  marked_stale_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

export interface SnapshotDiff {
  slug: string;
  old_hash?: string;
  new_hash: string;
  amendments: CorpusAmendment[];
  is_new: boolean;
}

// ── Snapshot Store ────────────────────────────────────────────────────

export class SnapshotStore {
  constructor(private pool: Pool) {}

  // ── Snapshot Management ──

  /**
   * Store a new corpus snapshot. If a current snapshot exists for this slug,
   * it is superseded (valid_to set) and amendments are computed.
   */
  async storeSnapshot(
    receipt: CorpusReceipt,
    paragraphHashes?: Record<string, string>
  ): Promise<SnapshotDiff> {
    const errors = validateReceipt(receipt);
    if (errors.length > 0) {
      throw new Error(
        `Invalid receipt: ${errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Get current snapshot for this slug
      const currentResult = await client.query(
        `SELECT id, content_hash, valid_from FROM corpus_snapshots
         WHERE slug = $1 AND valid_to IS NULL
         ORDER BY valid_from DESC LIMIT 1`,
        [receipt.slug]
      );

      const currentRow = currentResult.rows[0] ?? null;
      const oldHash = currentRow?.content_hash ?? null;
      const isNew = !currentRow;

      // Supersede previous snapshot
      if (currentRow) {
        await client.query(`UPDATE corpus_snapshots SET valid_to = $1 WHERE id = $2`, [
          receipt.valid_from,
          currentRow.id,
        ]);
      }

      // Insert new snapshot
      await client.query(
        `INSERT INTO corpus_snapshots
         (slug, jurisdiction, statute_code, valid_from, valid_to, fetched_at,
          source_url, content_hash, parser_version, license_status, amendment_count,
          announcement_date, gazette_reference, language, paragraph_count, receipt_json)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          receipt.slug,
          receipt.jurisdiction,
          receipt.statute_code,
          receipt.valid_from,
          receipt.fetched_at,
          receipt.source_url,
          receipt.content_hash,
          receipt.parser_version,
          receipt.license_status,
          receipt.amendment_count,
          receipt.announcement_date ?? null,
          receipt.gazette_reference ?? null,
          receipt.language ?? "de",
          receipt.paragraph_count ?? null,
          serializeReceipt(receipt),
        ]
      );

      // Compute per-§ amendments if paragraph hashes provided
      const amendments: CorpusAmendment[] = [];
      if (paragraphHashes) {
        const oldParagraphHashes = await this.getParagraphHashes(client, receipt.slug);
        amendments.push(
          ...this.computeAmendments(
            receipt.slug,
            receipt.statute_code,
            receipt.jurisdiction,
            paragraphHashes,
            oldParagraphHashes,
            receipt.source_url
          )
        );

        // Store amendments
        for (const amend of amendments) {
          await client.query(
            `INSERT INTO corpus_amendments
             (slug, statute_code, jurisdiction, paragraph, change_type, old_hash, new_hash,
              detected_at, source_url, announcement_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              amend.slug,
              amend.statute_code,
              amend.jurisdiction,
              amend.paragraph,
              amend.change_type,
              amend.old_hash ?? null,
              amend.new_hash ?? null,
              amend.detected_at,
              amend.source_url ?? null,
              amend.announcement_date ?? null,
            ]
          );
        }

        // Store new paragraph hashes for future comparison
        await this.storeParagraphHashes(client, receipt.slug, paragraphHashes);
      }

      await client.query("COMMIT");

      return {
        slug: receipt.slug,
        old_hash: oldHash ?? undefined,
        new_hash: receipt.content_hash,
        amendments,
        is_new: isNew,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get the current (valid_to IS NULL) snapshot for a slug.
   */
  async getCurrentSnapshot(slug: string): Promise<CorpusReceipt | null> {
    const result = await this.pool.query(
      `SELECT receipt_json FROM corpus_snapshots
       WHERE slug = $1 AND valid_to IS NULL
       ORDER BY valid_from DESC LIMIT 1`,
      [slug]
    );
    if (!result.rows[0]?.receipt_json) return null;
    return deserializeReceipt(result.rows[0].receipt_json);
  }

  /**
   * Get all snapshots for a slug (version history).
   */
  async getSnapshotHistory(slug: string): Promise<CorpusReceipt[]> {
    const result = await this.pool.query(
      `SELECT receipt_json FROM corpus_snapshots
       WHERE slug = $1 ORDER BY valid_from DESC`,
      [slug]
    );
    return result.rows
      .map((r) => (r.receipt_json ? deserializeReceipt(r.receipt_json) : null))
      .filter((r): r is CorpusReceipt => r !== null);
  }

  /**
   * Get all current snapshots for a jurisdiction.
   */
  async getCurrentSnapshotsByJurisdiction(jurisdiction: Jurisdiction): Promise<CorpusReceipt[]> {
    const result = await this.pool.query(
      `SELECT receipt_json FROM corpus_snapshots
       WHERE jurisdiction = $1 AND valid_to IS NULL
       ORDER BY statute_code`,
      [jurisdiction]
    );
    return result.rows
      .map((r) => (r.receipt_json ? deserializeReceipt(r.receipt_json) : null))
      .filter((r): r is CorpusReceipt => r !== null);
  }

  /**
   * Check if a slug's current snapshot matches the given content hash.
   */
  async isCurrent(slug: string, contentHash: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT content_hash FROM corpus_snapshots
       WHERE slug = $1 AND valid_to IS NULL LIMIT 1`,
      [slug]
    );
    if (!result.rows[0]) return false;
    return result.rows[0].content_hash === contentHash;
  }

  // ── Amendment Queries ──

  /**
   * Get amendments for a slug, optionally filtered by paragraph.
   */
  async getAmendments(slug: string, paragraph?: string): Promise<CorpusAmendment[]> {
    let query = `SELECT * FROM corpus_amendments WHERE slug = $1`;
    const params: (string | number)[] = [slug];
    if (paragraph) {
      query += ` AND paragraph = $2`;
      params.push(paragraph);
    }
    query += ` ORDER BY detected_at DESC`;
    const result = await this.pool.query(query, params);
    return result.rows.map(rowToAmendment);
  }

  /**
   * Get recent amendments across all slugs (for dashboard).
   */
  async getRecentAmendments(limit = 50): Promise<CorpusAmendment[]> {
    const result = await this.pool.query(
      `SELECT * FROM corpus_amendments ORDER BY detected_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map(rowToAmendment);
  }

  // ── Stale Output Management ──

  /**
   * Mark an output as potentially stale because a cited law was amended.
   */
  async markStale(opts: {
    output_id: string;
    output_type: string;
    cited_slug: string;
    cited_paragraph?: string;
    amendment_id?: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO stale_outputs
       (output_id, output_type, cited_slug, cited_paragraph, amendment_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        opts.output_id,
        opts.output_type,
        opts.cited_slug,
        opts.cited_paragraph ?? null,
        opts.amendment_id ?? null,
      ]
    );
  }

  /**
   * Get all unresolved stale outputs for a given output_id.
   */
  async getStaleOutputs(outputId: string): Promise<StaleOutput[]> {
    const result = await this.pool.query(
      `SELECT * FROM stale_outputs
       WHERE output_id = $1 AND resolved_at IS NULL
       ORDER BY marked_stale_at DESC`,
      [outputId]
    );
    return result.rows.map(rowToStaleOutput);
  }

  /**
   * Check if an output has any unresolved stale markers.
   */
  async isOutputStale(outputId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM stale_outputs
       WHERE output_id = $1 AND resolved_at IS NULL LIMIT 1`,
      [outputId]
    );
    return result.rows.length > 0;
  }

  /**
   * Resolve a stale output marker (attorney has reviewed).
   */
  async resolveStaleOutput(outputId: string, resolvedBy: string): Promise<void> {
    await this.pool.query(
      `UPDATE stale_outputs
       SET resolved_at = NOW(), resolved_by = $2
       WHERE output_id = $1 AND resolved_at IS NULL`,
      [outputId, resolvedBy]
    );
  }

  /**
   * Get all unresolved stale outputs (for dashboard widget).
   */
  async getAllUnresolvedStale(limit = 100): Promise<StaleOutput[]> {
    const result = await this.pool.query(
      `SELECT * FROM stale_outputs
       WHERE resolved_at IS NULL
       ORDER BY marked_stale_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map(rowToStaleOutput);
  }

  // ── Internal Helpers ──

  private async getParagraphHashes(
    client: PoolClient,
    slug: string
  ): Promise<Record<string, string>> {
    // We store paragraph hashes in a separate lightweight table or
    // derive from corpus_amendments. For simplicity, we use a
    // temporary table approach via a JSON column on corpus_snapshots.
    const result = await client.query(
      `SELECT paragraph_hashes FROM corpus_snapshot_paragraphs
       WHERE slug = $1 ORDER BY snapshot_id DESC LIMIT 1`,
      [slug]
    );
    if (!result.rows[0]) return {};
    return result.rows[0].paragraph_hashes as Record<string, string>;
  }

  private async storeParagraphHashes(
    client: PoolClient,
    slug: string,
    hashes: Record<string, string>
  ): Promise<void> {
    // Use a simple JSON storage table (created on demand)
    await client.query(
      `CREATE TABLE IF NOT EXISTS corpus_snapshot_paragraphs (
        id BIGSERIAL PRIMARY KEY,
        slug TEXT NOT NULL,
        snapshot_id BIGINT NOT NULL,
        paragraph_hashes JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    );
    const snapshotIdResult = await client.query(
      `SELECT id FROM corpus_snapshots WHERE slug = $1 AND valid_to IS NULL LIMIT 1`,
      [slug]
    );
    const snapshotId = snapshotIdResult.rows[0]?.id;
    if (snapshotId) {
      await client.query(
        `INSERT INTO corpus_snapshot_paragraphs (slug, snapshot_id, paragraph_hashes)
         VALUES ($1, $2, $3)`,
        [slug, snapshotId, JSON.stringify(hashes)]
      );
    }
  }

  private computeAmendments(
    slug: string,
    statuteCode: string,
    jurisdiction: Jurisdiction,
    newHashes: Record<string, string>,
    oldHashes: Record<string, string>,
    sourceUrl: string
  ): CorpusAmendment[] {
    const amendments: CorpusAmendment[] = [];
    const now = new Date().toISOString();

    for (const [para, hash] of Object.entries(newHashes)) {
      const oldHash = oldHashes[para];
      if (!oldHash) {
        amendments.push({
          slug,
          statute_code: statuteCode,
          jurisdiction,
          paragraph: para,
          change_type: "added",
          new_hash: hash,
          detected_at: now,
          source_url: sourceUrl,
        });
      } else if (oldHash !== hash) {
        amendments.push({
          slug,
          statute_code: statuteCode,
          jurisdiction,
          paragraph: para,
          change_type: "modified",
          old_hash: oldHash,
          new_hash: hash,
          detected_at: now,
          source_url: sourceUrl,
        });
      }
    }

    for (const [para, hash] of Object.entries(oldHashes)) {
      if (!newHashes[para]) {
        amendments.push({
          slug,
          statute_code: statuteCode,
          jurisdiction,
          paragraph: para,
          change_type: "removed",
          old_hash: hash,
          detected_at: now,
          source_url: sourceUrl,
        });
      }
    }

    return amendments;
  }
}

// ── Row Mappers ───────────────────────────────────────────────────────

function rowToAmendment(row: Record<string, unknown>): CorpusAmendment {
  return {
    id: Number(row.id),
    slug: row.slug as string,
    statute_code: row.statute_code as string,
    jurisdiction: row.jurisdiction as Jurisdiction,
    paragraph: row.paragraph as string,
    change_type: row.change_type as "added" | "modified" | "removed",
    old_hash: row.old_hash as string | undefined,
    new_hash: row.new_hash as string | undefined,
    detected_at: row.detected_at as string,
    source_url: row.source_url as string | undefined,
    announcement_date: row.announcement_date as string | undefined,
  };
}

function rowToStaleOutput(row: Record<string, unknown>): StaleOutput {
  return {
    id: Number(row.id),
    output_id: row.output_id as string,
    output_type: row.output_type as string,
    cited_slug: row.cited_slug as string,
    cited_paragraph: row.cited_paragraph as string | undefined,
    amendment_id: row.amendment_id ? Number(row.amendment_id) : undefined,
    marked_stale_at: row.marked_stale_at as string,
    resolved_at: row.resolved_at as string | undefined,
    resolved_by: row.resolved_by as string | undefined,
  };
}

// ── Hashing (compatible with statute-freshness.ts) ────────────────────

/**
 * Hash text using SHA-256, truncated to 16 chars (compatible with statute-freshness.ts).
 * Used for per-§ paragraph hashes.
 */
export function hashParagraph(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
