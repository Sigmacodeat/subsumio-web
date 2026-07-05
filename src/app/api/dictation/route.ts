import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createDictationEntry,
  getPendingCorrections,
  formatDictationDuration,
  type DictationEntry,
} from "@/lib/dictation";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  case_slug: z.string().max(300).optional(),
  lawyer_email: z.string().email(),
  lawyer_name: z.string().min(1).max(300),
  duration_seconds: z.number().min(0),
  language: z.string().max(20).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "dictation_entry",
      entityId: body.lawyer_email,
      details: { duration: body.duration_seconds, caseSlug: body.case_slug },
    }),
  },
  async (ctx, body) => {
    const entry = createDictationEntry(body);
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/dictations/${entry.id}`,
        title: `Diktat: ${body.lawyer_name} (${formatDictationDuration(body.duration_seconds)})`,
        type: "dictation_entry",
        frontmatter: entry,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ entry });
  }
);

const querySchema = z.object({
  case_slug: z.string().max(300).optional(),
  status: z.enum(["recording", "transcribed", "corrected", "filed", "failed"]).optional(),
  pending_corrections: z.boolean().optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "dictation_entry", limit: "500" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let items: DictationEntry[] = (
      Array.isArray(data) ? data : (data.pages ?? [])
    ) as DictationEntry[];
    if (query?.case_slug) {
      items = items.filter((e) => e.case_slug === query.case_slug);
    }
    if (query?.status) {
      items = items.filter((e) => e.status === query.status);
    }
    if (query?.pending_corrections) {
      items = getPendingCorrections(items);
    }
    return apiSuccess({ items });
  }
);
