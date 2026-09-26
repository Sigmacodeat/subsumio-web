import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { recordQuery } from "@/lib/usage";
import { buildSearchParams } from "@/lib/search-params";
import { createHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const log = logger("api/search/palette");

const querySchema = z.object({
  q: z.string().trim().min(2).max(200),
});

/** The palette's sections: an untyped search plus one per record type. */
const SECTIONS = [
  { key: "results", type: "", limit: 8 },
  { key: "cases", type: "case", limit: 5 },
  { key: "contacts", type: "contact", limit: 5 },
  { key: "deadlines", type: "deadline", limit: 5 },
  { key: "documents", type: "document", limit: 5 },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

/**
 * GET /api/search/palette?q= — the command palette's federated search in ONE
 * request: one quota unit, one audit entry, whatever the number of sections.
 * The per-section engine searches run server-side; a failed section is named
 * in `failed` instead of failing the whole answer.
 */
export const GET = createHandler(
  {
    action: "query.submit",
    rateTier: "search",
    quota: "queries",
    query: querySchema,
    audit: (_ctx, _body, query) => ({
      action: "query.submit" as const,
      entityType: "search",
      details: { q: query.q, palette: true },
    }),
  },
  async (ctx, _body, query) => {
    void recordQuery(ctx.brainId);
    const settled = await Promise.allSettled(
      SECTIONS.map(async (section) => {
        const params = buildSearchParams(query.q, String(section.limit), section.type);
        const res = await fetch(`${ENGINE_URL}/api/search?${params.toString()}`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as unknown;
        return Array.isArray(data) ? data : [];
      })
    );
    const out = { failed: [] as SectionKey[] } as Record<SectionKey, unknown[]> & {
      failed: SectionKey[];
    };
    settled.forEach((r, i) => {
      const key = SECTIONS[i].key;
      if (r.status === "fulfilled") {
        out[key] = r.value;
      } else {
        out[key] = [];
        out.failed.push(key);
        log.warn(`[palette] ${key} search failed:`, String(r.reason));
      }
    });
    return Response.json(out);
  }
);
