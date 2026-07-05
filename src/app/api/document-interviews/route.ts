import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { createInterview, type InterviewDefinition } from "@/lib/document-interviews";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  template_slug: z.string().min(1).max(300),
  title: z.string().min(1).max(300),
  description: z.string().max(2000),
  questions: z.array(
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
  ),
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
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/interviews/${interview.id}`,
        title: `Interview: ${body.title}`,
        type: "interview_definition",
        frontmatter: interview,
      }),
      signal: AbortSignal.timeout(10_000),
    });
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
    const params = new URLSearchParams({ type: "interview_definition", limit: "200" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let items: InterviewDefinition[] = (
      Array.isArray(data) ? data : (data.pages ?? [])
    ) as InterviewDefinition[];
    if (query?.template_slug) {
      items = items.filter((i) => i.template_slug === query.template_slug);
    }
    return apiSuccess({ items });
  }
);
