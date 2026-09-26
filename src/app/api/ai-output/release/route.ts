/**
 * POST /api/ai-output/release — Zitatprüfung + anwaltliche Freigabe von KI-Text.
 *
 * Body: genau eines von `content` (Text, wie er exportiert wird) oder `slug`
 * (gespeicherte Seite; der Text wird serverseitig gelesen und die Freigabe an
 * der Seite hinterlegt). `check_only` prüft nur und gibt keine Freigabe aus.
 *
 * Die Zitatprüfung läuft hier serverseitig für genau diesen Text — ein vom
 * Client gemeldeter Prüfstatus zählt nicht. Nicht verifizierte Zitate lassen
 * sich nur mit Begründung (≥ 10 Zeichen) freigeben; das ist der
 * AttorneyOverride der Verification-Policy und wird protokolliert. Freigeben
 * dürfen nur Rollen mit `workflow.approve` (Anwalt/Admin).
 */
import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { userJurisdiction } from "@/lib/citation-gate-client";
import {
  AI_RELEASE_FM_KEY,
  contentHashOf,
  pageBody,
  signRelease,
  stateFromGrounding,
} from "@/lib/ai-release";
import {
  assertOutputActionAllowed,
  buildPolicyOutput,
  VerificationPolicyError,
  type AttorneyOverride,
} from "@/lib/verification-policy";

export const maxDuration = 60;

const MAX_TEXT = 500_000;

const bodySchema = z
  .object({
    content: z.string().min(1).max(MAX_TEXT).optional(),
    slug: z.string().min(1).max(300).optional(),
    title: z.string().max(300).optional(),
    override_reason: z.string().max(2_000).optional(),
    check_only: z.boolean().optional(),
  })
  .refine((b) => Boolean(b.content) !== Boolean(b.slug), {
    message: "content_or_slug",
  });

export const POST = createHandler(
  {
    action: "workflow.approve",
    rateTier: "standard",
    body: bodySchema,
    // Only an issued release is logged; a mere check is not a decision.
    audit: (_ctx, body) =>
      body.check_only
        ? []
        : {
            action: "ai.output_release" as const,
            entityType: "ai_output",
            entityId: body.slug,
            details: {
              override: Boolean(body.override_reason?.trim()),
              title: body.title,
            },
          },
  },
  async (ctx, body) => {
    let text: string;
    let title = body.title;
    if (body.slug) {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!res) {
        return apiError("engine_unreachable", "Der Entwurf konnte nicht geladen werden.", 503);
      }
      if (!res.ok) return apiError("not_found", "Entwurf nicht gefunden", 404);
      const page = (await res.json()) as {
        title?: string;
        status?: string;
        compiled_truth?: string;
        content?: string;
      };
      if (page.status === "tombstoned") return apiError("not_found", "Entwurf nicht gefunden", 404);
      text = pageBody(page);
      title ??= page.title;
    } else {
      text = body.content!;
    }
    if (!text.trim()) return apiError("empty_content", "Der Text ist leer.", 400);

    // Server-side citation check of exactly this text.
    let grounding;
    try {
      const { groundAnswerCitations } = await import("@/lib/citation-gate");
      grounding = await groundAnswerCitations(text, {
        fallbackJurisdiction: userJurisdiction(ctx.user.jurisdiction),
      });
    } catch {
      return apiError(
        "verifier_unavailable",
        "Die Zitatprüfung ist gerade nicht erreichbar. Bitte in einer Minute erneut versuchen.",
        503
      );
    }
    const state = stateFromGrounding(grounding);
    const contentHash = contentHashOf(text);
    const summary = {
      state,
      content_hash: contentHash,
      citations_verified: grounding.citations_verified,
      citations_unverified: grounding.citations_unverified,
      warning: grounding.warning ?? null,
      override_required: state === "NEEDS_HUMAN_REVIEW",
    };
    if (body.check_only) return apiSuccess(summary);

    const reason = body.override_reason?.trim();
    const override: AttorneyOverride | undefined =
      reason && state === "NEEDS_HUMAN_REVIEW"
        ? {
            user_id: ctx.user.id,
            reason,
            timestamp: new Date().toISOString(),
            output_hash: contentHash,
          }
        : undefined;
    try {
      await assertOutputActionAllowed(
        buildPolicyOutput(
          body.slug ?? `ai-output:${contentHash.slice(0, 16)}`,
          state,
          contentHash,
          {
            title,
          }
        ),
        "export_docx",
        { user_id: ctx.user.id, user_email: ctx.user.email, brain_id: ctx.brainId },
        override
      );
    } catch (err) {
      if (!(err instanceof VerificationPolicyError)) throw err;
      if (state === "NEEDS_HUMAN_REVIEW") {
        return apiError(
          "override_reason_required",
          "Nicht alle Zitate konnten verifiziert werden. Freigabe nur mit Begründung (mindestens 10 Zeichen) — sie wird protokolliert.",
          422,
          summary
        );
      }
      return apiError(
        "verification_failed",
        "Die Zitatprüfung ist fehlgeschlagen. Eine Freigabe ist so nicht möglich — bitte erneut prüfen.",
        409,
        summary
      );
    }

    const token = signRelease({
      brainId: ctx.brainId,
      contentHash,
      state,
      releasedBy: ctx.user.id,
      releasedByEmail: ctx.user.email,
      releasedAt: new Date().toISOString(),
      overrideReason: override?.reason,
      citationsVerified: grounding.citations_verified,
      citationsUnverified: grounding.citations_unverified,
    });

    if (body.slug) {
      const patched = await enginePatchPage(
        ctx.headers,
        {
          slug: body.slug,
          frontmatter: {
            [AI_RELEASE_FM_KEY]: token,
            released_at: new Date().toISOString(),
            released_by: ctx.user.email,
          },
        },
        { timeoutMs: 10_000 }
      ).catch(() => null);
      if (!patched?.ok) {
        return apiError(
          "release_not_saved",
          "Die Freigabe konnte nicht am Entwurf gespeichert werden. Bitte erneut versuchen.",
          502
        );
      }
    }

    return apiSuccess({ ...summary, release: token, released_by: ctx.user.email });
  }
);
