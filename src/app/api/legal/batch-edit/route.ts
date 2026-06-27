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
  },
  async (ctx, body) => {
    const result = await executeBatch(body as unknown as BatchOperation, ctx.headers);
    return Response.json(result);
  }
);
