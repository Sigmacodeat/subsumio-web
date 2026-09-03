import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { executeBatch, type BatchOperation } from "@/lib/legal/batch-edit";

export const maxDuration = 300;

const postSchema = z.object({
  type: z.enum([
    "replace_text",
    "add_tag",
    "remove_tag",
    "update_frontmatter",
    "delete_pages",
    "change_type",
  ]),
  slugs: z.array(z.string().min(1)).min(1).max(100),
  find: z.string().optional(),
  replace: z.string().optional(),
  tag: z.string().optional(),
  frontmatter: z.record(z.unknown()).optional(),
  new_type: z.string().optional(),
  dry_run: z.boolean().optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: postSchema,
    audit: (_ctx, body) => ({
      action: "legal.batch_edit" as const,
      entityType: "page",
      details: {
        type: body.type,
        slug_count: body.slugs.length,
        slugs: body.slugs,
        dry_run: body.dry_run ?? false,
        has_find: Boolean(body.find),
        has_replace: Boolean(body.replace),
        has_tag: Boolean(body.tag),
        has_frontmatter: Boolean(body.frontmatter),
        has_new_type: Boolean(body.new_type),
      },
    }),
  },
  async (ctx, body) => {
    const result = await executeBatch(body as unknown as BatchOperation, ctx.headers);
    return Response.json(result);
  }
);
