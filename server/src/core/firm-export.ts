/**
 * firm-export — the complete export of a firm's data (Art. 20 DSGVO, leaving
 * the service): every page as JSON plus every original file, in one ZIP.
 *
 * Built by the `firm-export` Minion job (minions/handlers/firm-export.ts):
 *
 *   - Pages are listed with keyset paging (list_pages cursor) and read one by
 *     one through get_page, both under the requesting admin's matter scope
 *     and document ACL — the export holds exactly what that admin may see.
 *   - Originals are read from the storage backend (decrypted when at-rest
 *     encryption is on) one at a time and written straight into the archive;
 *     the archive itself is streamed to a work file, never held in memory.
 *   - The finished archive goes to the storage backend under `exports/`,
 *     sealed with the stream envelope when an encryption key is configured.
 *   - A manifest lists every page and file (with SHA-256), and what could not
 *     be read; `complete` is true only when nothing is missing.
 *
 * Download: once, within FIRM_EXPORT_TTL_MS of completion, only by the admin
 * who asked for it (claimFirmExportDownload). Afterwards, or when the link
 * expires, the archive is deleted (sweepFirmExports).
 */
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { PassThrough, Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { BrainEngine } from "./engine.ts";
import type { StorageBackend } from "./storage.ts";
import type { Keyring } from "./file-encryption.ts";
import { ZipStreamWriter, safeEntryName } from "./zip-stream.ts";
import { createDecryptStream, createEncryptStream } from "./stream-encryption.ts";
import type { MatterScope } from "./matter-access.ts";

export const FIRM_EXPORT_JOB = "firm-export";
/** A finished export can be downloaded for at most 24 hours. */
export const FIRM_EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_BATCH = 100;
const FILE_BATCH = 200;

/** Frontmatter keys that never leave in an export (kanzlei settings secret). */
const SECRET_FRONTMATTER_KEYS = ["smtpPassword", "smtpPasswordEnc"];

export interface FirmExportProgress {
  phase: "pages" | "files" | "upload" | "done";
  pages_total: number | null;
  pages_done: number;
  files_done: number;
  bytes: number;
}

export interface FirmExportResult {
  storage_path: string;
  size_bytes: number;
  sha256: string;
  encrypted: boolean;
  pages: number;
  files: number;
  pages_missing: number;
  files_missing: number;
  complete: boolean;
  finished_at: string;
  expires_at: string;
}

/** Reads one page under the requester's scope; null when it is gone or hidden. */
export type ScopedPageReader = (slug: string) => Promise<Record<string, unknown> | null>;
/** Lists pages under the requester's scope, keyset-paged. */
export type ScopedPageLister = (cursor: string | undefined) => Promise<{
  pages: Array<{ slug: string }>;
  next_cursor: string | null;
  has_more: boolean;
}>;

export interface BuildFirmExportOptions {
  engine: Pick<BrainEngine, "executeRaw">;
  sourceId: string;
  exportId: string;
  /** Requester's matter scope — decides whether caseless originals belong in. */
  matterScope?: MatterScope;
  listPages: ScopedPageLister;
  readPage: ScopedPageReader;
  /** Storage with transparent decryption (createStorage) — reads originals. */
  storage: StorageBackend;
  /** Raw backend (createRawStorage) — receives the sealed archive. */
  rawStorage: StorageBackend;
  keyring: Keyring | null;
  workDir: string;
  onProgress?: (p: FirmExportProgress) => void | Promise<void>;
  signal?: AbortSignal;
  now?: () => Date;
}

function tenantKey(sourceId: string): string {
  return `tenant-${createHash("sha256").update(sourceId).digest("hex").slice(0, 20)}`;
}

export function firmExportStoragePath(sourceId: string, exportId: string): string {
  return `exports/${tenantKey(sourceId)}/${safeEntryName(exportId)}.zip`;
}

function withoutSecrets(page: Record<string, unknown>): Record<string, unknown> {
  const fm = page.frontmatter;
  if (!fm || typeof fm !== "object") return page;
  const clean: Record<string, unknown> = { ...(fm as Record<string, unknown>) };
  let changed = false;
  for (const k of SECRET_FRONTMATTER_KEYS) {
    if (k in clean) {
      delete clean[k];
      changed = true;
    }
  }
  return changed ? { ...page, frontmatter: clean } : page;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("firm export aborted");
}

function firmWide(scope: MatterScope | undefined): boolean {
  if (scope === undefined || scope === "all") return true;
  return scope.includes("*");
}

/**
 * Build the archive and store it. Throws on failures that make the export
 * useless (storage write, listing); per-page and per-file read failures are
 * recorded in the manifest and make it `complete: false`.
 */
export async function buildFirmExport(opts: BuildFirmExportOptions): Promise<FirmExportResult> {
  const now = opts.now ?? (() => new Date());
  mkdirSync(opts.workDir, { recursive: true });
  const workFile = join(opts.workDir, `${randomBytes(8).toString("hex")}.part`);
  const storagePath = firmExportStoragePath(opts.sourceId, opts.exportId);

  const countRows = await opts.engine.executeRaw<{ n: number | string }>(
    `SELECT count(*) AS n FROM pages WHERE source_id = $1 AND deleted_at IS NULL`,
    [opts.sourceId]
  );
  const progress: FirmExportProgress = {
    phase: "pages",
    pages_total: Number(countRows[0]?.n ?? 0),
    pages_done: 0,
    files_done: 0,
    bytes: 0,
  };
  let lastReport = 0;
  const report = async (force = false) => {
    const t = Date.now();
    if (!force && t - lastReport < 1000) return;
    lastReport = t;
    await opts.onProgress?.({ ...progress });
  };

  // Zip → hash → (seal) → work file; the archive is never buffered as a
  // whole. The hash is taken over the plain ZIP the recipient will get.
  const zipOut = new PassThrough();
  const hash = createHash("sha256");
  const hashing = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  const sink = createWriteStream(workFile, { mode: 0o600 });
  const done = opts.keyring
    ? pipeline(zipOut, hashing, createEncryptStream(opts.keyring), sink)
    : pipeline(zipOut, hashing, sink);

  const zip = new ZipStreamWriter(zipOut);
  const mtime = now();
  const exportedSlugs = new Set<string>();
  const pagesMissing: string[] = [];
  const fileEntries: Array<{
    path: string;
    page_slug: string | null;
    sha256: string;
    size: number;
  }> = [];
  const filesMissing: Array<{ page_slug: string | null; filename: string; reason: string }> = [];

  try {
    // ── Pages ──
    let cursor: string | undefined;
    for (;;) {
      throwIfAborted(opts.signal);
      const batch = await opts.listPages(cursor);
      for (const entry of batch.pages) {
        throwIfAborted(opts.signal);
        if (!entry.slug || exportedSlugs.has(entry.slug)) continue;
        let page: Record<string, unknown> | null = null;
        try {
          page = await opts.readPage(entry.slug);
        } catch {
          page = null;
        }
        if (!page) {
          pagesMissing.push(entry.slug);
          continue;
        }
        exportedSlugs.add(entry.slug);
        await zip.addBuffer(
          `pages/${entry.slug}.json`,
          Buffer.from(JSON.stringify(withoutSecrets(page), null, 2), "utf8"),
          { deflate: true, mtime }
        );
        progress.pages_done++;
        progress.bytes = zip.bytesWritten;
        await report();
      }
      if (!batch.has_more || !batch.next_cursor || batch.next_cursor === cursor) break;
      cursor = batch.next_cursor;
    }

    // ── Originals ──
    progress.phase = "files";
    await report(true);
    const includeCaseless = firmWide(opts.matterScope);
    const usedNames = new Set<string>();
    let lastId = 0;
    for (;;) {
      throwIfAborted(opts.signal);
      const rows = await opts.engine.executeRaw<{
        id: number | string;
        page_slug: string | null;
        filename: string;
        storage_path: string;
        content_hash: string | null;
      }>(
        `SELECT id, page_slug, filename, storage_path, content_hash
           FROM files
          WHERE source_id = $1 AND id > $2
          ORDER BY id
          LIMIT $3`,
        [opts.sourceId, lastId, FILE_BATCH]
      );
      if (rows.length === 0) break;
      for (const row of rows) {
        lastId = Number(row.id);
        throwIfAborted(opts.signal);
        // Originals follow their page: only pages in the export take their
        // files along; caseless uploads only for a firm-wide scope.
        if (row.page_slug ? !exportedSlugs.has(row.page_slug) : !includeCaseless) continue;
        if (row.storage_path.startsWith("quarantined/")) {
          filesMissing.push({
            page_slug: row.page_slug,
            filename: row.filename,
            reason: "quarantined",
          });
          continue;
        }
        let data: Buffer;
        try {
          data = await opts.storage.download(row.storage_path);
        } catch {
          filesMissing.push({
            page_slug: row.page_slug,
            filename: row.filename,
            reason: "not_in_storage",
          });
          continue;
        }
        const base = `files/${row.page_slug ?? "ohne-seite"}/${row.filename}`;
        let name = safeEntryName(base);
        for (let i = 2; usedNames.has(name); i++) {
          name = safeEntryName(`files/${row.page_slug ?? "ohne-seite"}/${i}-${row.filename}`);
        }
        usedNames.add(name);
        await zip.addBuffer(name, data, { mtime });
        fileEntries.push({
          path: name,
          page_slug: row.page_slug,
          sha256: createHash("sha256").update(data).digest("hex"),
          size: data.length,
        });
        progress.files_done++;
        progress.bytes = zip.bytesWritten;
        await report();
      }
    }

    // ── Manifest ──
    const complete = pagesMissing.length === 0 && filesMissing.length === 0;
    const manifest = {
      format: "subsumio-firm-export",
      version: 1,
      generated_at: mtime.toISOString(),
      complete,
      pages: exportedSlugs.size,
      files: fileEntries.length,
      pages_missing: pagesMissing,
      files_missing: filesMissing,
      file_index: fileEntries,
      note: "pages/<slug>.json enthält jeden Eintrag mit Text und Metadaten, files/<slug>/ die Originaldateien (SHA-256 im file_index).",
    };
    await zip.addBuffer("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"), {
      deflate: true,
      mtime,
    });
    await zip.finish();
    zipOut.end();
    await done;

    // ── Store ──
    progress.phase = "upload";
    progress.bytes = zip.bytesWritten;
    await report(true);
    const size = statSync(workFile).size;
    if (opts.rawStorage.uploadStream) {
      await opts.rawStorage.uploadStream(
        storagePath,
        createReadStream(workFile),
        "application/octet-stream"
      );
    } else {
      const { readFileSync } = await import("node:fs");
      await opts.rawStorage.upload(storagePath, readFileSync(workFile), "application/octet-stream");
    }
    const finished = now();
    progress.phase = "done";
    await report(true);
    return {
      storage_path: storagePath,
      size_bytes: size,
      sha256: hash.digest("hex"),
      encrypted: opts.keyring !== null,
      pages: exportedSlugs.size,
      files: fileEntries.length,
      pages_missing: pagesMissing.length,
      files_missing: filesMissing.length,
      complete,
      finished_at: finished.toISOString(),
      expires_at: new Date(finished.getTime() + FIRM_EXPORT_TTL_MS).toISOString(),
    };
  } catch (err) {
    zipOut.destroy();
    await done.catch(() => undefined);
    await opts.rawStorage.delete(storagePath).catch(() => undefined);
    throw err;
  } finally {
    rmSync(workFile, { force: true });
  }
}

/** Plaintext archive stream for a stored export (decrypts a sealed one). */
export async function openFirmExportArchive(
  rawStorage: StorageBackend,
  storagePath: string,
  keyring: Keyring | null,
  encrypted: boolean
): Promise<Readable> {
  const { Readable: R } = await import("node:stream");
  const source = rawStorage.downloadStream
    ? ((await rawStorage.downloadStream(storagePath)) as Readable)
    : R.from(await rawStorage.download(storagePath));
  if (!encrypted) return source;
  if (!keyring) throw new Error("firm export is encrypted but no storage key is configured");
  const out = createDecryptStream(keyring);
  source.on("error", (e) => out.destroy(e));
  return source.pipe(out);
}

// ── Job bookkeeping on minion_jobs (engine-neutral SQL) ────────────────────

export interface FirmExportJobRow {
  id: number;
  status: string;
  created_at: string;
  finished_at: string | null;
  error_text: string | null;
  data: Record<string, unknown>;
  progress: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
}

function obj(v: unknown): Record<string, unknown> | null {
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v) as unknown;
      return p && typeof p === "object" ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function toRow(r: Record<string, unknown>): FirmExportJobRow {
  return {
    id: Number(r.id),
    status: String(r.status),
    created_at: String(r.created_at),
    finished_at: r.finished_at == null ? null : String(r.finished_at),
    error_text: r.error_text == null ? null : String(r.error_text),
    data: obj(r.data) ?? {},
    progress: obj(r.progress),
    result: obj(r.result),
  };
}

const JOB_COLUMNS = `id, status, created_at::text AS created_at, finished_at::text AS finished_at,
  error_text, data, progress, result`;

export async function getFirmExportJob(
  engine: Pick<BrainEngine, "executeRaw">,
  id: number,
  sourceId: string
): Promise<FirmExportJobRow | null> {
  const rows = await engine.executeRaw<Record<string, unknown>>(
    `SELECT ${JOB_COLUMNS} FROM minion_jobs
      WHERE id = $1 AND name = $2 AND data->>'_source_id' = $3`,
    [id, FIRM_EXPORT_JOB, sourceId]
  );
  return rows[0] ? toRow(rows[0]) : null;
}

export async function listFirmExportJobs(
  engine: Pick<BrainEngine, "executeRaw">,
  sourceId: string,
  limit = 10
): Promise<FirmExportJobRow[]> {
  const rows = await engine.executeRaw<Record<string, unknown>>(
    `SELECT ${JOB_COLUMNS} FROM minion_jobs
      WHERE name = $1 AND data->>'_source_id' = $2
      ORDER BY id DESC
      LIMIT $3`,
    [FIRM_EXPORT_JOB, sourceId, limit]
  );
  return rows.map(toRow);
}

/** An export of this source that is still waiting or running, if any. */
export async function findRunningFirmExport(
  engine: Pick<BrainEngine, "executeRaw">,
  sourceId: string
): Promise<FirmExportJobRow | null> {
  const rows = await engine.executeRaw<Record<string, unknown>>(
    `SELECT ${JOB_COLUMNS} FROM minion_jobs
      WHERE name = $1 AND data->>'_source_id' = $2
        AND status IN ('waiting', 'active', 'delayed', 'paused')
      ORDER BY id DESC
      LIMIT 1`,
    [FIRM_EXPORT_JOB, sourceId]
  );
  return rows[0] ? toRow(rows[0]) : null;
}

export type FirmExportState = "queued" | "running" | "ready" | "downloaded" | "expired" | "failed";

/** What the UI shows for a job. */
export function firmExportState(job: FirmExportJobRow, now: number = Date.now()): FirmExportState {
  if (job.status === "failed" || job.status === "dead" || job.status === "cancelled") {
    return "failed";
  }
  if (job.status !== "completed") return job.status === "active" ? "running" : "queued";
  const r = job.result ?? {};
  if (r.downloaded_at) return "downloaded";
  const exp = Date.parse(String(r.expires_at ?? ""));
  if (!Number.isFinite(exp) || exp <= now || r.deleted_at) return "expired";
  return "ready";
}

export type ClaimOutcome =
  | { ok: true; job: FirmExportJobRow }
  | { ok: false; reason: "not_found" | "not_ready" | "used" | "expired" | "forbidden" };

/**
 * Claim the single download of an export. Atomic: of two concurrent claims
 * only one succeeds. Only the admin who requested the export may claim it.
 */
export async function claimFirmExportDownload(
  engine: Pick<BrainEngine, "executeRaw">,
  id: number,
  sourceId: string,
  userId: string | undefined,
  now: Date = new Date()
): Promise<ClaimOutcome> {
  const job = await getFirmExportJob(engine, id, sourceId);
  if (!job) return { ok: false, reason: "not_found" };
  if (!userId || job.data.user_id !== userId) return { ok: false, reason: "forbidden" };
  const state = firmExportState(job, now.getTime());
  if (state === "downloaded") return { ok: false, reason: "used" };
  if (state === "expired") return { ok: false, reason: "expired" };
  if (state !== "ready") return { ok: false, reason: "not_ready" };
  const claimed = await engine.executeRaw<Record<string, unknown>>(
    `UPDATE minion_jobs
        SET result = result || jsonb_build_object('downloaded_at', $3::text),
            updated_at = now()
      WHERE id = $1 AND name = $2 AND status = 'completed'
        AND data->>'_source_id' = $4
        AND NOT (result ? 'downloaded_at')
        AND NOT (result ? 'deleted_at')
        AND (result->>'expires_at')::timestamptz > $3::text::timestamptz
      RETURNING ${JOB_COLUMNS}`,
    [id, FIRM_EXPORT_JOB, now.toISOString(), sourceId]
  );
  if (claimed.length === 0) return { ok: false, reason: "used" };
  return { ok: true, job: toRow(claimed[0]!) };
}

/** Remove a stored archive and record it on the job. */
export async function deleteFirmExportArchive(
  engine: Pick<BrainEngine, "executeRaw">,
  rawStorage: StorageBackend,
  job: FirmExportJobRow,
  now: Date = new Date()
): Promise<void> {
  const path = typeof job.result?.storage_path === "string" ? job.result.storage_path : null;
  if (path) await rawStorage.delete(path);
  await engine.executeRaw(
    `UPDATE minion_jobs
        SET result = COALESCE(result, '{}'::jsonb) || jsonb_build_object('deleted_at', $2::text),
            updated_at = now()
      WHERE id = $1 AND name = $3`,
    [job.id, now.toISOString(), FIRM_EXPORT_JOB]
  );
}

export interface SweepResult {
  deleted: number;
  /** Exports that finished and were not announced yet (for the notification). */
  finished: Array<{
    id: number;
    source_id: string;
    user_id: string | null;
    web_brain_id: string | null;
    expires_at: string | null;
    complete: boolean;
  }>;
}

/**
 * Delete every archive past its expiry (or already downloaded), and hand out
 * newly finished exports once for the completion notification.
 */
export async function sweepFirmExports(
  engine: Pick<BrainEngine, "executeRaw">,
  rawStorage: StorageBackend,
  now: Date = new Date()
): Promise<SweepResult> {
  const stale = await engine.executeRaw<Record<string, unknown>>(
    `SELECT ${JOB_COLUMNS} FROM minion_jobs
      WHERE name = $1 AND status = 'completed'
        AND result ? 'storage_path'
        AND NOT (result ? 'deleted_at')
        AND (result ? 'downloaded_at' OR (result->>'expires_at')::timestamptz <= $2::text::timestamptz)`,
    [FIRM_EXPORT_JOB, now.toISOString()]
  );
  let deleted = 0;
  for (const r of stale) {
    try {
      await deleteFirmExportArchive(engine, rawStorage, toRow(r), now);
      deleted++;
    } catch {
      // Left for the next sweep.
    }
  }
  const announced = await engine.executeRaw<Record<string, unknown>>(
    `UPDATE minion_jobs
        SET result = result || jsonb_build_object('notified_at', $2::text),
            updated_at = now()
      WHERE name = $1 AND status = 'completed'
        AND result ? 'storage_path'
        AND NOT (result ? 'notified_at')
      RETURNING id, data, result`,
    [FIRM_EXPORT_JOB, now.toISOString()]
  );
  return {
    deleted,
    finished: announced.map((r) => {
      const data = obj(r.data) ?? {};
      const result = obj(r.result) ?? {};
      return {
        id: Number(r.id),
        source_id: String(data._source_id ?? ""),
        user_id: typeof data.user_id === "string" ? data.user_id : null,
        web_brain_id: typeof data.web_brain_id === "string" ? data.web_brain_id : null,
        expires_at: typeof result.expires_at === "string" ? result.expires_at : null,
        complete: result.complete === true,
      };
    }),
  };
}
