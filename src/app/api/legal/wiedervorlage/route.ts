import { z } from "zod";
import { ENGINE_URL, engineHeaders, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const maxDuration = 30;

const schema = z.object({
  case_slug: z.string().min(1),
  verjaehrung_score: z.number().min(0).max(100),
  urgent_ansprueche: z.array(z.object({
    anspruch: z.string(),
    restzeit_tage: z.number(),
    paragraph: z.string().optional(),
    handlungsbedarf: z.string().optional(),
  })).min(1),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: schema,
  },
  async (ctx, body) => {
    const headers = await engineHeaders();
    if (!headers) return apiError("unauthorized", "Nicht authentifiziert", 401);

    const now = new Date();
    const results: Array<{ slug: string; status: string; due_date: string }> = [];

    for (const anspruch of body.urgent_ansprueche) {
      const days = Math.max(1, Math.ceil(anspruch.restzeit_tage));
      const dueDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const dueIso = dueDate.toISOString().split("T")[0]!;

      const slug = `deadlines/wiedervorlage-${body.case_slug}-${anspruch.anspruch}`.replace(/[^a-z0-9/-]/gi, "-").toLowerCase();

      const frontmatter: Record<string, unknown> = {
        type: "deadline",
        case_ref: body.case_slug,
        deadline_type: "wiedervorlage",
        title: `Wiedervorlage: ${anspruch.anspruch} — ${body.case_slug}`,
        due_date: dueIso,
        status: days <= 7 ? "critical" : days <= 30 ? "warning" : "pending",
        priority: "high",
        description: `Verjährung droht in ${days} Tagen. ${anspruch.handlungsbedarf ?? ""}`,
        law: anspruch.paragraph ?? "",
        verjaehrung_score: body.verjaehrung_score,
        auto_generated: true,
        created_at: now.toISOString(),
      };

      try {
        const pageRes = await fetch(`${ENGINE_URL}/api/pages/${slug.split("/").map(encodeURIComponent).join("/")}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            type: "deadline",
            title: frontmatter.title as string,
            compiled_truth: `## Wiedervorlage\n\n**Akte:** ${body.case_slug}\n**Anspruch:** ${anspruch.anspruch}\n**Restzeit:** ${days} Tage\n**§:** ${anspruch.paragraph ?? ""}\n**Handlungsbedarf:** ${anspruch.handlungsbedarf ?? ""}\n\n> ⚠️ Verjährung droht — sofortige Maßnahme erforderlich!`,
            frontmatter,
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (pageRes.ok) {
          results.push({ slug, status: "created", due_date: dueIso });
        } else {
          results.push({ slug, status: `error: HTTP ${pageRes.status}`, due_date: dueIso });
        }
      } catch (err) {
        results.push({
          slug,
          status: `error: ${err instanceof Error ? err.message : "unknown"}`,
          due_date: dueIso,
        });
      }
    }

    // Also update case frontmatter to flag wiedervorlage
    await enginePatchPage(headers, {
      slug: body.case_slug,
      frontmatter: {
        wiedervorlage_urgent: true,
        wiedervorlage_count: body.urgent_ansprueche.length,
        wiedervorlage_created_at: now.toISOString(),
      },
    });

    const succeeded = results.filter((r) => r.status === "created").length;
    const failed = results.length - succeeded;

    return Response.json({
      ok: true,
      total: results.length,
      succeeded,
      failed,
      results,
    });
  }
);
