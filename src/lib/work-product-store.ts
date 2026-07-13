/**
 * Frontend DB store for Work Products (E6.2.1).
 *
 * Uses the shared frontend Postgres pool with lazy schema initialization.
 * All mutations go through the status machine validation.
 */

import { createSchemaInit } from "@/lib/schema-init";
import { getSharedPgPool } from "@/lib/auth/store";
import {
  type WorkProduct,
  type WorkProductStatus,
  type CreateWorkProductOpts,
  createWorkProduct,
  assertTransition,
  hashContent,
} from "@/lib/work-product";

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_work_products (
    id              TEXT PRIMARY KEY,
    product_type    TEXT NOT NULL,
    case_slug       TEXT NOT NULL,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    content         TEXT,
    content_hash    TEXT,
    receipt_id      TEXT,
    claim_evidence_slug TEXT,
    brain_id        TEXT NOT NULL,
    user_id         TEXT,
    jurisdiction    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at    TIMESTAMPTZ,
    approved_at     TIMESTAMPTZ,
    approved_by     TEXT,
    published_at    TIMESTAMPTZ,
    rejected_at     TIMESTAMPTZ,
    rejected_by     TEXT,
    rejection_reason TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT wp_status_check CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'published')),
    CONSTRAINT wp_type_check CHECK (product_type IN ('memo', 'draft', 'fristenreport', 'vertragsreview', 'redline', 'schriftsatz'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_wp_case ON subsumio_work_products(case_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_wp_brain ON subsumio_work_products(brain_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_wp_brain_status ON subsumio_work_products(brain_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_wp_brain_type ON subsumio_work_products(brain_id, product_type)`,
  `CREATE INDEX IF NOT EXISTS idx_wp_receipt ON subsumio_work_products(receipt_id)`,
]);

function pool() {
  return getSharedPgPool();
}

function rowToWorkProduct(row: Record<string, unknown>): WorkProduct {
  return {
    id: row.id as string,
    product_type: row.product_type as WorkProduct["product_type"],
    case_slug: row.case_slug as string,
    title: row.title as string,
    status: row.status as WorkProductStatus,
    content: (row.content as string) ?? null,
    content_hash: (row.content_hash as string) ?? null,
    receipt_id: (row.receipt_id as string) ?? null,
    claim_evidence_slug: (row.claim_evidence_slug as string) ?? null,
    brain_id: row.brain_id as string,
    user_id: (row.user_id as string) ?? null,
    jurisdiction: (row.jurisdiction as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    submitted_at: (row.submitted_at as string) ?? null,
    approved_at: (row.approved_at as string) ?? null,
    approved_by: (row.approved_by as string) ?? null,
    published_at: (row.published_at as string) ?? null,
    rejected_at: (row.rejected_at as string) ?? null,
    rejected_by: (row.rejected_by as string) ?? null,
    rejection_reason: (row.rejection_reason as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

/**
 * Create a new work product and persist it.
 */
export async function createAndStoreWorkProduct(opts: CreateWorkProductOpts): Promise<WorkProduct> {
  await ensureSchema();
  const p = pool();
  if (!p) throw new Error("No DB pool available");

  const wp = createWorkProduct(opts);
  await p.query(
    `INSERT INTO subsumio_work_products
      (id, product_type, case_slug, title, status, content, content_hash,
       receipt_id, claim_evidence_slug, brain_id, user_id, jurisdiction,
       created_at, updated_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      wp.id,
      wp.product_type,
      wp.case_slug,
      wp.title,
      wp.status,
      wp.content,
      wp.content_hash,
      wp.receipt_id,
      wp.claim_evidence_slug,
      wp.brain_id,
      wp.user_id,
      wp.jurisdiction,
      wp.created_at,
      wp.updated_at,
      JSON.stringify(wp.metadata),
    ]
  );
  return wp;
}

/**
 * Get a single work product by id, scoped to brain_id.
 */
export async function getWorkProduct(id: string, brainId: string): Promise<WorkProduct | null> {
  await ensureSchema();
  const p = pool();
  if (!p) return null;

  const res = await p.query(
    `SELECT * FROM subsumio_work_products WHERE id = $1 AND brain_id = $2`,
    [id, brainId]
  );
  if (res.rows.length === 0) return null;
  return rowToWorkProduct(res.rows[0] as Record<string, unknown>);
}

/**
 * List work products for a brain, optionally filtered by case_slug and/or status.
 */
export async function listWorkProducts(
  brainId: string,
  opts?: {
    caseSlug?: string;
    status?: WorkProductStatus;
    productType?: string;
    limit?: number;
  }
): Promise<WorkProduct[]> {
  await ensureSchema();
  const p = pool();
  if (!p) return [];

  const conditions = ["brain_id = $1"];
  const params: (string | number)[] = [brainId];
  let paramIdx = 2;

  if (opts?.caseSlug) {
    conditions.push(`case_slug = $${paramIdx++}`);
    params.push(opts.caseSlug);
  }
  if (opts?.status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(opts.status);
  }
  if (opts?.productType) {
    conditions.push(`product_type = $${paramIdx++}`);
    params.push(opts.productType);
  }

  const limit = opts?.limit ?? 50;
  params.push(limit);

  const res = await p.query(
    `SELECT * FROM subsumio_work_products WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${paramIdx}`,
    params
  );
  return res.rows.map((r) => rowToWorkProduct(r as Record<string, unknown>));
}

/**
 * Transition a work product to a new status.
 * Validates the transition and updates the relevant timestamp fields.
 */
export async function transitionWorkProductStatus(
  id: string,
  brainId: string,
  toStatus: WorkProductStatus,
  opts?: {
    approvedBy?: string;
    rejectedBy?: string;
    rejectionReason?: string;
  }
): Promise<WorkProduct | null> {
  await ensureSchema();
  const p = pool();
  if (!p) return null;

  const current = await getWorkProduct(id, brainId);
  if (!current) return null;

  assertTransition(current.status, toStatus);

  const now = new Date().toISOString();
  const updates: string[] = ["status = $2", "updated_at = $3"];
  const params: (string | null)[] = [id, toStatus, now];
  let paramIdx = 4;

  if (toStatus === "in_review") {
    updates.push(`submitted_at = $${paramIdx++}`);
    params.push(now);
    updates.push(`rejected_at = NULL`);
    updates.push(`rejected_by = NULL`);
    updates.push(`rejection_reason = NULL`);
  } else if (toStatus === "approved") {
    updates.push(`approved_at = $${paramIdx++}`);
    params.push(now);
    updates.push(`approved_by = $${paramIdx++}`);
    params.push(opts?.approvedBy ?? null);
  } else if (toStatus === "rejected") {
    updates.push(`rejected_at = $${paramIdx++}`);
    params.push(now);
    updates.push(`rejected_by = $${paramIdx++}`);
    params.push(opts?.rejectedBy ?? null);
    updates.push(`rejection_reason = $${paramIdx++}`);
    params.push(opts?.rejectionReason ?? null);
  } else if (toStatus === "published") {
    updates.push(`published_at = $${paramIdx++}`);
    params.push(now);
  }

  params.push(brainId);

  await p.query(
    `UPDATE subsumio_work_products SET ${updates.join(", ")}
     WHERE id = $1 AND brain_id = $${paramIdx}`,
    params
  );

  return getWorkProduct(id, brainId);
}

/**
 * Update the content of a work product.
 */
export async function updateWorkProductContent(
  id: string,
  brainId: string,
  content: string
): Promise<WorkProduct | null> {
  await ensureSchema();
  const p = pool();
  if (!p) return null;

  const now = new Date().toISOString();
  const contentHash = hashContent(content);

  await p.query(
    `UPDATE subsumio_work_products
     SET content = $3, content_hash = $4, updated_at = $5
     WHERE id = $1 AND brain_id = $2`,
    [id, brainId, content, contentHash, now]
  );

  return getWorkProduct(id, brainId);
}

/**
 * Attach a receipt to a work product.
 */
export async function attachReceiptToWorkProduct(
  id: string,
  brainId: string,
  receiptId: string
): Promise<void> {
  await ensureSchema();
  const p = pool();
  if (!p) return;

  await p.query(
    `UPDATE subsumio_work_products SET receipt_id = $3, updated_at = $4
     WHERE id = $1 AND brain_id = $2`,
    [id, brainId, receiptId, new Date().toISOString()]
  );
}

/**
 * Attach a claim-evidence graph slug to a work product.
 */
export async function attachClaimEvidenceToWorkProduct(
  id: string,
  brainId: string,
  slug: string
): Promise<void> {
  await ensureSchema();
  const p = pool();
  if (!p) return;

  await p.query(
    `UPDATE subsumio_work_products SET claim_evidence_slug = $3, updated_at = $4
     WHERE id = $1 AND brain_id = $2`,
    [id, brainId, slug, new Date().toISOString()]
  );
}

export type { WorkProduct, WorkProductStatus };
