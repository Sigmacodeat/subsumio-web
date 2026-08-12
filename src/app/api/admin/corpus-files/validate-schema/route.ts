import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { validateFrontmatter, listSchemas, getSchema } from "@/lib/corpus-schema";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  docClass: z.string().optional(),
});

const bodySchema = z.object({
  frontmatter: z.record(z.unknown()),
  docClass: z.string().optional(),
});

/**
 * GET /api/admin/corpus-files/validate-schema?docClass=statute
 * → Listet alle Schemas oder gibt ein spezifisches Schema zurück.
 *
 * POST /api/admin/corpus-files/validate-schema
 * → Validiert Frontmatter gegen das Schema.
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    if (query.docClass) {
      const schema = getSchema(query.docClass);
      return apiSuccess({ schema });
    }
    return apiSuccess({ schemas: listSchemas() });
  },
);

export const POST = createHandler(
  {
    action: "admin.*",
    body: bodySchema,
  },
  async (ctx, body) => {
    const result = validateFrontmatter(body.frontmatter, body.docClass);
    return apiSuccess(result);
  },
);
