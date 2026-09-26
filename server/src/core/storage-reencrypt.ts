/**
 * storage-reencrypt — brings originals stored before at-rest encryption was
 * switched on up to the same bar: every plaintext object listed in `files` is
 * rewritten as an encrypted envelope (core/file-encryption.ts).
 *
 * Safety rules (an original is the only copy of a client document):
 *
 *   - Dry run by default: without `apply` nothing is written; the run only
 *     counts plaintext objects (and records the count for the admin health
 *     indicator).
 *   - Idempotent: an object that already carries the envelope header is
 *     skipped, so a repeated or interrupted run never double-encrypts.
 *   - Resumable: the id of the last finished `files` row is kept in the
 *     config table; a new run continues after it (`restart` starts over).
 *   - Verify before replace: the envelope is first written to a side object
 *     and read back; it must decrypt to the exact original bytes (SHA-256)
 *     before the original is replaced. The replaced original is read back
 *     and verified again; on any mismatch the plaintext is restored.
 *   - Never delete without verification: the only deletion of plaintext is
 *     the replacement itself (or, on write-once local files, removing the
 *     original right before rewriting it), and it happens only after the
 *     side copy verified. The side copy is removed only after the original
 *     verified.
 */
import { createHash } from "node:crypto";
import type { StorageBackend } from "./storage.ts";
import { type Keyring, decryptFile, encryptFile, isEncrypted } from "./file-encryption.ts";

/** Minimal engine surface: raw SQL + the config table. Both engines provide it. */
export interface ReencryptEngine {
  executeRaw<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string): Promise<void>;
}

export const REENCRYPT_CURSOR_KEY = "storage.reencrypt.cursor";
export const REENCRYPT_STATUS_KEY = "storage.reencrypt.status";
const SIDE_SUFFIX = ".reenc-verify";

export interface ReencryptOptions {
  engine: ReencryptEngine;
  /** The backend WITHOUT the encryption decorator (createRawStorage). */
  backend: StorageBackend;
  keyring: Keyring;
  /** false (default) = dry run: count only, write nothing. */
  apply?: boolean;
  /** Restrict to one tenant source. */
  sourceId?: string;
  /** Stop after this many rows (for staged runs). */
  limit?: number;
  /** Rows read per query (default 200). */
  batchSize?: number;
  /** Ignore the saved cursor and start from the first row. */
  restart?: boolean;
  /** Called after every row: rows done so far, total rows in scope. */
  onProgress?: (done: number, total: number) => void;
}

export interface ReencryptFailure {
  path: string;
  error: string;
}

export interface ReencryptResult {
  dryRun: boolean;
  /** Rows in scope (all `files` rows, or those of the source). */
  total: number;
  scanned: number;
  alreadyEncrypted: number;
  /** Plaintext objects found (dry run) or left plaintext because they failed. */
  plaintext: number;
  reencrypted: number;
  /** Rows whose object is missing in storage. */
  missing: number;
  failed: ReencryptFailure[];
  /** True when the run reached the last row (not stopped by `limit`). */
  complete: boolean;
}

/** What the admin health indicator shows: the result of the last full run. */
export interface ReencryptStatus {
  checked_at: string;
  dry_run: boolean;
  total: number;
  plaintext: number;
  failed: number;
  complete: boolean;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Only an envelope that decrypts to exactly `expectedHash` counts as verified. */
function verifies(stored: Buffer, keyring: Keyring, expectedHash: string): boolean {
  if (!isEncrypted(stored)) return false;
  try {
    return sha256(decryptFile(stored, keyring)) === expectedHash;
  } catch {
    return false;
  }
}

/**
 * Re-encrypt one plaintext object in place. Throws when the object could
 * not be brought to a verified encrypted state; the original plaintext is
 * then still (or again) in place.
 */
export async function reencryptObject(
  backend: StorageBackend,
  keyring: Keyring,
  path: string,
  plaintext: Buffer
): Promise<void> {
  const hash = sha256(plaintext);
  const envelope = encryptFile(plaintext, keyring);
  if (!verifies(envelope, keyring, hash)) throw new Error("envelope does not verify");

  // 1. Side copy, read back and verified before the original is touched.
  const side = `${path}${SIDE_SUFFIX}`;
  await backend.upload(side, envelope);
  if (!verifies(await backend.download(side), keyring, hash)) {
    await backend.delete(side).catch(() => undefined);
    throw new Error("side copy does not verify; original left unchanged");
  }

  // 2. Replace the original. Write-once local files (read-only mode) refuse
  //    an overwrite: then the original is removed and rewritten — safe,
  //    because the verified side copy and the bytes in memory both exist.
  try {
    await backend.upload(path, envelope);
  } catch {
    await backend.delete(path);
    await backend.upload(path, envelope);
  }

  // 3. Verify the replaced original; restore the plaintext on any mismatch.
  let ok = false;
  try {
    ok = verifies(await backend.download(path), keyring, hash);
  } catch {
    ok = false;
  }
  if (!ok) {
    try {
      await backend.upload(path, plaintext);
    } catch {
      await backend.delete(path).catch(() => undefined);
      await backend.upload(path, plaintext);
    }
    await backend.delete(side).catch(() => undefined);
    throw new Error("replaced object does not verify; plaintext restored");
  }

  // Write-once protection comes back on the encrypted object.
  if (backend.setImmutable) await backend.setImmutable(path).catch(() => undefined);
  await backend.delete(side);
}

/**
 * Walk the `files` rows in id order and re-encrypt every plaintext object
 * (or, in a dry run, count them). See the module comment for the rules.
 */
export async function reencryptStoredFiles(opts: ReencryptOptions): Promise<ReencryptResult> {
  const { engine, backend, keyring } = opts;
  const apply = opts.apply === true;
  const batchSize = Math.max(1, Math.min(opts.batchSize ?? 200, 1000));
  const limit = opts.limit && opts.limit > 0 ? Math.floor(opts.limit) : Infinity;
  const scoped = typeof opts.sourceId === "string" && opts.sourceId.length > 0;
  const cursorKey = scoped ? `${REENCRYPT_CURSOR_KEY}.${opts.sourceId}` : REENCRYPT_CURSOR_KEY;

  // Only an applying run moves the cursor; a dry run always counts everything.
  let cursor = 0;
  if (apply && !opts.restart) {
    const saved = Number(await engine.getConfig(cursorKey));
    if (Number.isInteger(saved) && saved > 0) cursor = saved;
  }
  const startCursor = cursor;

  const countRows = await engine.executeRaw<{ n: number | string }>(
    `SELECT count(*) AS n FROM files${scoped ? " WHERE source_id = $1" : ""}`,
    scoped ? [opts.sourceId] : []
  );
  const total = Number(countRows[0]?.n ?? 0);

  const result: ReencryptResult = {
    dryRun: !apply,
    total,
    scanned: 0,
    alreadyEncrypted: 0,
    plaintext: 0,
    reencrypted: 0,
    missing: 0,
    failed: [],
    complete: false,
  };

  for (;;) {
    if (result.scanned >= limit) break;
    const take = Math.min(batchSize, limit - result.scanned);
    const rows = await engine.executeRaw<{ id: number | string; storage_path: string }>(
      `SELECT id, storage_path FROM files
        WHERE id > $1${scoped ? " AND source_id = $3" : ""}
        ORDER BY id
        LIMIT $2`,
      scoped ? [cursor, take, opts.sourceId] : [cursor, take]
    );
    if (rows.length === 0) {
      result.complete = true;
      break;
    }
    for (const row of rows) {
      const id = Number(row.id);
      result.scanned++;
      let data: Buffer | null = null;
      try {
        data = await backend.download(row.storage_path);
      } catch {
        result.missing++;
      }
      if (data) {
        if (isEncrypted(data)) {
          result.alreadyEncrypted++;
        } else if (!apply) {
          result.plaintext++;
        } else {
          try {
            await reencryptObject(backend, keyring, row.storage_path, data);
            result.reencrypted++;
          } catch (err) {
            result.plaintext++;
            result.failed.push({ path: row.storage_path, error: errText(err) });
          }
        }
      }
      cursor = id;
      opts.onProgress?.(result.scanned, total);
    }
    // A failed row stays behind the cursor too — it is reported and a
    // `restart` run picks it up again (already-encrypted rows are skipped).
    if (apply) await engine.setConfig(cursorKey, String(cursor));
    if (rows.length < take) {
      result.complete = true;
      break;
    }
  }

  // Only a full pass over all sources (from the first row to the last) is
  // what the health indicator reports.
  if (!scoped && result.complete && startCursor === 0 && limit === Infinity) {
    const status: ReencryptStatus = {
      checked_at: new Date().toISOString(),
      dry_run: !apply,
      total,
      plaintext: result.plaintext,
      failed: result.failed.length,
      complete: result.complete,
    };
    // Plain text value in the config table (not a jsonb column).
    await engine.setConfig(REENCRYPT_STATUS_KEY, JSON.stringify(status));
  }
  if (apply && result.complete && result.failed.length === 0) {
    // Finished cleanly: the next run starts over (and finds nothing to do).
    await engine.setConfig(cursorKey, "0");
  }
  return result;
}

/** The last recorded full run, or null. */
export async function readReencryptStatus(
  engine: Pick<ReencryptEngine, "getConfig">
): Promise<ReencryptStatus | null> {
  try {
    const raw = await engine.getConfig(REENCRYPT_STATUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReencryptStatus;
    return parsed && typeof parsed.total === "number" ? parsed : null;
  } catch {
    return null;
  }
}
