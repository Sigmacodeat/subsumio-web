import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createEducationEntry,
  computeAnnualStatus,
  FAO_REQUIRED_HOURS,
  type ContinuingEducationEntry,
} from "@/lib/fao-tracking";

export const dynamic = "force-dynamic";

const entrySchema = z.object({
  lawyer_email: z.string().email(),
  lawyer_name: z.string().min(1).max(300),
  specialist_title: z.string().min(1).max(200),
  date: z.string().min(1),
  hours: z.number().min(0).max(24),
  topic: z.string().min(1).max(500),
  provider: z.string().min(1).max(300),
  proof_document_slug: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
});

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: entrySchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "fao_education_entry",
      entityId: body.lawyer_email,
      details: { hours: body.hours, topic: body.topic, title: body.specialist_title },
    }),
  },
  async (ctx, body) => {
    const entry = createEducationEntry(body);
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/fao-entries/${entry.id}`,
        title: `FAO: ${body.lawyer_name} — ${body.topic} (${body.hours}h)`,
        type: "fao_education_entry",
        frontmatter: entry,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ entry });
  }
);

const querySchema = z.object({
  lawyer_email: z.string().email().optional(),
  year: z.coerce.number().optional(),
});

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "fao_education_entry", limit: "500" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let entries: ContinuingEducationEntry[] = (
      Array.isArray(data) ? data : (data.pages ?? [])
    ) as ContinuingEducationEntry[];
    if (query?.lawyer_email) {
      entries = entries.filter((e) => e.lawyer_email === query.lawyer_email);
    }
    const year = query?.year ?? new Date().getFullYear();
    const lawyerEmail = query?.lawyer_email ?? entries[0]?.lawyer_email;
    if (!lawyerEmail) {
      return apiSuccess({ entries, annualStatus: null, requiredHours: FAO_REQUIRED_HOURS });
    }
    const lawyer = entries.find((e) => e.lawyer_email === lawyerEmail);
    const annualStatus = computeAnnualStatus(
      lawyerEmail,
      lawyer?.lawyer_name ?? "",
      lawyer?.specialist_title ?? "",
      entries,
      year
    );
    return apiSuccess({ entries, annualStatus, requiredHours: FAO_REQUIRED_HOURS });
  }
);
