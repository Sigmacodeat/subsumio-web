import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createQuestionnaire,
  readQuestionnaires,
  QUESTIONNAIRE_FIELD_TYPES,
  type QuestionnaireFieldType,
} from "@/lib/questionnaires";

const fieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_-]+$/i, "Schlüssel nur a-z, 0-9, _-"),
  label: z.string().min(1).max(300),
  type: z.enum(QUESTIONNAIRE_FIELD_TYPES as [string, ...string[]]),
  required: z.boolean().optional(),
  options: z.array(z.string().max(200)).max(50).optional(),
});

const createSchema = z.object({
  case_slug: z.string().min(1).max(300),
  title: z.string().min(1).max(300),
  fields: z.array(fieldSchema).min(1).max(50),
});

/** Fragebogen anlegen — wird dem Akt-Frontmatter als questionnaires[] angehängt. */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (_ctx, body) => ({
      action: "legal.questionnaire_create" as const,
      entityType: "case",
      entityId: body.case_slug,
      details: { title: body.title, fields: body.fields.length },
    }),
  },
  async (ctx, body) => {
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${body.case_slug.split("/").map(encodeURIComponent).join("/")}`,
      { headers: ctx.headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return apiError("case_not_found", "Akte nicht gefunden", 404);
    const page = (await res.json()) as { frontmatter?: Record<string, unknown> };

    const existing = readQuestionnaires(page.frontmatter);
    const questionnaire = createQuestionnaire({
      title: body.title,
      fields: body.fields.map((f) => ({
        ...f,
        type: f.type as QuestionnaireFieldType,
      })),
      createdBy: ctx.user.email || ctx.user.id,
    });

    const write = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: body.case_slug,
        merge: true,
        frontmatter: { questionnaires: [...existing, questionnaire] },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!write.ok) return apiError("engine_write_failed", "Speichern fehlgeschlagen", 502);
    return apiSuccess({ questionnaire });
  }
);

const listSchema = z.object({ case_slug: z.string().min(1).max(300) });

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard", query: listSchema },
  async (ctx, _body, query) => {
    if (!query?.case_slug) return apiError("validation_failed", "case_slug fehlt", 400);
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${query.case_slug.split("/").map(encodeURIComponent).join("/")}`,
      { headers: ctx.headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return apiError("case_not_found", "Akte nicht gefunden", 404);
    const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
    return apiSuccess({ questionnaires: readQuestionnaires(page.frontmatter) });
  }
);
