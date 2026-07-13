/**
 * `ingest_capture` Minion job handler. Receives an IngestionEvent payload
 * from the daemon's dispatcher (or the webhook source's POST /ingest
 * handler) and routes it through `importFromContent` to land as a brain
 * page.
 *
 * Trust posture (E1 + eng-review decisions):
 *   - The event's `untrusted_payload` flag is preserved on the job's
 *     result for audit, but does NOT change the importFromContent call
 *     itself — auto-link runs at the put_page operation layer, which we
 *     deliberately bypass here. The handler calls importFromContent
 *     directly. v1 path: webhook OAuth gate is the trust boundary; the
 *     handler trusts the event-shape but treats content as user-authored
 *     markdown.
 *   - Auto-link integration with the untrusted_payload tag is a v2
 *     improvement (would require routing through the put_page op AND
 *     extending OperationContext with the trust tag). See TODOs in the
 *     plan.
 *
 * Slug resolution (in order):
 *   1. `job.data.slug` if caller provided one
 *   2. `job.data.metadata.slug` if event metadata carried one
 *   3. Generated default: `inbox/YYYY-MM-DD-<hash6>` using the event's
 *      content_hash prefix. Stable for the same content.
 *
 * The default slug deliberately lives under `inbox/` — that's the
 * triage convention the user will discover when reviewing recent
 * captures. A downstream skill (post-capture-triage) can promote inbox
 * pages to canonical homes later.
 */

import type { MinionJobContext } from "../types.ts";
import type { BrainEngine } from "../../engine.ts";
import type { IngestionEvent } from "../../ingestion/types.ts";
import { validateIngestionEvent } from "../../ingestion/types.ts";
import { importFromContent } from "../../import-file.ts";
import { persistFileBuffer } from "../../file-store.ts";
import { inspectUploadFile } from "../../upload-security.ts";
import { runExtractionAndImport } from "../../../commands/web-api.ts";
import { legalPipelineIdempotencyKey } from "../../upload-pipeline-routing.ts";
import { classifyLegalDocument, legalDocTypeLabel } from "../../legal/doc-classifier.ts";
import { MinionQueue } from "../queue.ts";
import { basename, extname, isAbsolute } from "node:path";
import { lstat, readFile, realpath } from "node:fs/promises";

export interface IngestCaptureResult {
  slug: string;
  status: "imported" | "skipped" | "error";
  chunks: number;
  untrusted_payload: boolean;
  source_kind: string;
  source_uri: string;
  pipeline_queued: boolean;
  consolidate_queued: boolean;
}

/** Builds the default slug for an event when the caller didn't provide one. */
export function defaultSlugForEvent(event: IngestionEvent, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hashPrefix = event.content_hash.slice(0, 6);
  return `inbox/${y}-${m}-${d}-${hashPrefix}`;
}

export function makeIngestCaptureHandler(engine: BrainEngine) {
  return async function ingestCaptureHandler(job: MinionJobContext): Promise<IngestCaptureResult> {
    const data = job.data as { event?: unknown; slug?: unknown };
    const event = data.event as IngestionEvent | undefined;
    if (!event) {
      throw new Error("ingest_capture: job.data.event is required");
    }
    const validationErr = validateIngestionEvent(event);
    if (validationErr) {
      throw new Error(`ingest_capture: invalid event payload: ${validationErr.message}`);
    }

    // Slug resolution.
    let slug: string;
    if (typeof data.slug === "string" && data.slug.length > 0) {
      slug = data.slug;
    } else if (
      event.metadata &&
      typeof (event.metadata as Record<string, unknown>).slug === "string"
    ) {
      slug = (event.metadata as Record<string, unknown>).slug as string;
    } else {
      slug = defaultSlugForEvent(event);
    }

    // Untrusted-payload posture. For v1, the flag is propagated for audit
    // but not enforced at this layer (see file header). Future v2 wiring
    // through put_page will use this flag.
    const untrustedPayload = event.untrusted_payload === true;

    // For text-typed events, content is the inline markdown/text. For
    // binary types (image/audio/video/pdf), content is a path-or-URI that
    // the content-type processor pipeline transforms. The v1 wave lands
    // the text path; processors arrive in subsequent commits.
    const isText =
      event.content_type === "text/markdown" ||
      event.content_type === "text/plain" ||
      event.content_type === "text/html" ||
      event.content_type === "application/json" ||
      event.content_type === "unknown";

    const targetSource =
      event.source_kind === "connector:advokat-import" &&
      typeof event.metadata?.target_source_id === "string"
        ? event.metadata.target_source_id
        : event.source_id || "default";

    // Connector documents must become semantically queryable in the same job.
    // Other high-volume capture sources may still explicitly request deferred
    // embeddings with noEmbed=true.
    const noEmbed = (data as { noEmbed?: unknown }).noEmbed === true;

    // Connector/webhook source ids are dynamic tenants in SaaS mode. Provision
    // the FK row before any page/blob write, idempotently and fail-closed.
    await engine.executeRaw(
      `INSERT INTO sources(id, name, config)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [targetSource, targetSource, JSON.stringify({ provisioned_by: "ingest_capture" })]
    );

    if (!isText) {
      if (untrustedPayload) {
        throw new Error("ingest_capture: untrusted binary path payload rejected");
      }
      if (
        !isAbsolute(event.content) ||
        event.content.startsWith("/proc/") ||
        event.content.startsWith("/dev/")
      ) {
        throw new Error("ingest_capture: binary content must be a safe absolute file path");
      }
      let resolvedPath: string;
      try {
        resolvedPath = await realpath(event.content);
      } catch {
        throw new Error("ingest_capture: binary content path is unavailable");
      }
      const stat = await lstat(resolvedPath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error("ingest_capture: binary content path must resolve to a regular file");
      }
      const filename =
        typeof event.metadata?.filename === "string"
          ? basename(event.metadata.filename)
          : basename(resolvedPath);
      const security = await inspectUploadFile(filename, resolvedPath);
      if (!security.ok) {
        throw new Error(`ingest_capture: binary security rejection: ${security.code}`);
      }
      const bytes = await readFile(resolvedPath);
      const caseSlug =
        typeof event.metadata?.case_slug === "string" ? event.metadata.case_slug : undefined;
      await persistFileBuffer({
        data: bytes,
        filename,
        pageSlug: slug,
        caseSlug,
        sourceId: targetSource,
        zone: "clean",
      });
      const { partSlugs } = await runExtractionAndImport(engine, {
        slug,
        filename,
        data: bytes,
        title: typeof event.metadata?.title === "string" ? event.metadata.title : undefined,
        tagList: Array.isArray(event.metadata?.tags) ? event.metadata.tags.map(String) : [],
        caseSlug,
        uploadFrontmatter: {
          source: "connector",
          source_format: extname(filename).replace(/^\./, "").toLowerCase(),
          source_kind: event.source_kind,
          source_uri: event.source_uri,
          ingested_via: "ingest_capture",
          ...(caseSlug ? { case_slug: caseSlug, assignment_status: "assigned" } : {}),
        },
        tenantSource: targetSource,
        noEmbed,
        autoTriggerLegalPipeline: true,
      });
      return {
        slug,
        status: "imported",
        chunks: partSlugs.length,
        untrusted_payload: false,
        source_kind: event.source_kind,
        source_uri: event.source_uri,
        pipeline_queued: true,
        consolidate_queued: false,
      };
    }

    const result = await importFromContent(engine, slug, event.content, {
      noEmbed,
      sourceId: targetSource,
      source_kind: event.source_kind,
      source_uri: event.source_uri,
      ingested_via: "ingest_capture",
    });

    // E2: Trigger legal-pipeline for non-upload ingestion paths (email, portal,
    // WhatsApp, beA, connectors). The upload path triggers it via
    // runExtractionAndImport; ingest_capture must do the same so documents
    // ingested through connectors get the same Layer 0-7 processing.
    let pipeline_queued = false;
    try {
      const classification = classifyLegalDocument(event.content);
      if (classification.type !== "legal_document") {
        // Stamp frontmatter with doc_type like the upload path does
        const page = await engine.getPage(slug);
        if (page) {
          const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
          await engine.putPage(
            slug,
            {
              type: page.type,
              title: page.title,
              compiled_truth: page.compiled_truth ?? "",
              frontmatter: {
                ...fm,
                doc_type: classification.type,
                doc_type_label: legalDocTypeLabel(classification.type),
                doc_type_confidence: classification.confidence.toFixed(2),
              },
            },
            { sourceId: targetSource !== "default" ? targetSource : undefined }
          );
        }

        // Enqueue only after intake has an explicit jurisdiction. Connector
        // payloads without it remain imported but are blocked for legal
        // analysis instead of silently becoming Austrian matters.
        const currentPage = await engine.getPage(slug);
        const currentFrontmatter = (currentPage?.frontmatter ?? {}) as Record<string, unknown>;
        const jurisdiction = String(currentFrontmatter.jurisdiction ?? "").toLowerCase();
        if (
          jurisdiction === "at" ||
          jurisdiction === "de" ||
          jurisdiction === "ch" ||
          jurisdiction === "eu"
        ) {
          const queue = new MinionQueue(engine);
          await queue.add(
            "legal-pipeline",
            {
              case_slug: slug,
              part_slugs: [slug],
              ...(targetSource !== "default" ? { source_id: targetSource } : {}),
              trigger: "ingest_capture",
              jurisdiction,
              as_of_date: new Date().toISOString().slice(0, 10),
            },
            {
              timeout_ms: 60 * 60 * 1000,
              max_attempts: 3,
              idempotency_key: legalPipelineIdempotencyKey(targetSource, slug, [slug]),
            },
            { allowProtectedSubmit: true }
          );
          pipeline_queued = true;
        } else {
          console.warn(
            `[ingest_capture] legal-pipeline not queued for ${slug}: jurisdiction requires intake confirmation`
          );
        }
      }
    } catch (pipelineErr) {
      console.error(
        `[ingest_capture] legal-pipeline trigger failed for ${slug}: ` +
          (pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr))
      );
    }

    // v0.46 — Post-ingest incremental consolidation (Hindsight trigger).
    // Enqueue a consolidate-incremental job for the ingested slug so newly
    // extracted facts are promoted to takes within seconds instead of
    // waiting for the next dream cycle. Fail-open: if enqueue fails, the
    // dream cycle will consolidate everything in the full scan.
    let consolidate_queued = false;
    try {
      const consolidateQueue = new MinionQueue(engine);
      await consolidateQueue.add(
        "consolidate-incremental",
        {
          affectedSlugs: [slug],
          ...(targetSource !== "default" ? { source_id: targetSource } : {}),
          reason: "ingest_capture",
        },
        {
          timeout_ms: 5 * 60 * 1000,
          max_attempts: 2,
          idempotency_key: `consolidate-inc:${targetSource}:${slug}`,
        },
        { allowProtectedSubmit: true }
      );
      consolidate_queued = true;
    } catch (consolidateErr) {
      console.error(
        `[ingest_capture] consolidate-incremental trigger failed for ${slug}: ` +
          (consolidateErr instanceof Error ? consolidateErr.message : String(consolidateErr))
      );
    }

    return {
      slug,
      status: result.status,
      chunks: result.chunks,
      untrusted_payload: untrustedPayload,
      source_kind: event.source_kind,
      source_uri: event.source_uri,
      pipeline_queued,
      consolidate_queued,
    };
  };
}
