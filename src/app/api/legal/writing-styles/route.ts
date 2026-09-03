import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import {
  listStyles,
  getStyle,
  saveStyle,
  deleteStyle,
  PRESET_STYLES,
  DEFAULT_STYLE,
  applyStyleToPrompt,
  type WritingStyle,
} from "@/lib/legal/writing-styles";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 60,
  },
  async (_ctx, _body, _query, req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const style = getStyle(id);
      if (!style) return Response.json({ error: "style not found" }, { status: 404 });
      return Response.json({ style, prompt_block: applyStyleToPrompt(style) });
    }
    return Response.json({
      styles: listStyles(),
      presets: PRESET_STYLES.map((s) => s.id),
      default: DEFAULT_STYLE.id,
    });
  }
);

const postSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  tone: z.string().max(100).optional(),
  formality: z.string().max(100).optional(),
  sentenceLength: z.string().optional(),
  customInstructions: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: postSchema,
    audit: (_ctx, body) => ({
      action: "legal.writing_style_save" as const,
      entityType: "writing_style",
      entityId: body.id,
      details: {
        name: body.name,
        has_description: Boolean(body.description),
        has_tone: Boolean(body.tone),
        has_formality: Boolean(body.formality),
        has_sentenceLength: Boolean(body.sentenceLength),
        has_customInstructions: Boolean(body.customInstructions),
      },
    }),
  },
  async (_ctx, body) => {
    const style = body as unknown as WritingStyle;
    saveStyle(style);
    return Response.json({ success: true, style, prompt_block: applyStyleToPrompt(style) });
  }
);

export const DELETE = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    audit: (_ctx, _body, _query, req) => ({
      action: "legal.writing_style_delete" as const,
      entityType: "writing_style",
      entityId: req?.nextUrl.searchParams.get("id") ?? "unknown",
      details: {},
    }),
  },
  async (_ctx, _body, _query, req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const deleted = deleteStyle(id);
    if (!deleted) {
      return Response.json(
        { error: "cannot delete preset style or style not found" },
        { status: 400 }
      );
    }
    return Response.json({ success: true });
  }
);
