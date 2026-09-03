import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { actImportSessionSlug, computeActImportMetrics, safeImportId } from "@/lib/act-import";
import { fetchAllActImportItems, fetchEnginePage } from "@/lib/act-import-server";

const schema = z.object({
  allow_partial: z.boolean().default(false),
  max_cost_usd: z.number().positive().max(500).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: schema,
    audit: (_ctx, body) => ({
      action: "act_import.finalize" as const,
      entityType: "act_import_session",
      details: {
        allow_partial: body.allow_partial,
        max_cost_usd: body.max_cost_usd,
      },
    }),
  },
  async (ctx, body, _query, req) => {
    const { id: rawId } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const id = safeImportId(rawId);
    const session = await fetchEnginePage(ctx.headers, actImportSessionSlug(id));
    if (!session) return apiError("import_not_found", "Aktenimport nicht gefunden", 404);
    const items = await fetchAllActImportItems(ctx.headers, id);
    const metrics = computeActImportMetrics(items);
    if (metrics.failed > 0 || metrics.pending > 0 || metrics.processing > 0) {
      return apiError(
        "import_not_ready",
        "Offene oder fehlgeschlagene Dokumente müssen zuerst bearbeitet werden",
        409
      );
    }
    if (!body.allow_partial && (metrics.partial > 0 || metrics.review > 0)) {
      return apiError(
        "review_required",
        "Partielle oder reviewpflichtige Dokumente müssen ausdrücklich freigegeben werden",
        409
      );
    }
    const sfm = (session.frontmatter ?? {}) as Record<string, unknown>;
    const currentStatus = String(sfm.status ?? "");
    if (currentStatus === "analyzing") {
      return apiError("already_analyzing", "Für diese Session läuft bereits eine Pipeline.", 409, {
        snapshot_id: sfm.snapshot_id,
        pipeline_job_id: sfm.pipeline_job_id,
      });
    }
    const caseSlug = String(sfm.case_slug ?? "");
    if (!caseSlug) return apiError("case_missing", "Import besitzt keine Aktenzuordnung", 409);
    const snapshotId = `${id}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const partSlugs = [
      ...new Set(
        items.flatMap((i) =>
          i.partSlugs?.length ? i.partSlugs : i.documentSlug ? [i.documentSlug] : []
        )
      ),
    ];
    if (partSlugs.length === 0)
      return apiError("no_documents", "Keine analysierbaren Dokumente", 409);
    const snapshotSlug = `act-snapshots/${snapshotId}`;
    const snapshot = {
      id: snapshotId,
      import_session_id: id,
      case_slug: caseSlug,
      created_at: new Date().toISOString(),
      metrics,
      document_slugs: partSlugs,
      manifest: items.map((i) => ({
        id: i.id,
        relative_path: i.relativePath,
        sha256: i.sha256,
        document_slug: i.documentSlug,
        part_slugs: i.partSlugs,
        status: i.status,
      })),
    };
    const write = await enginePatchPage(ctx.headers, {
      slug: snapshotSlug,
      title: `Akten-Snapshot ${snapshotId}`,
      type: "act_snapshot",
      content: JSON.stringify(snapshot, null, 2),
      frontmatter: {
        snapshot_id: snapshotId,
        import_session_id: id,
        case_slug: caseSlug,
        metrics,
        created_at: snapshot.created_at,
      },
    });
    if (!write.ok) return apiError("snapshot_write_failed", await write.text(), 502);
    const trigger = await fetch(`${ENGINE_URL}/api/legal-pipeline/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        case_slug: caseSlug,
        part_slugs: partSlugs,
        jurisdiction: sfm.jurisdiction ?? "at",
        verfahrenstyp: sfm.verfahrenstyp ?? "sonstiges",
        snapshot_id: snapshotId,
        import_session_id: id,
        // Billing context: owner_id is org_id if user has org, else user.id.
        owner_id: ctx.user.orgId ?? ctx.user.id,
        owner_type: ctx.user.orgId ? "org" : "user",
        user_id: ctx.user.id,
        ...(body.max_cost_usd ? { max_cost_usd: body.max_cost_usd } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!trigger.ok) return apiError("pipeline_trigger_failed", await trigger.text(), 502);
    const job = (await trigger.json()) as { job_id?: string | number };
    await enginePatchPage(ctx.headers, {
      slug: actImportSessionSlug(id),
      frontmatter: {
        status: "analyzing",
        snapshot_id: snapshotId,
        snapshot_slug: snapshotSlug,
        pipeline_job_id: String(job.job_id ?? ""),
        metrics,
        updated_at: new Date().toISOString(),
      },
    });
    await enginePatchPage(ctx.headers, {
      slug: caseSlug,
      frontmatter: {
        active_snapshot_id: snapshotId,
        active_import_session_id: id,
        document_count: metrics.total,
        pipeline_status: "running",
      },
    });
    return Response.json({
      ok: true,
      snapshot_id: snapshotId,
      snapshot_slug: snapshotSlug,
      pipeline_job_id: job.job_id,
      metrics,
    });
  }
);
