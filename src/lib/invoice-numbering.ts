// Consecutive, unique invoice numbers per firm and year ("R-2026-0007").
//
// Austrian VAT law requires a fortlaufende Nummer that identifies each invoice
// once. Numbers used to be picked in the browser (highest known + 1), so two
// invoices created at the same time could share a number. The server now
// allocates them with one atomic statement. The counter never goes below the
// highest number that already exists, so firms that invoiced before this
// change continue their sequence.

import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";

const ensureSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_invoice_counters (
    brain_id text NOT NULL,
    year integer NOT NULL,
    last_number integer NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brain_id, year)
  )
`);

const memoryCounters = new Map<string, number>();

export function formatInvoiceNumber(year: number, n: number): string {
  return `R-${year}-${String(n).padStart(4, "0")}`;
}

/** Highest sequence number among existing invoice numbers of that year. */
export function highestInvoiceNumber(
  numbers: Array<string | null | undefined>,
  year: number
): number {
  const prefix = `R-${year}-`;
  let max = 0;
  for (const value of numbers) {
    if (!value?.startsWith(prefix)) continue;
    const n = Number.parseInt(value.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export async function allocateInvoiceNumber(
  brainId: string,
  year: number,
  existingMax: number
): Promise<string> {
  const pool = getSharedPgPool();
  if (!pool) {
    const key = `${brainId}:${year}`;
    const next = Math.max(memoryCounters.get(key) ?? 0, existingMax) + 1;
    memoryCounters.set(key, next);
    return formatInvoiceNumber(year, next);
  }
  await ensureSchema();
  const { rows } = await pool.query<{ last_number: number }>(
    `INSERT INTO subsumio_invoice_counters (brain_id, year, last_number)
     VALUES ($1, $2, $3 + 1)
     ON CONFLICT (brain_id, year)
     DO UPDATE SET last_number = GREATEST(subsumio_invoice_counters.last_number, $3) + 1,
                   updated_at = now()
     RETURNING last_number`,
    [brainId, year, existingMax]
  );
  return formatInvoiceNumber(year, rows[0].last_number);
}
