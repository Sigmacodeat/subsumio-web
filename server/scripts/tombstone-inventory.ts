/**
 * Inventory discipline for the soft-delete scripts (tombstone-db-orphans,
 * tombstone-dead-end-pages). The inventory is the only targeted way back
 * from a mistaken mass soft-delete, so:
 *
 *   - every run writes its own file (`<base>-<runId>.jsonl`) — a second run
 *     can never overwrite the first one's record;
 *   - lines are appended and fsynced BEFORE the matching UPDATE runs — a run
 *     killed half-way still has a record of every row it touched.
 */
import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";

/** Filesystem-safe run id: UTC timestamp plus an optional scope (source). */
export function makeRunId(scope: string, now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "Z");
  const safeScope = scope.replace(/[^A-Za-z0-9_-]/g, "_");
  return `${ts}-${safeScope}`;
}

/** `/x/inventory.jsonl` + run id → `/x/inventory-<runId>.jsonl`. */
export function inventoryPathFor(base: string, runId: string): string {
  const m = /^(.*?)(\.jsonl)?$/.exec(base)!;
  return `${m[1]}-${runId}.jsonl`;
}

export class InventoryWriter {
  private fd: number | null = null;
  lines = 0;
  constructor(readonly path: string) {}

  /** Append + fsync. Opens lazily (exclusive create) so an empty run leaves no file. */
  append(lines: string[]): void {
    if (lines.length === 0) return;
    if (this.fd === null) this.fd = openSync(this.path, "wx");
    writeSync(this.fd, lines.join("\n") + "\n");
    fsyncSync(this.fd);
    this.lines += lines.length;
  }

  close(): void {
    if (this.fd !== null) closeSync(this.fd);
    this.fd = null;
  }
}

interface RawExecutor {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
}

/**
 * Records every entry in the inventory first, then soft-deletes by id in
 * batches. If an UPDATE fails, the inventory already lists all rows that
 * may have been touched.
 */
export async function tombstoneWithInventory(
  engine: RawExecutor,
  entries: Array<{ id: number; line: string }>,
  writer: InventoryWriter,
  batchSize = 500,
  onBatch?: (done: number, total: number) => void
): Promise<void> {
  writer.append(entries.map((e) => e.line));
  const ids = entries.map((e) => e.id);
  for (let i = 0; i < ids.length; i += batchSize) {
    await engine.executeRaw(
      `UPDATE pages SET deleted_at = now() WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL`,
      [ids.slice(i, i + batchSize)]
    );
    onBatch?.(Math.min(i + batchSize, ids.length), ids.length);
  }
}
