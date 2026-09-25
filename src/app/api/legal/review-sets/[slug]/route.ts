import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { withKeyedLock } from "@/lib/keyed-lock";
import {
  computeStatistics,
  computeCodingConsistency,
  exportProductionProtocolSigned,
  generateBatesNumber,
  parseReviewSet,
  sampleForQC,
  applyReviewDocumentUpdate,
  type ReviewSetDocument,
} from "@/lib/review-sets";

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

/**
 * One reviewer's change to ONE document of the set. Applied on the server to
 * the stored list (under a per-set lock), so two reviewers working on the
 * same set no longer overwrite each other's decisions with a stale copy.
 * `null` clears an optional field.
 */
const documentUpdateSchema = z.object({
  slug: z.string().min(1),
  decision: z.enum(VALID_DECISIONS).optional(),
  decisionNotes: z.string().max(5000).nullable().optional(),
  privilegeType: z.enum(VALID_PRIVILEGES).optional(),
  privilegeBasis: z.string().max(5000).nullable().optional(),
  redactionCode: z.enum(VALID_REDACTIONS).nullable().optional(),
  redactionNotes: z.string().max(5000).nullable().optional(),
  qcDecision: z.enum(VALID_DECISIONS).optional(),
  qcNotes: z.string().max(5000).nullable().optional(),
  finalDecision: z.enum(VALID_DECISIONS).optional(),
  finalNotes: z.string().max(5000).nullable().optional(),
});

const updateSchema = z.object({
  /** Per-document changes (preferred for review decisions). */
  documentUpdates: z.array(documentUpdateSchema).max(1000).optional(),
  /** Documents to put into the set (not yet reviewed). Existing ones are kept. */
  addDocuments: z
    .array(z.object({ slug: z.string().min(1), title: z.string().max(500) }))
    .max(5000)
    .optional(),
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
        qcSampled: z.boolean().optional(),
        qcDecision: z.enum(VALID_DECISIONS).optional(),
        qcBy: z.string().optional(),
        qcAt: z.string().optional(),
        qcNotes: z.string().optional(),
        // QC-Konflikt-Resolution: verbindliche Endentscheidung bei Dissens.
        finalDecision: z.enum(VALID_DECISIONS).optional(),
        finalBy: z.string().optional(),
        finalAt: z.string().optional(),
        finalNotes: z.string().optional(),
      })
    )
    .optional(),
  /**
   * WP-8.50: draw a seeded QC sample of decided docs. The seed is stored on
   * the set so the draw is reproducible (defensibility).
   */
  qcSample: z
    .object({
      rate: z.number().min(0.01).max(1),
      seed: z.string().min(1).optional(),
      /** Stratifizierung: eigene Rate pro Entscheidung (z. B. withhold: 1.0). */
      strata: z.record(z.enum(VALID_DECISIONS), z.number().min(0).max(1)).optional(),
    })
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
    query: z.object({
      export: z.enum(["protocol"]).optional(),
    }),
  },
  async (ctx, _body, query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);
    const set = await getSet(decoded, ctx.headers);
    if (!set) return apiError("not_found", "Review set not found", 404);

    if (query?.export === "protocol") {
      const parsed = parseReviewSet(
        set.slug ?? decoded,
        (set.frontmatter ?? {}) as Record<string, unknown>,
        set.type as string | undefined
      );
      if (!parsed) return apiError("not_found", "Review set not found", 404);
      const csv = await exportProductionProtocolSigned(parsed);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="review-protokoll-${decoded.replace(/\//g, "-")}.csv"`,
        },
      });
    }

    const parsed = parseReviewSet(
      set.slug ?? decoded,
      (set.frontmatter ?? {}) as Record<string, unknown>,
      set.type as string | undefined
    );
    if (parsed) {
      return Response.json({
        ...set,
        codingConsistency: computeCodingConsistency(parsed.documents),
      });
    }
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

    // Read-modify-write of the set is serialised per set: concurrent
    // reviewers each apply their change to the latest stored list.
    return withKeyedLock(`review-set:${ctx.brainId}:${decoded}`, async () => {
      const existing = await getSet(decoded, ctx.headers);
      if (!existing) return apiError("not_found", "Review set not found", 404);

      const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
      const now = new Date().toISOString();

      let documents = body.documents ?? (fm.documents as ReviewSetDocument[]) ?? [];
      const actor = ctx.user.email ?? ctx.user.id;

      if (body.addDocuments?.length) {
        const known = new Set(documents.map((d) => d.slug));
        const added = body.addDocuments
          .filter((d) => !known.has(d.slug) && (known.add(d.slug), true))
          // Not reviewed yet: no decision (counts as "unreviewed").
          .map(
            (d) =>
              ({
                slug: d.slug,
                title: d.title,
                privilegeType: "none",
              }) as unknown as ReviewSetDocument
          );
        documents = [...documents, ...added];
      }

      if (body.documentUpdates?.length) {
        const bySlug = new Map(body.documentUpdates.map((u) => [u.slug, u]));
        const missing = body.documentUpdates.filter(
          (u) => !documents.some((d) => d.slug === u.slug)
        );
        if (missing.length > 0) {
          return apiError("document_not_in_set", "Dokument ist nicht Teil dieses Prüfsets", 409);
        }
        documents = documents.map((d) => {
          const update = bySlug.get(d.slug);
          return update ? applyReviewDocumentUpdate(d, update, actor, now) : d;
        });
      }

      if (body.production?.batesPrefix && body.production?.batesStart !== undefined) {
        documents = documents.map((d, i) => ({
          ...d,
          batesNumber:
            d.batesNumber ??
            generateBatesNumber(body.production!.batesPrefix!, body.production!.batesStart!, i),
        }));
      }

      let qcMeta: Record<string, unknown> = {};
      let sampledSlugs: string[] = [];
      if (body.qcSample) {
        const seed = body.qcSample.seed ?? `${decoded}:${now}`;
        sampledSlugs = sampleForQC(documents, {
          rate: body.qcSample.rate,
          seed,
          strata: body.qcSample.strata,
        });
        const sampleSet = new Set(sampledSlugs);
        documents = documents.map((d) => (sampleSet.has(d.slug) ? { ...d, qcSampled: true } : d));
        qcMeta = {
          qc_seed: seed,
          qc_sample_rate: body.qcSample.rate,
          qc_sampled_at: now,
          qc_sampled_by: ctx.user.email,
        };
      }

      const updatedFm: Record<string, unknown> = {
        ...fm,
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.documents !== undefined ||
        body.qcSample ||
        body.documentUpdates?.length ||
        body.addDocuments?.length
          ? { documents }
          : {}),
        ...qcMeta,
        ...(body.criteria !== undefined ? { criteria: body.criteria } : {}),
        ...(body.production !== undefined
          ? { production: { ...(fm.production as object), ...body.production } }
          : {}),
        statistics: computeStatistics(documents),
        updated_at: now,
      };

      const res = await enginePatchPage(
        ctx.headers,
        {
          slug: decoded,
          frontmatter: updatedFm,
          content: existing.content ?? "",
        },
        { timeoutMs: 15_000 }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return apiError("engine_error", `Update failed: ${text.slice(0, 200)}`, 502);
      }
      const result = await res.json();
      return Response.json(
        body.qcSample
          ? { ...result, qcSample: { rate: body.qcSample.rate, sampled: sampledSlugs } }
          : result
      );
    });
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

    const existing = await getSet(decoded, ctx.headers);
    if (!existing) return Response.json({ success: true });

    const res = await enginePatchPage(
      ctx.headers,
      {
        slug: decoded,
        frontmatter: {
          status: "tombstoned",
          tombstoned_at: new Date().toISOString(),
          tombstoned_by: ctx.user.email,
          tombstone_reason: "manual_delete",
        },
      },
      { timeoutMs: 10_000 }
    );

    if (!res.ok) return apiError("engine_error", "Delete failed", 502);
    return Response.json({ success: true });
  }
);
