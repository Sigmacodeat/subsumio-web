import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createPowerOfAttorney,
  isPoAValid,
  getExpiringPoAs,
  type PowerOfAttorney,
} from "@/lib/power-of-attorney";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  case_slug: z.string().min(1).max(300),
  client_name: z.string().min(1).max(300),
  client_email: z.string().email().optional(),
  type: z.enum(["general", "litigation", "transactional", "limited", "post"]),
  scope: z.string().min(1).max(2000),
  expires_at: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "power_of_attorney",
      entityId: body.case_slug,
      details: { type: body.type, client: body.client_name },
    }),
  },
  async (ctx, body) => {
    const poa = createPowerOfAttorney(body);
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/poa/${poa.id}`,
        title: `Vollmacht: ${body.client_name} (${body.type})`,
        type: "power_of_attorney",
        frontmatter: poa,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ poa });
  }
);

const querySchema = z.object({
  case_slug: z.string().max(300).optional(),
  expiring_days: z.coerce.number().optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "power_of_attorney", limit: "500" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let items: PowerOfAttorney[] = (
      Array.isArray(data) ? data : (data.pages ?? [])
    ) as PowerOfAttorney[];
    if (query?.case_slug) {
      items = items.filter((p) => p.case_slug === query.case_slug);
    }
    const expiring = query?.expiring_days ? getExpiringPoAs(items, query.expiring_days) : [];
    const validCount = items.filter((p) => isPoAValid(p)).length;
    return apiSuccess({ items, expiring, validCount });
  }
);
