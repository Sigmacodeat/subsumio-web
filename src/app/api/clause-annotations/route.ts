import { z } from "zod";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  buildAnnotationSlug,
  buildAnnotationTitle,
  buildAnnotationFrontmatter,
  buildReviewUpdate,
  fmToAnnotation,
  filterByContract,
  sortByRiskLevel,
  computeAnnotationStats,
  type ClauseAnnotation,
  type ClauseRiskLevel,
  type ClauseCategory,
} from "@/lib/clause-annotation";

export const maxDuration = 30;

// ── GET: List annotations for a contract ──────────────────────────────

const getSchema = z.object({
  contract_slug: z.string().min(1),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: getSchema,
  },
  async (ctx, _body, query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?type=clause_annotation&limit=500`, {
        headers: engineHeadersForBrain(ctx.brainId),
      });

      let annotations: ClauseAnnotation[] = [];
      if (res.ok) {
        const raw = await res.json();
        const pages = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as Record<string, unknown>)?.pages)
            ? (raw as Record<string, unknown[]>).pages
            : [];
        annotations = pages
          .map((p) => fmToAnnotation(p))
          .filter((a): a is ClauseAnnotation => a !== null);
      }

      const filtered = filterByContract(annotations, query.contract_slug);
      const sorted = sortByRiskLevel(filtered, "asc");
      const stats = computeAnnotationStats(filtered);

      return apiSuccess({
        annotations: sorted,
        stats,
        total: sorted.length,
      });
    } catch (err) {
      return apiError(
        "annotations_list_failed",
        err instanceof Error ? err.message : "annotations_list_failed",
        500
      );
    }
  }
);

// ── POST: Create a new clause annotation ──────────────────────────────

const postSchema = z.object({
  contract_slug: z.string().min(1),
  clause_type: z.enum([
    "nda",
    "employment",
    "service",
    "sale",
    "lease",
    "partnership",
    "licensing",
    "settlement",
    "liability",
    "payment",
    "termination",
    "ip",
    "data_protection",
    "warranty",
    "general",
  ]),
  clause_title: z.string().min(1).max(200),
  clause_excerpt: z.string().max(5000),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  legal_basis: z.string().max(500),
  recommendation: z.string().max(5000),
  playbook_rule_id: z.string().optional(),
  position_start: z.number().int().min(0).optional(),
  position_end: z.number().int().min(0).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: postSchema,
  },
  async (ctx, body, _query, _req) => {
    try {
      const slug = buildAnnotationSlug(body.contract_slug, body.clause_type);
      const title = buildAnnotationTitle(body.clause_type as ClauseCategory, body.clause_title);
      const frontmatter = buildAnnotationFrontmatter({
        contract_slug: body.contract_slug,
        clause_type: body.clause_type as ClauseCategory,
        clause_title: body.clause_title,
        clause_excerpt: body.clause_excerpt,
        risk_level: body.risk_level as ClauseRiskLevel,
        legal_basis: body.legal_basis,
        recommendation: body.recommendation,
        annotated_by: ctx.user?.email ?? ctx.user?.name ?? "system",
        playbook_rule_id: body.playbook_rule_id,
        position_start: body.position_start,
        position_end: body.position_end,
      });

      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: {
          ...engineHeadersForBrain(ctx.brainId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug,
          title,
          type: "clause_annotation",
          content: body.clause_excerpt,
          frontmatter,
        }),
      });

      if (!res.ok) {
        return apiError("annotation_create_failed", "Annotation konnte nicht erstellt werden", 502);
      }

      broadcastSseEvent(ctx.brainId, "annotation.created", {
        slug,
        contract_slug: body.contract_slug,
      });

      return apiSuccess({
        slug,
        title,
        frontmatter,
        message: `Annotation '${body.clause_title}' erstellt.`,
      });
    } catch (err) {
      return apiError(
        "annotation_create_failed",
        err instanceof Error ? err.message : "annotation_create_failed",
        500
      );
    }
  }
);

// ── PATCH: Update review status ───────────────────────────────────────

const patchSchema = z.object({
  slug: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
  reject_reason: z.string().max(1000).optional(),
});

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: patchSchema,
  },
  async (ctx, body, _query, _req) => {
    try {
      const path = body.slug.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers: engineHeadersForBrain(ctx.brainId),
      });

      if (!res.ok) {
        return apiError("annotation_not_found", `Annotation '${body.slug}' nicht gefunden.`, 404);
      }

      const page = (await res.json()) as {
        slug: string;
        title: string;
        frontmatter?: Record<string, unknown>;
      };

      const annotation = fmToAnnotation(page);
      if (!annotation) {
        return apiError("invalid_annotation", "Seite ist keine Clause Annotation.", 400);
      }

      const reviewUpdate = buildReviewUpdate({
        status: body.status,
        reviewed_by: ctx.user?.email ?? ctx.user?.name ?? "system",
        reject_reason: body.reject_reason,
      });

      const updatedFrontmatter = {
        ...annotation.frontmatter,
        ...reviewUpdate,
      };

      const updateRes = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "PUT",
        headers: {
          ...engineHeadersForBrain(ctx.brainId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: body.slug,
          title: annotation.title,
          frontmatter: updatedFrontmatter,
        }),
      });

      if (!updateRes.ok) {
        return apiError(
          "annotation_update_failed",
          "Annotation konnte nicht aktualisiert werden",
          502
        );
      }

      broadcastSseEvent(ctx.brainId, "annotation.reviewed", {
        slug: body.slug,
        status: body.status,
        contract_slug: annotation.frontmatter.contract_slug,
      });

      return apiSuccess({
        slug: body.slug,
        frontmatter: updatedFrontmatter,
        message: `Annotation ${body.status === "approved" ? "freigegeben" : "abgelehnt"}.`,
      });
    } catch (err) {
      return apiError(
        "annotation_update_failed",
        err instanceof Error ? err.message : "annotation_update_failed",
        500
      );
    }
  }
);
