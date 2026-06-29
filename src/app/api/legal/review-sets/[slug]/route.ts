import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { computeStatistics, generateBatesNumber, type ReviewSetDocument } from "@/lib/review-sets";

export const dynamic = "force-dynamic";

const VALID_DECISIONS = [
  "responsive",
  "non_responsive",
  "privileged",
  "redact",
  "withhold",
] as const;
const VALID_PRIVILEGES = [
  "attorney_client",
  "work_product",
  "joint_defense",
  "settlement",
  "none",
] as const;
const VALID_REDACTIONS = [
  "PRIV_ATTORNEY_CLIENT",
  "PRIV_WORK_PRODUCT",
  "PRIV_SETTLEMENT",
  "PERSONAL_DATA",
  "CONFIDENTIAL",
  "TRADE_SECRET",
  "THIRD_PARTY",
] as const;

const updateSchema = z.object({
  status: z.enum(["draft", "in_review", "produced", "archived"]).optional(),
  description: z.string().optional(),
  documents: z
    .array(
      z.object({
        slug: z.string(),
        title: z.string(),
        decision: z.enum(VALID_DECISIONS).default("non_responsive"),
        decisionBy: z.string().optional(),
        decisionAt: z.string().optional(),
        decisionNotes: z.string().optional(),
        privilegeType: z.enum(VALID_PRIVILEGES).default("none"),
        privilegeBasis: z.string().optional(),
        redactionCode: z.enum(VALID_REDACTIONS).optional(),
        redactionNotes: z.string().optional(),
        batesNumber: z.string().optional(),
        reviewedBy: z.string().optional(),
        reviewedAt: z.string().optional(),
      })
    )
    .optional(),
  criteria: z
    .object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      docTypes: z.array(z.string()).optional(),
      keywords: z.array(z.string()).optional(),
      custodians: z.array(z.string()).optional(),
    })
    .optional(),
  production: z
    .object({
      produced: z.boolean().optional(),
      producedAt: z.string().optional(),
      producedTo: z.string().optional(),
      format: z.enum(["pdf", "tiff", "native", "csv"]).optional(),
      batesPrefix: z.string().optional(),
      batesStart: z.number().optional(),
    })
    .optional(),
});

async function getSet(slug: string, headers: Record<string, string>) {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return res.json();
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);
    const set = await getSet(decoded, ctx.headers);
    if (!set) return apiError("not_found", "Review set not found", 404);
    return Response.json(set);
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: updateSchema,
    audit: (ctx) => ({
      action: "case.update" as const,
      entityType: "review_set",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    const existing = await getSet(decoded, ctx.headers);
    if (!existing) return apiError("not_found", "Review set not found", 404);

    const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();

    let documents = body.documents ?? (fm.documents as ReviewSetDocument[]) ?? [];

    if (body.production?.batesPrefix && body.production?.batesStart !== undefined) {
      documents = documents.map((d, i) => ({
        ...d,
        batesNumber:
          d.batesNumber ??
          generateBatesNumber(body.production!.batesPrefix!, body.production!.batesStart!, i),
      }));
    }

    const updatedFm: Record<string, unknown> = {
      ...fm,
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.documents !== undefined ? { documents } : {}),
      ...(body.criteria !== undefined ? { criteria: body.criteria } : {}),
      ...(body.production !== undefined
        ? { production: { ...(fm.production as object), ...body.production } }
        : {}),
      statistics: computeStatistics(documents),
      updated_at: now,
    };

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(decoded)}`, {
      method: "PATCH",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ frontmatter: updatedFm, content: existing.content ?? "" }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError("engine_error", `Update failed: ${text.slice(0, 200)}`, 502);
    }
    const result = await res.json();
    return Response.json(result);
  }
);

export const DELETE = createHandler(
  {
    action: "brain.delete",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "case.delete" as const,
      entityType: "review_set",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, _body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(decoded)}`, {
      method: "DELETE",
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok && res.status !== 404) {
      return apiError("engine_error", "Delete failed", 502);
    }
    return Response.json({ success: true });
  }
);
