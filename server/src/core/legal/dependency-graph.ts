/**
 * Stale Dependency Graph — Output → Claim → Source Snapshot
 *
 * T3.4: When a law changes, all outputs that cited that law must be
 * identified and marked for re-verification. Instead of blindly
 * regenerating everything, we maintain a dependency graph that
 * tracks which specific claims in which outputs depend on which
 * specific paragraphs of which snapshots.
 *
 * Architecture:
 *   1. When an output is generated, record dependencies:
 *      output_id → (source_slug, snapshot_hash, paragraph_ref, claim_hash)
 *   2. When a law is amended, find all dependencies on that slug
 *   3. Mark affected dependencies as 'pending' re-verification
 *   4. Attorney sees "betroffen seit" + amendment diff
 *   5. Attorney re-verifies → status becomes 'verified' or 'stale'
 *
 * @module server/src/core/legal/dependency-graph
 */

import type { Pool } from "pg";
import { createHash } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────

export type ReverifyStatus = "pending" | "verified" | "stale" | "failed" | "not_affected";

export interface OutputDependency {
  id: number;
  output_id: string;
  output_type: string;
  claim_hash: string | null;
  source_slug: string;
  snapshot_hash: string;
  paragraph_ref: string | null;
  brain_id: string | null;
  user_id: string | null;
  created_at: string;
  reverify_status: ReverifyStatus;
  reverified_at: string | null;
  reverified_by: string | null;
  reverify_notes: string | null;
  triggering_amendment_id: number | null;
}

export interface ReVerificationItem {
  dependency: OutputDependency;
  amendment: {
    id: number;
    paragraph: string;
    change_type: "added" | "modified" | "removed";
    old_hash: string | null;
    new_hash: string | null;
    detected_at: string;
  };
  output_summary: {
    output_id: string;
    output_type: string;
    brain_id: string | null;
    user_id: string | null;
  };
  affected_since: string;
}

export interface DependencyDiff {
  source_slug: string;
  paragraph_ref: string | null;
  change_type: "added" | "modified" | "removed";
  old_text_preview: string | null;
  new_text_preview: string | null;
  detected_at: string;
}

// ── Dependency Graph Store ────────────────────────────────────────────

/**
 * DependencyGraphStore — DB-backed output→claim→snapshot dependency tracking.
 */
export class DependencyGraphStore {
  constructor(private pool: Pool) {}

  /**
   * Record a dependency when an output is generated.
   * Called during pipeline output generation.
   */
  async recordDependency(opts: {
    output_id: string;
    output_type: string;
    source_slug: string;
    snapshot_hash: string;
    paragraph_ref?: string;
    claim_hash?: string;
    brain_id?: string;
    user_id?: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO output_dependencies
       (output_id, output_type, claim_hash, source_slug, snapshot_hash,
        paragraph_ref, brain_id, user_id, reverify_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       ON CONFLICT (output_id, source_slug, paragraph_ref, snapshot_hash) DO NOTHING`,
      [
        opts.output_id,
        opts.output_type,
        opts.claim_hash ?? null,
        opts.source_slug,
        opts.snapshot_hash,
        opts.paragraph_ref ?? null,
        opts.brain_id ?? null,
        opts.user_id ?? null,
      ]
    );
  }

  /**
   * Record dependencies for an output from its cited slugs.
   * Convenience method for batch recording.
   */
  async recordDependencies(
    outputId: string,
    outputType: string,
    citedSlugs: Array<{ slug: string; snapshot_hash: string; paragraph_ref?: string }>,
    opts?: { brain_id?: string; user_id?: string; claim_hash?: string }
  ): Promise<void> {
    for (const cited of citedSlugs) {
      await this.recordDependency({
        output_id: outputId,
        output_type: outputType,
        source_slug: cited.slug,
        snapshot_hash: cited.snapshot_hash,
        paragraph_ref: cited.paragraph_ref,
        brain_id: opts?.brain_id,
        user_id: opts?.user_id,
        claim_hash: opts?.claim_hash,
      });
    }
  }

  /**
   * Find all dependencies affected by an amendment to a slug.
   * This is called when statute-freshness detects a change.
   */
  async findAffectedBySlug(slug: string, paragraph?: string): Promise<OutputDependency[]> {
    let query = `SELECT * FROM output_dependencies WHERE source_slug = $1 AND reverify_status = 'pending'`;
    const params: (string | number)[] = [slug];
    if (paragraph) {
      query += ` AND (paragraph_ref = $2 OR paragraph_ref IS NULL)`;
      params.push(paragraph);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await this.pool.query(query, params);
    return result.rows.map(rowToOutputDependency);
  }

  /**
   * Mark dependencies as needing re-verification due to an amendment.
   */
  async markForReVerification(
    slug: string,
    amendmentId: number,
    paragraph?: string
  ): Promise<number> {
    let query = `UPDATE output_dependencies
     SET reverify_status = 'pending',
         triggering_amendment_id = $2
     WHERE source_slug = $1
       AND reverify_status NOT IN ('stale', 'failed')`;
    const params: (string | number)[] = [slug, amendmentId];
    if (paragraph) {
      query += ` AND (paragraph_ref = $3 OR paragraph_ref IS NULL)`;
      params.push(paragraph);
    }
    const result = await this.pool.query(query, params);
    return result.rowCount ?? 0;
  }

  /**
   * Get the re-verification queue for a specific brain/tenant.
   */
  async getReVerificationQueue(opts: {
    brain_id?: string;
    limit?: number;
  }): Promise<ReVerificationItem[]> {
    const limit = opts?.limit ?? 50;
    let query = `
      SELECT
        d.*,
        a.id as amendment_id,
        a.paragraph as amendment_paragraph,
        a.change_type as amendment_change_type,
        a.old_hash as amendment_old_hash,
        a.new_hash as amendment_new_hash,
        a.detected_at as amendment_detected_at
      FROM output_dependencies d
      LEFT JOIN corpus_amendments a ON d.triggering_amendment_id = a.id
      WHERE d.reverify_status = 'pending'
    `;
    const params: (string | number)[] = [];
    if (opts?.brain_id) {
      query += ` AND d.brain_id = $1`;
      params.push(opts.brain_id);
    }
    query += ` ORDER BY d.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.pool.query(query, params);

    return result.rows.map((row) => ({
      dependency: rowToOutputDependency(row),
      amendment: {
        id: Number(row.amendment_id ?? 0),
        paragraph: row.amendment_paragraph as string,
        change_type: row.amendment_change_type as "added" | "modified" | "removed",
        old_hash: (row.amendment_old_hash as string) ?? null,
        new_hash: (row.amendment_new_hash as string) ?? null,
        detected_at: row.amendment_detected_at as string,
      },
      output_summary: {
        output_id: row.output_id as string,
        output_type: row.output_type as string,
        brain_id: (row.brain_id as string) ?? null,
        user_id: (row.user_id as string) ?? null,
      },
      affected_since: row.amendment_detected_at as string,
    }));
  }

  /**
   * Re-verify a specific dependency.
   */
  async reVerify(
    dependencyId: number,
    status: ReverifyStatus,
    reviewerId: string,
    notes?: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE output_dependencies
       SET reverify_status = $2,
           reverified_at = NOW(),
           reverified_by = $3,
           reverify_notes = $4
       WHERE id = $1`,
      [dependencyId, status, reviewerId, notes ?? null]
    );
  }

  /**
   * Get all dependencies for an output.
   */
  async getDependenciesForOutput(outputId: string): Promise<OutputDependency[]> {
    const result = await this.pool.query(
      `SELECT * FROM output_dependencies WHERE output_id = $1 ORDER BY created_at DESC`,
      [outputId]
    );
    return result.rows.map(rowToOutputDependency);
  }

  /**
   * Get the diff for a re-verification item (what changed in the law).
   */
  async getDiff(
    slug: string,
    paragraph: string | null,
    amendmentId: number
  ): Promise<DependencyDiff | null> {
    const result = await this.pool.query(
      `SELECT * FROM corpus_amendments WHERE id = $1 AND slug = $2`,
      [amendmentId, slug]
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      source_slug: slug,
      paragraph_ref: paragraph,
      change_type: row.change_type as "added" | "modified" | "removed",
      old_text_preview: null, // would need to fetch from previous snapshot
      new_text_preview: null, // would need to fetch from current snapshot
      detected_at: row.detected_at as string,
    };
  }

  /**
   * Get re-verification statistics for a brain/tenant.
   */
  async getStats(brainId?: string): Promise<{
    total: number;
    pending: number;
    verified: number;
    stale: number;
    failed: number;
    not_affected: number;
  }> {
    let query = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE reverify_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE reverify_status = 'verified') as verified,
        COUNT(*) FILTER (WHERE reverify_status = 'stale') as stale,
        COUNT(*) FILTER (WHERE reverify_status = 'failed') as failed,
        COUNT(*) FILTER (WHERE reverify_status = 'not_affected') as not_affected
      FROM output_dependencies
    `;
    const params: (string | number)[] = [];
    if (brainId) {
      query += ` WHERE brain_id = $1`;
      params.push(brainId);
    }
    const result = await this.pool.query(query, params);
    const row = result.rows[0]!;
    return {
      total: Number(row.total),
      pending: Number(row.pending),
      verified: Number(row.verified),
      stale: Number(row.stale),
      failed: Number(row.failed),
      not_affected: Number(row.not_affected),
    };
  }

  /**
   * Check if an output has any pending re-verifications.
   */
  async hasPendingReVerifications(outputId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM output_dependencies
       WHERE output_id = $1 AND reverify_status = 'pending' LIMIT 1`,
      [outputId]
    );
    return result.rows.length > 0;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Compute a claim hash from claim text.
 */
export function computeClaimHash(claimText: string): string {
  return createHash("sha256").update(claimText, "utf8").digest("hex");
}

// ── Row Mapper ────────────────────────────────────────────────────────

function rowToOutputDependency(row: Record<string, unknown>): OutputDependency {
  return {
    id: Number(row.id),
    output_id: row.output_id as string,
    output_type: row.output_type as string,
    claim_hash: (row.claim_hash as string) ?? null,
    source_slug: row.source_slug as string,
    snapshot_hash: row.snapshot_hash as string,
    paragraph_ref: (row.paragraph_ref as string) ?? null,
    brain_id: (row.brain_id as string) ?? null,
    user_id: (row.user_id as string) ?? null,
    created_at: row.created_at as string,
    reverify_status: row.reverify_status as ReverifyStatus,
    reverified_at: (row.reverified_at as string) ?? null,
    reverified_by: (row.reverified_by as string) ?? null,
    reverify_notes: (row.reverify_notes as string) ?? null,
    triggering_amendment_id: (row.triggering_amendment_id as number)
      ? Number(row.triggering_amendment_id)
      : null,
  };
}
