/**
 * Frontend DB store for WorkProductReceipts.
 *
 * Uses the shared frontend Postgres pool and a lazy schema initializer.
 * All mutations are immutable at the row level: a new version gets a new row
 * and the old row is marked invalidated.
 */

import { createSchemaInit } from "@/lib/schema-init";
import { getSharedPgPool } from "@/lib/auth/store";
import {
  type WorkProductReceipt,
  type WorkProductType,
  invalidateReceipt,
  buildWorkProductReceipt,
  type BuildReceiptOptions,
} from "@/lib/work-product-receipts";

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_work_product_receipts (
    receipt_id text PRIMARY KEY,
    product_type text NOT NULL,
    product_ref text NOT NULL,
    version integer NOT NULL,
    previous_receipt_id text,
    state text NOT NULL,
    output_hash text NOT NULL,
    brain_id text NOT NULL,
    user_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    invalidated_at timestamptz,
    invalidated_by text,
    receipt jsonb NOT NULL,
    UNIQUE(product_type, product_ref, version)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_wpr_product ON subsumio_work_product_receipts(product_type, product_ref, version DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_wpr_brain ON subsumio_work_product_receipts(brain_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_wpr_hash ON subsumio_work_product_receipts(output_hash)`,
]);

function pool() {
  return getSharedPgPool();
}

function rowToReceipt(row: Record<string, unknown>): WorkProductReceipt {
  return (row.receipt as WorkProductReceipt) ?? JSON.parse(row.receipt as string);
}

/**
 * Store a new receipt. If a previous receipt for the same product exists and
 * is not invalidated, it is marked as invalidated by the new receipt.
 */
export async function storeReceipt(receipt: WorkProductReceipt): Promise<WorkProductReceipt> {
  await ensureSchema();
  const p = pool();
  if (!p) throw new Error("No DB pool available");

  await p.query(
    `INSERT INTO subsumio_work_product_receipts
      (receipt_id, product_type, product_ref, version, previous_receipt_id, state,
       output_hash, brain_id, user_id, created_at, invalidated_at, invalidated_by, receipt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (product_type, product_ref, version) DO UPDATE SET
       receipt = EXCLUDED.receipt,
       state = EXCLUDED.state,
       output_hash = EXCLUDED.output_hash,
       invalidated_at = EXCLUDED.invalidated_at,
       invalidated_by = EXCLUDED.invalidated_by`,
    [
      receipt.receipt_id,
      receipt.product_type,
      receipt.product_ref,
      receipt.version,
      receipt.previous_receipt_id ?? null,
      receipt.state,
      receipt.output_hash,
      receipt.brain_id,
      receipt.user_id ?? null,
      receipt.created_at,
      receipt.invalidated_at ?? null,
      receipt.invalidated_by ?? null,
      JSON.stringify(receipt),
    ]
  );

  return receipt;
}

/**
 * Build a new receipt for a work product and persist it, invalidating the
 * previous receipt if the output changed.
 */
export async function createAndStoreReceipt(
  opts: BuildReceiptOptions
): Promise<WorkProductReceipt> {
  const previous = await getLatestReceipt(opts.product_type, opts.product_ref, opts.brain_id);
  const receipt = buildWorkProductReceipt({ ...opts, previousReceipt: previous });

  if (previous && previous.output_hash !== receipt.output_hash && !previous.invalidated_at) {
    const invalidated = invalidateReceipt(previous, receipt.receipt_id);
    await storeReceipt(invalidated);
  }

  return storeReceipt(receipt);
}

/**
 * Get a single receipt by id.
 *
 * When `brainId` is provided, the query is scoped to that brain — preventing
 * cross-tenant access even if an attacker knows a receipt_id from another tenant.
 */
export async function getReceipt(
  receiptId: string,
  brainId?: string
): Promise<WorkProductReceipt | null> {
  await ensureSchema();
  const p = pool();
  if (!p) return null;

  const res = brainId
    ? await p.query(
        `SELECT receipt FROM subsumio_work_product_receipts
         WHERE receipt_id = $1 AND brain_id = $2`,
        [receiptId, brainId]
      )
    : await p.query(
        `SELECT receipt FROM subsumio_work_product_receipts WHERE receipt_id = $1`,
        [receiptId]
      );
  if (res.rows.length === 0) return null;
  return rowToReceipt(res.rows[0] as Record<string, unknown>);
}

/**
 * Get the latest receipt for a work product (highest version, not necessarily valid).
 */
export async function getLatestReceipt(
  productType: WorkProductType,
  productRef: string,
  brainId: string
): Promise<WorkProductReceipt | null> {
  await ensureSchema();
  const p = pool();
  if (!p) return null;

  const res = await p.query(
    `SELECT receipt FROM subsumio_work_product_receipts
     WHERE product_type = $1 AND product_ref = $2 AND brain_id = $3
     ORDER BY version DESC LIMIT 1`,
    [productType, productRef, brainId]
  );
  if (res.rows.length === 0) return null;
  return rowToReceipt(res.rows[0] as Record<string, unknown>);
}

/**
 * List all receipts for a work product, newest first.
 */
export async function listReceiptsForProduct(
  productType: WorkProductType,
  productRef: string,
  brainId: string
): Promise<WorkProductReceipt[]> {
  await ensureSchema();
  const p = pool();
  if (!p) return [];

  const res = await p.query(
    `SELECT receipt FROM subsumio_work_product_receipts
     WHERE product_type = $1 AND product_ref = $2 AND brain_id = $3
     ORDER BY version DESC`,
    [productType, productRef, brainId]
  );
  return res.rows.map((r) => rowToReceipt(r as Record<string, unknown>));
}

/**
 * Mark an existing receipt as invalidated by a newer receipt id.
 */
export async function markReceiptInvalidated(
  receiptId: string,
  invalidatedByReceiptId: string,
  brainId?: string
): Promise<WorkProductReceipt | null> {
  await ensureSchema();
  const p = pool();
  if (!p) return null;

  const existing = await getReceipt(receiptId, brainId);
  if (!existing) return null;

  const invalidated = invalidateReceipt(existing, invalidatedByReceiptId);
  return storeReceipt(invalidated);
}

export type { WorkProductReceipt, WorkProductType, BuildReceiptOptions };
