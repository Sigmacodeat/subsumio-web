import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

const VALID_JURISDICTIONS = ["de", "at", "ch", "eu"] as const;
const VALID_TYPES = ["synthetic", "open_access"] as const;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: z.object({
      jurisdiction: z.enum(VALID_JURISDICTIONS).optional(),
      statuteAbbr: z.string().optional(),
      sectionNum: z.string().optional(),
      commentaryType: z.enum(VALID_TYPES).optional(),
      search: z.string().optional(),
      limit: z.coerce.number().min(1).max(200).default(50),
      offset: z.coerce.number().min(0).default(0),
    }),
  },
  async (_ctx, _body, query, _req) => {
    const params = new URLSearchParams();
    params.set("limit", String(query?.limit ?? 50));
    params.set("offset", String(query?.offset ?? 0));
    if (query?.jurisdiction) params.set("jurisdiction", query.jurisdiction);
    if (query?.statuteAbbr) params.set("statute_abbr", query.statuteAbbr);
    if (query?.sectionNum) params.set("section_num", query.sectionNum);
    if (query?.commentaryType) params.set("commentary_type", query.commentaryType);
    if (query?.search) params.set("search", query.search);

    const res = await fetch(`${ENGINE_URL}/api/legal/commentaries?${params}`, {
      headers: _ctx.headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError("engine_error", `Failed to fetch commentaries: ${text.slice(0, 200)}`, 502);
    }

    const data = await res.json();
    return Response.json(data);
  }
);

const triggerSchema = z.object({
  statuteAbbr: z.string().min(1),
  sectionNum: z.string().min(1),
  jurisdiction: z.enum(VALID_JURISDICTIONS).default("de"),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: triggerSchema,
    audit: (ctx) => ({
      action: "legal.commentary_synthesize" as const,
      entityType: "legal_commentary",
      details: { by: ctx.user.email, action: "trigger_synthesis" },
    }),
  },
  async (ctx, body, _query, _req) => {
    const res = await fetch(`${ENGINE_URL}/api/legal/commentaries/synthesize`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        statute_abbr: body.statuteAbbr,
        section_num: body.sectionNum,
        jurisdiction: body.jurisdiction,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError(
        "engine_error",
        `Failed to trigger commentary synthesis: ${text.slice(0, 200)}`,
        502
      );
    }

    const result = await res.json();
    return Response.json(result, { status: 201 });
  }
);
