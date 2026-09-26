import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { createInterview, type InterviewDefinition } from "@/lib/document-interviews";
import { engineWriteOrThrow } from "@/lib/engine-write";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  template_slug: z.string().min(1).max(300),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).default(""),
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        type: z.enum([
          "text",
          "textarea",
          "date",
          "number",
          "select",
          "multiselect",
          "boolean",
          "party",
        ]),
        label: z.string().min(1).max(500),
        help_text: z.string().max(1000).optional(),
        required: z.boolean(),
        placeholder: z.string().max(300).optional(),
        options: z.array(z.string()).optional(),
        default_value: z.union([z.string(), z.number(), z.boolean()]).optional(),
        variable: z.string().min(1).max(100),
      })
    )
    .max(200)
    .default([]),
  output_format: z.enum(["docx", "pdf", "markdown"]).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "interview_definition",
      entityId: body.template_slug,
      details: { title: body.title, questionCount: body.questions.length },
    }),
  },
  async (ctx, body) => {
    const interview = createInterview({
      template_slug: body.template_slug,
      title: body.title,
      description: body.description,
      questions: body.questions,
      output_format: body.output_format,
    });
    await engineWriteOrThrow(
      `${ENGINE_URL}/api/pages`,
      {
        method: "POST",
        headers: { ...ctx.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: `legal/interviews/${interview.id}`,
          title: `Interview: ${body.title}`,
          type: "interview_definition",
          frontmatter: interview,
        }),
        signal: AbortSignal.timeout(10_000),
      },
      "Interview"
    );
    return apiSuccess({ interview });
  }
);

const querySchema = z.object({
  template_slug: z.string().max(300).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    // Pages carry the definition in their frontmatter.
    let pages: Awaited<ReturnType<typeof listEnginePages>>;
    try {
      pages = await listEnginePages(ctx.headers, "interview_definition", 5_000, { strict: true });
    } catch {
      return apiError("engine_error", "Interviews konnten nicht geladen werden", 502);
    }
    let items = pages
      .map((p) => p.frontmatter as unknown as InterviewDefinition | undefined)
      .filter((i): i is InterviewDefinition => !!i && typeof i.id === "string");
    if (query?.template_slug) {
      items = items.filter((i) => i.template_slug === query.template_slug);
    }
    return apiSuccess({ items });
  }
);
