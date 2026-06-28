/**
 * `extract-document` Minion job handler — the async arm of the upload pipeline.
 *
 * For uploads at or above `SUBSUMIO_ASYNC_EXTRACT_MIN_BYTES` (default 15 MB) the
 * upload route persists the raw bytes, writes a stub page with
 * `extraction_status: "processing"`, and enqueues this job. The request returns
 * immediately; this handler then does the heavy work in the in-process worker:
 *
 *   1. Read the original bytes back from durable storage (file-store).
 *   2. Run the SAME `runExtractionAndImport` orchestrator the synchronous path
 *      uses (extract → markdown → split/import → stamp case_slug → tag →
 *      auto-trigger legal-pipeline) so async and sync produce identical results.
 *   3. Stamp a terminal `extraction_status` ("ready" / "failed").
 *
 * Failure posture:
 *   - Password / unsupported-format errors are TERMINAL (retrying without a
 *     password or a supported format is pointless): mark the page `failed` with
 *     a machine-readable `extraction_error_code` the UI can act on, and return
 *     normally so the queue does not retry.
 *   - Any other error is treated as TRANSIENT: mark `failed` for visibility and
 *     re-throw so the queue retries per the job's `max_attempts` (the original
 *     bytes remain in storage, so a retry re-reads and re-extracts cleanly).
 */

import type { MinionJobContext } from "../types.ts";
import type { BrainEngine } from "../../engine.ts";
import { readStoredFile } from "../../file-store.ts";
import { PasswordRequiredError, InvalidDocumentPasswordError } from "../../extract-document.ts";
import {
  runExtractionAndImport,
  invokeOp,
  UnsupportedUploadError,
} from "../../../commands/web-api.ts";

export interface ExtractDocumentResult {
  slug: string;
  status: "ready" | "failed";
  part_count: number;
  error_code?: string;
}

interface ExtractJobData {
  slug?: string;
  filename?: string;
  title?: string;
  tags?: string[];
  case_slug?: string;
  source_id?: string;
  no_embed?: boolean;
  password?: string;
  upload_frontmatter?: Record<string, unknown>;
  matter_scope?: string[] | "all";
  acl_groups?: string[] | "all";
}

export function makeExtractDocumentHandler({ engine }: { engine: BrainEngine }) {
  return async function extractDocumentHandler(
    job: MinionJobContext
  ): Promise<ExtractDocumentResult> {
    const d = (job.data ?? {}) as ExtractJobData;
    const slug = d.slug;
    const sourceId = d.source_id ?? "default";
    if (!slug || !d.filename) {
      throw new Error("extract-document: job.data.slug and job.data.filename are required");
    }

    const stored = await readStoredFile(slug, sourceId);
    if (!stored) {
      // Bytes gone (storage misconfig / GC) — terminal, retrying won't help.
      await markFailed(engine, slug, sourceId, "original_bytes_missing");
      return { slug, status: "failed", part_count: 0, error_code: "original_bytes_missing" };
    }

    try {
      await job.updateProgress({ phase: "extract", slug });

      const { partSlugs } = await runExtractionAndImport(engine, {
        slug,
        filename: d.filename,
        data: stored.data,
        title: d.title,
        tagList: d.tags ?? [],
        caseSlug: d.case_slug,
        uploadFrontmatter: d.upload_frontmatter ?? {},
        tenantSource: sourceId,
        noEmbed: d.no_embed ?? false,
        password: d.password,
        matterScope: d.matter_scope,
        aclGroups: d.acl_groups,
      });

      // Guarantee a terminal status. The import normally overwrites the stub's
      // frontmatter with the extracted one (which carries extraction_status),
      // but if it didn't set one — or left the stub's "processing" — stamp
      // "ready" so the document never gets stuck mid-state.
      const page = await engine.getPage(slug, { sourceId });
      const status = page?.frontmatter?.extraction_status;
      if (!status || status === "processing") {
        await invokeOp(
          engine,
          "put_page",
          {
            slug,
            frontmatter: {
              extraction_status: "ready",
              extraction_completed_at: new Date().toISOString(),
            },
            merge: true,
          },
          sourceId
        );
      }

      await job.updateProgress({ phase: "done", slug, part_count: partSlugs.length });
      return { slug, status: "ready", part_count: partSlugs.length };
    } catch (err) {
      const code =
        err instanceof PasswordRequiredError
          ? "password_required"
          : err instanceof InvalidDocumentPasswordError
            ? "invalid_document_password"
            : err instanceof UnsupportedUploadError
              ? "unsupported_format"
              : "extraction_error";
      const msg = err instanceof Error ? err.message : String(err);
      await markFailed(engine, slug, sourceId, code, msg);

      // Terminal failures: return normally so the queue does NOT retry.
      if (code !== "extraction_error") {
        return { slug, status: "failed", part_count: 0, error_code: code };
      }
      // Transient: re-throw so the queue retries per max_attempts.
      throw err;
    }
  };
}

async function markFailed(
  engine: BrainEngine,
  slug: string,
  sourceId: string,
  code: string,
  message?: string
): Promise<void> {
  try {
    await invokeOp(
      engine,
      "put_page",
      {
        slug,
        frontmatter: {
          extraction_status: "failed",
          extraction_error_code: code,
          ...(message ? { extraction_error: message.slice(0, 500) } : {}),
          extraction_failed_at: new Date().toISOString(),
        },
        merge: true,
      },
      sourceId
    );
  } catch (e) {
    console.error(
      `[extract-document] could not mark ${slug} failed:`,
      e instanceof Error ? e.message : String(e)
    );
  }
}
