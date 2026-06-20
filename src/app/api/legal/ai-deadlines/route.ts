
import { z } from "zod";
import { ENGINE_URL, recordQuota } from "@/lib/engine";
import { detectDeadlines, resolveRelativeDeadline } from "@/lib/ai-deadline-detect";
import { createHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

const aiDeadlinesSchema = z.object({
  text: z.string().min(1, "text_required").max(50_000, "text_too_long"),
  caseSlug: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: aiDeadlinesSchema,
    audit: (_ctx, body) => ({
      action: "legal.ai_deadlines" as const,
      entityType: "deadline",
      details: { caseSlug: body.caseSlug, textLength: body.text.length },
    }),
  },
  async (ctx, body, _query, _req) => {
    const detected = detectDeadlines(body.text);

    const createdSlugs: string[] = [];
    if (body.caseSlug) {
      for (const d of detected) {
        if (d.confidence === "high" && (d.date || d.daysFromNow)) {
          try {
            const dueDate = d.date || resolveRelativeDeadline(d.daysFromNow!);
            const slug = `legal/deadline/${Date.now()}-${createdSlugs.length}`;
            await fetch(`${ENGINE_URL}/api/pages`, {
              method: "POST",
              headers: { ...ctx.headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                slug,
                title: d.description,
                type: "deadline",
                content: `Erkannt aus Text:\n${d.sourceSnippet}\n\nKonfidenz: ${d.confidence}`,
                frontmatter: {
                  type: "deadline",
                  case_slug: body.caseSlug,
                  due_date: dueDate,
                  status: "pending",
                  source: "ai_detected",
                  matched_rule: d.matchedRule,
                  ai_confidence: d.confidence,
                },
              }),
            });
            createdSlugs.push(slug);
          } catch {
            // Einzelne Fehler nicht abbrechen
          }
        }
      }
    }
    if (createdSlugs.length > 0) {
      void recordQuota(ctx, "pages", createdSlugs.length);
    }

    return Response.json({
      detected,
      created: createdSlugs.length > 0 ? createdSlugs : undefined,
    });
  },
);
