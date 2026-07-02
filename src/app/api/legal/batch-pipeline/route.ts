import { z } from "zod";
import { ENGINE_URL, engineHeaders, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const maxDuration = 60;

const batchSchema = z.object({
  case_slugs: z.array(z.string().min(1)).min(1).max(50),
  parallel: z.boolean().optional().default(false),
  manual_overrides: z
    .object({
      client: z.string().optional(),
      opponent: z.string().optional(),
      focus: z.string().optional(),
    })
    .optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: batchSchema,
  },
  async (ctx, body) => {
    const headers = await engineHeaders();
    if (!headers) return apiError("unauthorized", "Nicht authentifiziert", 401);

    const results: Array<{
      case_slug: string;
      status: "queued" | "error";
      job_id?: string;
      error?: string;
    }> = [];

    const concurrency = body.parallel ? 5 : 1;

    // Process in chunks to control concurrency
    for (let i = 0; i < body.case_slugs.length; i += concurrency) {
      const chunk = body.case_slugs.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(async (caseSlug) => {
          try {
            // Fetch case documents
            const casePath = caseSlug.split("/").map(encodeURIComponent).join("/");
            const casePageRes = await fetch(`${ENGINE_URL}/api/pages/${casePath}`, {
              headers,
              signal: AbortSignal.timeout(15_000),
            });

            if (!casePageRes.ok) {
              return {
                case_slug: caseSlug,
                status: "error" as const,
                error: "Akte nicht gefunden",
              };
            }

            const casePage = await casePageRes.json();
            const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
            const documents = (fm.documents as Array<Record<string, unknown>>) ?? [];
            const partSlugs = documents.map((d) => String(d.slug ?? "")).filter(Boolean);

            if (partSlugs.length === 0) {
              return {
                case_slug: caseSlug,
                status: "error" as const,
                error: "Keine Dokumente verknüpft",
              };
            }

            const triggerPayload: Record<string, unknown> = {
              case_slug: caseSlug,
              part_slugs: partSlugs,
            };

            if (body.manual_overrides) {
              triggerPayload.manual_overrides = body.manual_overrides;
            }

            const triggerRes = await fetch(`${ENGINE_URL}/api/legal-pipeline/trigger`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify(triggerPayload),
              signal: AbortSignal.timeout(30_000),
            });

            if (!triggerRes.ok) {
              const detail = await triggerRes.text().catch(() => "");
              return {
                case_slug: caseSlug,
                status: "error" as const,
                error: `Trigger fehlgeschlagen: ${detail.substring(0, 200)}`,
              };
            }

            const triggerResult = (await triggerRes.json().catch(() => ({}))) as {
              job_id?: number | string;
            };

            // Update case frontmatter
            await enginePatchPage(headers, {
              slug: caseSlug,
              frontmatter: {
                pipeline_status: "running",
                pipeline_triggered_at: new Date().toISOString(),
              },
            });

            return {
              case_slug: caseSlug,
              status: "queued" as const,
              job_id: String(triggerResult.job_id ?? "unknown"),
            };
          } catch (err) {
            return {
              case_slug: caseSlug,
              status: "error" as const,
              error: err instanceof Error ? err.message : "Unbekannter Fehler",
            };
          }
        })
      );
      results.push(...chunkResults);
    }

    const succeeded = results.filter((r) => r.status === "queued").length;
    const failed = results.filter((r) => r.status === "error").length;

    return Response.json({
      ok: true,
      total: body.case_slugs.length,
      succeeded,
      failed,
      results,
    });
  }
);
