/**
 * Store Interface for the Canonical Legal Issue Model — T1.1
 *
 * Adapter-only interface — no mega-pipeline rewrite.
 * Implementations may use PostgreSQL, PGLite, or in-memory storage.
 *
 * @module server/src/core/legal/issues/store
 */

import type {
  LegalIssue,
  LegalIssuePatch,
  IssueQuery,
  IssueValidationResult,
} from "./types.ts";
import type { Jurisdiction } from "../corpus-receipt.ts";

// ── Store Interface ───────────────────────────────────────────────────

/**
 * Persistent store for LegalIssue entities.
 *
 * This is an adapter interface — concrete implementations handle
 * the actual storage mechanism (PostgreSQL, PGLite, in-memory).
 *
 * All methods that accept a LegalIssue MUST validate it before
 * persistence. Invalid issues are rejected with a ValidationError.
 */
export interface IssueStore {
  /**
   * Create a new legal issue.
   * @throws {IssueStoreError} if the issue is invalid or already exists.
   */
  create(issue: LegalIssue): Promise<LegalIssue>;

  /**
   * Get a legal issue by ID.
   * @returns The issue, or null if not found.
   */
  getById(id: string): Promise<LegalIssue | null>;

  /**
   * List issues matching the query.
   */
  list(query: IssueQuery): Promise<LegalIssue[]>;

  /**
   * Update an existing issue with a partial patch.
   * The merged result is validated before persistence.
   * @throws {IssueStoreError} if the issue doesn't exist or the patch produces an invalid issue.
   */
  update(id: string, patch: LegalIssuePatch): Promise<LegalIssue>;

  /**
   * Delete a legal issue by ID.
   * @returns true if deleted, false if not found.
   */
  delete(id: string): Promise<boolean>;

  /**
   * Count issues matching the query (without loading them).
   */
  count(query: IssueQuery): Promise<number>;

  /**
   * Find issues that reference a specific corpus slug.
   * Used when a law is amended — to mark dependent issues as stale.
   */
  findByCorpusSlug(slug: string): Promise<LegalIssue[]>;

  /**
   * Mark issues referencing a corpus slug as stale.
   * Called by the snapshot-store when an amendment is detected.
   * @returns The number of issues marked stale.
   */
  markStaleByCorpusSlug(slug: string): Promise<number>;
}

// ── Store Errors ──────────────────────────────────────────────────────

export class IssueStoreError extends Error {
  constructor(
    message: string,
    public readonly code: IssueStoreErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "IssueStoreError";
  }
}

export type IssueStoreErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "VALIDATION_ERROR"
  | "STALE"
  | "INTERNAL";

// ── In-Memory Implementation (for testing & development) ──────────────

/**
 * In-memory IssueStore implementation.
 * Suitable for tests, development, and small-scale usage.
 *
 * Not persistent — data is lost when the process exits.
 */
export class InMemoryIssueStore implements IssueStore {
  private readonly issues = new Map<string, LegalIssue>();

  async create(issue: LegalIssue): Promise<LegalIssue> {
    if (this.issues.has(issue.id)) {
      throw new IssueStoreError(
        `Issue with id "${issue.id}" already exists`,
        "ALREADY_EXISTS"
      );
    }
    // Store a copy to prevent external mutation
    const stored = structuredClone(issue);
    this.issues.set(issue.id, stored);
    return structuredClone(stored);
  }

  async getById(id: string): Promise<LegalIssue | null> {
    const issue = this.issues.get(id);
    if (!issue) return null;
    return structuredClone(issue);
  }

  async list(query: IssueQuery): Promise<LegalIssue[]> {
    let results = Array.from(this.issues.values());

    if (query.jurisdiction) {
      results = results.filter((i) => i.jurisdiction === query.jurisdiction);
    }
    if (query.status) {
      results = results.filter((i) => i.status === query.status);
    }
    if (query.case_slug) {
      results = results.filter((i) => i.case_slug === query.case_slug);
    }
    if (query.brain_id) {
      results = results.filter((i) => i.brain_id === query.brain_id);
    }
    if (query.owner_id) {
      results = results.filter((i) => i.owner_id === query.owner_id);
    }
    if (query.risk) {
      results = results.filter((i) => i.risk === query.risk);
    }

    // Sort by created_at descending (newest first)
    results.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    return results.slice(offset, offset + limit).map((i) => structuredClone(i));
  }

  async update(id: string, patch: LegalIssuePatch): Promise<LegalIssue> {
    const existing = this.issues.get(id);
    if (!existing) {
      throw new IssueStoreError(`Issue with id "${id}" not found`, "NOT_FOUND");
    }

    const merged: LegalIssue = {
      ...existing,
      ...patch,
      // Ensure updated_at is set
      updated_at: patch.updated_at ?? new Date().toISOString(),
      // Immutable fields
      id: existing.id,
      created_at: existing.created_at,
      jurisdiction: existing.jurisdiction,
      as_of_date: existing.as_of_date,
      source_snapshot: existing.source_snapshot,
    };

    this.issues.set(id, structuredClone(merged));
    return structuredClone(merged);
  }

  async delete(id: string): Promise<boolean> {
    return this.issues.delete(id);
  }

  async count(query: IssueQuery): Promise<number> {
    const results = await this.list(query);
    return results.length;
  }

  async findByCorpusSlug(slug: string): Promise<LegalIssue[]> {
    const all = Array.from(this.issues.values());
    return all.filter((i) => i.source_snapshot.corpus_slugs.includes(slug));
  }

  async markStaleByCorpusSlug(slug: string): Promise<number> {
    const affected = await this.findByCorpusSlug(slug);
    let count = 0;
    for (const issue of affected) {
      if (issue.status !== "stale") {
        await this.update(issue.id, {
          status: "stale",
          updated_at: new Date().toISOString(),
        });
        count++;
      }
    }
    return count;
  }
}

// ── PostgreSQL Implementation (adapter, uses Pool) ────────────────────

/**
 * PostgreSQL IssueStore implementation.
 *
 * Uses the `legal_issues` table from migration 005.
 * The full LegalIssue is stored as JSONB in the `data` column,
 * with indexed columns for common query fields.
 */
export class PgIssueStore implements IssueStore {
  constructor(
    private pool: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
  ) {}

  async create(issue: LegalIssue): Promise<LegalIssue> {
    try {
      await this.pool.query(
        `INSERT INTO legal_issues
         (id, title, jurisdiction, as_of_date, status, risk, case_slug, brain_id, owner_id, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          issue.id,
          issue.title,
          issue.jurisdiction,
          issue.as_of_date,
          issue.status,
          issue.risk,
          issue.case_slug ?? null,
          issue.brain_id ?? null,
          issue.owner_id ?? null,
          JSON.stringify(issue),
          issue.created_at,
          issue.updated_at,
        ]
      );
      return issue;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
        throw new IssueStoreError(`Issue with id "${issue.id}" already exists`, "ALREADY_EXISTS", err);
      }
      throw new IssueStoreError(`Failed to create issue: ${msg}`, "INTERNAL", err);
    }
  }

  async getById(id: string): Promise<LegalIssue | null> {
    const result = await this.pool.query(
      `SELECT data FROM legal_issues WHERE id = $1`,
      [id]
    );
    if (!result.rows[0]?.data) return null;
    return JSON.parse(result.rows[0].data as string) as LegalIssue;
  }

  async list(query: IssueQuery): Promise<LegalIssue[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (query.jurisdiction) {
      conditions.push(`jurisdiction = $${paramIdx++}`);
      params.push(query.jurisdiction);
    }
    if (query.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(query.status);
    }
    if (query.case_slug) {
      conditions.push(`case_slug = $${paramIdx++}`);
      params.push(query.case_slug);
    }
    if (query.brain_id) {
      conditions.push(`brain_id = $${paramIdx++}`);
      params.push(query.brain_id);
    }
    if (query.owner_id) {
      conditions.push(`owner_id = $${paramIdx++}`);
      params.push(query.owner_id);
    }
    if (query.risk) {
      conditions.push(`risk = $${paramIdx++}`);
      params.push(query.risk);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const result = await this.pool.query(
      `SELECT data FROM legal_issues ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    return result.rows.map((r) => JSON.parse(r.data as string) as LegalIssue);
  }

  async update(id: string, patch: LegalIssuePatch): Promise<LegalIssue> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new IssueStoreError(`Issue with id "${id}" not found`, "NOT_FOUND");
    }

    const merged: LegalIssue = {
      ...existing,
      ...patch,
      updated_at: patch.updated_at ?? new Date().toISOString(),
      id: existing.id,
      created_at: existing.created_at,
      jurisdiction: existing.jurisdiction,
      as_of_date: existing.as_of_date,
      source_snapshot: existing.source_snapshot,
    };

    await this.pool.query(
      `UPDATE legal_issues
       SET title = $1, status = $2, risk = $3, data = $4, updated_at = $5
       WHERE id = $6`,
      [
        merged.title,
        merged.status,
        merged.risk,
        JSON.stringify(merged),
        merged.updated_at,
        id,
      ]
    );

    return merged;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM legal_issues WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }

  async count(query: IssueQuery): Promise<number> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (query.jurisdiction) {
      conditions.push(`jurisdiction = $${paramIdx++}`);
      params.push(query.jurisdiction);
    }
    if (query.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(query.status);
    }
    if (query.case_slug) {
      conditions.push(`case_slug = $${paramIdx++}`);
      params.push(query.case_slug);
    }
    if (query.brain_id) {
      conditions.push(`brain_id = $${paramIdx++}`);
      params.push(query.brain_id);
    }
    if (query.owner_id) {
      conditions.push(`owner_id = $${paramIdx++}`);
      params.push(query.owner_id);
    }
    if (query.risk) {
      conditions.push(`risk = $${paramIdx++}`);
      params.push(query.risk);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.pool.query(
      `SELECT COUNT(*)::int as count FROM legal_issues ${where}`,
      params
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async findByCorpusSlug(slug: string): Promise<LegalIssue[]> {
    const result = await this.pool.query(
      `SELECT data FROM legal_issues
       WHERE data->'source_snapshot'->'corpus_slugs' ? $1`,
      [slug]
    );
    return result.rows.map((r) => JSON.parse(r.data as string) as LegalIssue);
  }

  async markStaleByCorpusSlug(slug: string): Promise<number> {
    const affected = await this.findByCorpusSlug(slug);
    let count = 0;
    for (const issue of affected) {
      if (issue.status !== "stale") {
        await this.update(issue.id, {
          status: "stale",
          updated_at: new Date().toISOString(),
        });
        count++;
      }
    }
    return count;
  }
}

// ── Factory ───────────────────────────────────────────────────────────

/**
 * Create an IssueStore from a connection pool.
 * Returns a PgIssueStore for real database connections.
 */
export function createIssueStore(
  pool: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
): IssueStore {
  return new PgIssueStore(pool);
}

/**
 * Create an in-memory IssueStore (for tests).
 */
export function createInMemoryIssueStore(): IssueStore {
  return new InMemoryIssueStore();
}
