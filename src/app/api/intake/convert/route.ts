import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { intakeFromPage } from "@/lib/intake";
import { buildCaseFromIntake } from "@/lib/intake-conversion";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import type { BrainPage } from "@/lib/types";

export const dynamic = "force-dynamic";

const convertSchema = z.object({
  slug: z.string().min(1, "slug_required"),
  case_slug: z.string().optional(),
  case_number: z.string().max(100).optional(),
  title: z.string().max(300).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  portal_enabled: z.boolean().default(false),
});

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: convertSchema,
    audit: (ctx, body) => ({
      action: "case.create" as const,
      entityType: "intake_request",
      entityId: body.slug,
      details: { converted_by: ctx.user.email, case_slug: body.case_slug },
    }),
  },
  async (ctx, body) => {
    const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(body.slug)}`, {
      headers: ctx.headers,
    signal: AbortSignal.timeout(10_000),
    });
    if (!getRes.ok) return apiError("intake_not_found", "Intake konnte nicht geladen werden", 404);

    const intakePage = intakeFromPage(await getRes.json() as BrainPage);
    if (!intakePage) return apiError("not_intake_request", "Die Seite ist kein Intake", 400);

    const casePage = buildCaseFromIntake(intakePage, {
      caseSlug: body.case_slug,
      caseNumber: body.case_number,
      title: body.title,
      priority: body.priority,
      portalEnabled: body.portal_enabled,
      convertedBy: ctx.user.email,
    });

    const createRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(casePage),
    signal: AbortSignal.timeout(15_000),
    });
    if (!createRes.ok) {
      const message = await createRes.text().catch(() => "");
      return apiError("case_create_failed", message || "Akte konnte nicht erstellt werden", 502);
    }

    const now = new Date().toISOString();
    const updateRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: body.slug,
        title: intakePage.title,
        type: "intake_request",
        merge: true,
        frontmatter: {
          status: "converted",
          converted_case_slug: casePage.slug,
          updated_at: now,
        },
      signal: AbortSignal.timeout(15_000),
      }),
    });
    if (!updateRes.ok) return apiError("intake_update_failed", "Akte erstellt, Intake aber nicht aktualisiert", 502);

    broadcastSseEvent(ctx.brainId, "case.created", { slug: casePage.slug, intakeSlug: body.slug, by: ctx.user.email });
    broadcastSseEvent(ctx.brainId, "intake.updated", { slug: body.slug, convertedCaseSlug: casePage.slug, by: ctx.user.email });

    return Response.json({ ok: true, case: casePage, intake_slug: body.slug });
  },
);
