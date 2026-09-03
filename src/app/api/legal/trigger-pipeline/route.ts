import { z } from "zod";
import { ENGINE_URL, engineHeaders, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const maxDuration = 30;

const triggerSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  part_slugs: z.array(z.string()).optional(),
  jurisdiction: z.enum(["at", "de", "ch", "eu"]).optional(),
  as_of_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  resume_from_layer: z.number().int().min(1).max(6).optional(),
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
    body: triggerSchema,
    audit: (_ctx, body) => ({
      action: "legal.pipeline_trigger" as const,
      entityType: "pipeline",
      details: {
        case_slug: body.case_slug,
        jurisdiction: body.jurisdiction,
        resume_from_layer: body.resume_from_layer,
        part_count: body.part_slugs?.length ?? 0,
      },
    }),
  },
  async (ctx, body) => {
    const headers = await engineHeaders();
    if (!headers) return apiError("unauthorized", "Nicht authentifiziert", 401);

    try {
      // The case page is also the authoritative intake context for explicit
      // jurisdiction. The pipeline no longer assumes AT when it is absent.
      const casePath = body.case_slug.split("/").map(encodeURIComponent).join("/");
      const casePageRes = await fetch(`${ENGINE_URL}/api/pages/${casePath}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!casePageRes.ok) {
        return apiError("case_not_found", "Akte nicht gefunden", 404);
      }
      const casePage = await casePageRes.json();
      const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;

      // If part_slugs not provided, fetch case documents
      let partSlugs = body.part_slugs ?? [];
      if (partSlugs.length === 0 && !body.resume_from_layer) {
        const documents = (fm.documents as Array<Record<string, unknown>>) ?? [];
        partSlugs = documents.map((d) => String(d.slug ?? "")).filter(Boolean);
      }

      if (partSlugs.length === 0 && !body.resume_from_layer) {
        return apiError(
          "no_documents",
          "Diese Akte hat keine verknüpften Dokumente für die Pipeline.",
          400
        );
      }

      // Call the engine's legal-pipeline trigger endpoint.
      // The engine exposes POST /api/legal-pipeline/trigger which internally
      // calls MinionQueue.add("legal-pipeline", ...) — MinionQueue is not
      // exposed via HTTP, so we must use this dedicated endpoint.
      const triggerPayload: Record<string, unknown> = {
        case_slug: body.case_slug,
        part_slugs: partSlugs,
        // Billing context: owner_id is org_id if user has org, else user.id.
        // user_id is always the individual user (for saas_usage_ledger).
        owner_id: ctx.user.orgId ?? ctx.user.id,
        owner_type: ctx.user.orgId ? "org" : "user",
        user_id: ctx.user.id,
      };

      const jurisdictionCandidate = String(
        body.jurisdiction ?? fm.jurisdiction ?? ""
      ).toLowerCase();
      if (!["at", "de", "ch", "eu"].includes(jurisdictionCandidate)) {
        return apiError(
          "jurisdiction_required",
          "Die Jurisdiktion der Akte muss vor dem Pipeline-Start bestätigt werden.",
          400
        );
      }
      triggerPayload.jurisdiction = jurisdictionCandidate;
      triggerPayload.as_of_date =
        body.as_of_date ??
        (typeof fm.as_of_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fm.as_of_date)
          ? fm.as_of_date
          : new Date().toISOString().slice(0, 10));

      if (body.resume_from_layer) {
        triggerPayload.resume_from_layer = body.resume_from_layer;
      }
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
        return apiError("trigger_failed", `Pipeline-Trigger fehlgeschlagen: ${detail}`, 502);
      }

      const triggerResult = (await triggerRes.json().catch(() => ({}))) as {
        job_id?: number | string;
        success?: boolean;
      };

      // Update case frontmatter to indicate pipeline has been triggered
      await enginePatchPage(headers, {
        slug: body.case_slug,
        frontmatter: {
          pipeline_status: body.resume_from_layer ? "resuming" : "running",
          pipeline_triggered_at: new Date().toISOString(),
        },
      });

      return Response.json({
        ok: true,
        job_id: triggerResult.job_id ?? "unknown",
        status: "queued",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[trigger-pipeline] error:", msg);
      return apiError("internal_error", `Pipeline-Trigger fehlgeschlagen: ${msg}`, 500);
    }
  }
);
