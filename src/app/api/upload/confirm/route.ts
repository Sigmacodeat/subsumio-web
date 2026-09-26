import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";
import { reconcileCaseDocuments } from "@/lib/case-documents";
import { stampInboundEntryBestEffort } from "@/lib/inbound-register-stamp";
import {
  GUARD_READ_FAILED,
  isArchivedCase,
  readCurrentPage,
  rejectionResponse,
} from "@/lib/page-write-guards";

import { logger } from "@/lib/logger";
const log = logger("api/upload/confirm");

/**
 * Stamp analysis_status=pending on the freshly-confirmed document BEFORE (or
 * alongside) enqueueing its analysis task. This makes the document visible to
 * the upload-reconcile sweeper even if this request's enqueue never completes
 * (e.g. the client disconnects mid-SSE). Best-effort — a failed stamp is logged
 * but never fails the upload.
 */
async function stampAnalysisPending(
  headers: Record<string, string>,
  docSlug: string
): Promise<void> {
  try {
    const res = await enginePatchPage(headers, {
      slug: docSlug,
      frontmatter: {
        analysis_status: "pending",
        analysis_queued_at: new Date().toISOString(),
      },
    });
    if (!res.ok) {
      log.error(`[upload/confirm] analysis_status stamp failed for ${docSlug}: ${res.status}`);
    }
  } catch (err) {
    log.error(
      `[upload/confirm] analysis_status stamp error for ${docSlug}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

interface ConfirmResult {
  slug?: string;
  title?: string;
  case_slug?: unknown;
  /** Set by the engine when the upload belongs to a bulk import (never from the browser). */
  pipeline_deferred?: unknown;
}

/**
 * Side effects of a confirmed upload. A deferred upload (bulk matter import)
 * is marked "deferred" and gets no per-document analysis — the import's
 * single case-level pipeline analyses it; queuing it here as well would book
 * and run the analysis once per file on top of that.
 */
async function afterConfirm(
  headers: Record<string, string>,
  brainId: string,
  slug: string,
  result: ConfirmResult,
  billing: { ownerId: string; ownerType: "user" | "org" },
  receivedBy: string
): Promise<void> {
  const caseSlug = resultCaseSlug(result);
  // Same as the form upload: the document is on the matter's list at once
  // (the outbox reconcile only retries), and every upload is an inbound
  // record with its receipt date.
  if (caseSlug) {
    try {
      await reconcileCaseDocuments(headers, caseSlug, {
        id: slug,
        slug,
        name: result.title ?? slug.split("/").pop() ?? slug,
        url: slug,
        uploadedAt: new Date().toISOString(),
        size: 0,
        kind: "document",
      });
    } catch (err) {
      log.error(
        `[upload/confirm] case reconciliation failed for ${slug} (outbox retries):`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
  await stampInboundEntryBestEffort(
    headers,
    {
      channel: "upload",
      subject: result.title ?? slug.split("/").pop() ?? slug,
      caseSlug,
      documentSlug: slug,
      receivedBy,
    },
    brainId
  );

  if (result.pipeline_deferred === true) {
    try {
      const res = await enginePatchPage(headers, {
        slug,
        frontmatter: { analysis_status: "deferred", pipeline_deferred: true },
      });
      if (!res.ok) log.error(`[upload/confirm] deferred stamp failed for ${slug}: ${res.status}`);
    } catch (err) {
      log.error(
        `[upload/confirm] deferred stamp error for ${slug}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
    return;
  }
  await stampAnalysisPending(headers, slug);
  await enqueueAllPostUploadTasks({
    doc_slug: slug,
    case_slug: resultCaseSlug(result),
    brain_id: brainId,
    doc_title: result.title,
    uploaded_at: new Date().toISOString(),
    owner_id: billing.ownerId,
    owner_type: billing.ownerType,
  });
}

export const maxDuration = 600;

/**
 * The confirm body. The matter a document is filed into is the one bound to
 * the upload at token/presign time (the engine keeps it with the pending
 * upload and echoes it as `case_slug`); the body's `case_slug` only serves
 * the archived-matter pre-check.
 */
const confirmSchema = z
  .object({
    upload_token: z.string().min(1).max(512),
    source: z.string().max(50).optional(),
    case_slug: z.string().max(1000).optional(),
    expected_sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  })
  .passthrough();

/** Matter from the engine's confirm result — never from the browser. */
function resultCaseSlug(result: { case_slug?: unknown }): string | undefined {
  return typeof result.case_slug === "string" && result.case_slug ? result.case_slug : undefined;
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    // The upload unit was booked when the upload token was issued
    // (/api/upload-token); confirming the same file books nothing again.
    body: confirmSchema,
    audit: (ctx, _body) => ({
      action: "document.confirm" as const,
      entityType: "document",
      details: { userId: ctx.user.id },
    }),
  },
  async (ctx, body, _query, req) => {
    // Forward the client's Accept header so the engine knows if SSE is wanted
    const clientAccept = req.headers.get("accept") ?? "";
    const wantsSse = clientAccept.includes("text/event-stream");
    const bodyRec = (body ?? {}) as Record<string, unknown>;
    const caseSlug = typeof bodyRec.case_slug === "string" ? bodyRec.case_slug : "";

    // An archived matter is closed: nothing is filed into it any more.
    // Fail closed when the matter cannot be read.
    if (caseSlug) {
      const caseRead = await readCurrentPage(ENGINE_URL, ctx.headers, caseSlug);
      if (caseRead.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
      if (isArchivedCase(caseRead.kind === "found" ? caseRead.page : null)) {
        return Response.json(
          {
            error: "case_archived",
            message: "Die Akte ist archiviert — zuerst wiederherstellen, um Dokumente abzulegen.",
          },
          { status: 409 }
        );
      }
    }

    const upstream = await fetch(`${ENGINE_URL}/api/upload/confirm`, {
      method: "POST",
      headers: {
        ...ctx.headers,
        "Content-Type": "application/json",
        // Trusted engine-to-web boundary: the engine receives these only via
        // this authenticated server-side proxy, never from browser input.
        "x-subsumio-owner-id": ctx.billing.ownerId,
        "x-subsumio-owner-type": ctx.billing.ownerType,
        "x-subsumio-user-id": ctx.user.id,
        ...(wantsSse ? { Accept: "text/event-stream" } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(540_000),
    });

    const contentType = upstream.headers.get("content-type") ?? "";

    // SSE pass-through: stream the response body back, intercepting events
    // to fire side effects (quota, post-upload tasks) without buffering
    if (contentType.includes("text/event-stream") && upstream.body) {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let sideEffectsFired = false;

      const stream = new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }

          // Pass the chunk through to the client immediately
          controller.enqueue(value);

          // Scan for SSE events to fire side effects
          if (sideEffectsFired) return;
          sseBuffer += decoder.decode(value, { stream: true });
          const events = sseBuffer.split("\n\n");
          sseBuffer = events.pop() ?? "";

          for (const block of events) {
            const lines = block.split("\n");
            let eventType = "";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              else if (line.startsWith("data: ")) data = line.slice(6);
            }
            if (eventType === "done" && data) {
              sideEffectsFired = true;
              try {
                const result = JSON.parse(data) as ConfirmResult;
                if (result.slug) {
                  await afterConfirm(
                    ctx.headers,
                    ctx.brainId,
                    result.slug,
                    result,
                    ctx.billing,
                    ctx.user.name || ctx.user.email
                  );
                }
              } catch {
                /* best-effort */
              }
            }
          }
        },
        cancel() {
          reader.cancel();
        },
      });

      return new Response(stream, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Plain JSON path (non-SSE): buffer, parse, enqueue post-upload tasks
    const text = await upstream.text();
    if (upstream.ok) {
      try {
        const result = JSON.parse(text) as {
          slug?: string;
          title?: string;
          original_persisted?: boolean;
          persist_error?: string;
          extraction_status?: string;
          extraction_method?: string;
          async?: boolean;
          case_slug?: unknown;
          pipeline_deferred?: unknown;
        };

        if (result.slug) {
          await afterConfirm(
            ctx.headers,
            ctx.brainId,
            result.slug,
            result,
            ctx.billing,
            ctx.user.name || ctx.user.email
          );
        }

        return Response.json(result, { status: upstream.status });
      } catch {
        // Non-JSON or parse error — pass through
      }
    }

    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }
);
