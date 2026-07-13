/**
 * Engine-side DB store for WorkProductReceipts.
 *
 * Uses the engine's postgres.js connection (via `getConnection()`).
 * Schema is identical to the frontend store so both sides can read/write the
 * same table.
 */

import { getConnection } from "@/core/db.ts";
import {
  type WorkProductReceipt,
  type WorkProductType,
  invalidateReceipt,
  buildWorkProductReceipt,
  type BuildReceiptOptions,
} from "@/lib/work-product-receipts.ts";

async function ensureSchema(): Promise<void> {
  const sql = getConnection();
  await sql`
    CREATE TABLE IF NOT EXISTS subsumio_work_product_receipts (
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
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_wpr_product
      ON subsumio_work_product_receipts(product_type, product_ref, version DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_wpr_brain
      ON subsumio_work_product_receipts(brain_id, created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_wpr_hash
      ON subsumio_work_product_receipts(output_hash)
  `;
}

function rowToReceipt(row: Record<string, unknown>): WorkProductReceipt {
  return (row.receipt as WorkProductReceipt) ?? JSON.parse(row.receipt as string);
}

/**
 * Store a receipt row. Upserts on (product_type, product_ref, version).
 */
export async function storeReceipt(receipt: WorkProductReceipt): Promise<WorkProductReceipt> {
  await ensureSchema();
  const sql = getConnection();

  await sql`
    INSERT INTO subsumio_work_product_receipts
      (receipt_id, product_type, product_ref, version, previous_receipt_id, state,
       output_hash, brain_id, user_id, created_at, invalidated_at, invalidated_by, receipt)
    VALUES (
      ${receipt.receipt_id}, ${receipt.product_type}, ${receipt.product_ref},
      ${receipt.version}, ${receipt.previous_receipt_id ?? null}, ${receipt.state},
      ${receipt.output_hash}, ${receipt.brain_id}, ${receipt.user_id ?? null},
      ${receipt.created_at}, ${receipt.invalidated_at ?? null},
      ${receipt.invalidated_by ?? null}, ${sql.json(receipt as any)}
    )
    ON CONFLICT (product_type, product_ref, version) DO UPDATE SET
      receipt = EXCLUDED.receipt,
      state = EXCLUDED.state,
      output_hash = EXCLUDED.output_hash,
      invalidated_at = EXCLUDED.invalidated_at,
      invalidated_by = EXCLUDED.invalidated_by
  `;

  return receipt;
}

/**
 * Build a new receipt and persist it, invalidating the previous version if the
 * output hash changed.
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
 */
export async function getReceipt(receiptId: string): Promise<WorkProductReceipt | null> {
  await ensureSchema();
  const sql = getConnection();
  const rows = await sql`
    SELECT receipt FROM subsumio_work_product_receipts WHERE receipt_id = ${receiptId}
  `;
  if (rows.length === 0) return null;
  return rowToReceipt(rows[0] as Record<string, unknown>);
}

/**
 * Get the latest receipt for a work product.
 */
export async function getLatestReceipt(
  productType: WorkProductType,
  productRef: string,
  brainId: string
): Promise<WorkProductReceipt | null> {
  await ensureSchema();
  const sql = getConnection();
  const rows = await sql`
    SELECT receipt FROM subsumio_work_product_receipts
    WHERE product_type = ${productType}
      AND product_ref = ${productRef}
      AND brain_id = ${brainId}
    ORDER BY version DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rowToReceipt(rows[0] as Record<string, unknown>);
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
  const sql = getConnection();
  const rows = await sql`
    SELECT receipt FROM subsumio_work_product_receipts
    WHERE product_type = ${productType}
      AND product_ref = ${productRef}
      AND brain_id = ${brainId}
    ORDER BY version DESC
  `;
  return rows.map((r) => rowToReceipt(r as Record<string, unknown>));
}

/**
 * Mark a receipt as invalidated by a newer receipt.
 */
export async function markReceiptInvalidated(
  receiptId: string,
  invalidatedByReceiptId: string
): Promise<WorkProductReceipt | null> {
  await ensureSchema();
  const existing = await getReceipt(receiptId);
  if (!existing) return null;
  const invalidated = invalidateReceipt(existing, invalidatedByReceiptId);
  return storeReceipt(invalidated);
}

export type { WorkProductReceipt, WorkProductType, BuildReceiptOptions };
