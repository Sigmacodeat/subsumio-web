import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, recordQuota } from "@/lib/api-handler";
import { enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";

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
      console.error(`[upload/confirm] analysis_status stamp failed for ${docSlug}: ${res.status}`);
    }
  } catch (err) {
    console.error(
      `[upload/confirm] analysis_status stamp error for ${docSlug}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

export const maxDuration = 600;

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    quota: "uploads",
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

    const upstream = await fetch(`${ENGINE_URL}/api/upload/confirm`, {
      method: "POST",
      headers: {
        ...ctx.headers,
        "Content-Type": "application/json",
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
                const result = JSON.parse(data) as { slug?: string; title?: string };
                void recordQuota(ctx, "uploads");
                if (result.slug) {
                  await stampAnalysisPending(ctx.headers, result.slug);
                  await enqueueAllPostUploadTasks({
                    doc_slug: result.slug,
                    case_slug: caseSlug || undefined,
                    brain_id: ctx.brainId,
                    doc_title: result.title,
                    uploaded_at: new Date().toISOString(),
                  });
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
      void recordQuota(ctx, "uploads");

      try {
        const result = JSON.parse(text) as {
          slug?: string;
          title?: string;
          original_persisted?: boolean;
          persist_error?: string;
          extraction_status?: string;
          extraction_method?: string;
          async?: boolean;
        };

        if (result.slug) {
          await stampAnalysisPending(ctx.headers, result.slug);
          await enqueueAllPostUploadTasks({
            doc_slug: result.slug,
            case_slug: caseSlug || undefined,
            brain_id: ctx.brainId,
            doc_title: result.title,
            uploaded_at: new Date().toISOString(),
          });
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
