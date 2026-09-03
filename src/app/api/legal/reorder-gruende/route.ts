import { z } from "zod";
import { enginePatchPage } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";

const reorderSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  gruende_order: z.array(z.string().min(1)).min(1, "gruende_order_required"),
});

export const POST = createHandler(
  {
    action: "legal.reorder_gruende",
    rateTier: "standard",
    body: reorderSchema,
    audit: (_ctx, body) => ({
      action: "legal.reorder_gruende" as const,
      entityType: "case",
      entityId: body.case_slug,
      details: {
        case_slug: body.case_slug,
        count: body.gruende_order.length,
      },
    }),
  },
  async (ctx, body) => {
    // Persist the new order as a frontmatter key on the case page.
    // The gruende themselves are already stored in frontmatter.berufungsgruende;
    // we store the order separately as an array of IDs so the client can
    // re-sort the gruende array on reload.
    try {
      await enginePatchPage(ctx.headers, {
        slug: body.case_slug,
        frontmatter: {
          berufungsgruende_order: body.gruende_order,
          berufungsgruende_reordered_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      return Response.json(
        {
          error: "persist_failed",
          message: err instanceof Error ? err.message : "Failed to persist reorder",
        },
        { status: 503 }
      );
    }

    return Response.json({ success: true, order: body.gruende_order });
  }
);
