import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { resolvePortalAccess } from "@/lib/portal-access";
import { createPublicHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";

export const maxDuration = 30;

/**
 * WP-8.53: NPS / Mandanten-Feedback im Portal.
 * Score 0–10 + optionaler Kommentar, gespeichert als `client_feedback`-Page
 * auf der Akte (brain-isoliert über engineHeadersForBrain).
 * Innerhalb von 7 Tagen wird eine vorhandene Bewertung aktualisiert statt
 * dupliziert — der Mandant kann seine Bewertung korrigieren.
 */

const RECENT_WINDOW_MS = 7 * 24 * 3600 * 1000;

const postSchema = z.object({
  token: z.string().min(1),
  score: z.number().int().min(0).max(10),
  comment: z.string().max(2000).optional(),
});

interface FeedbackPage {
  slug: string;
  frontmatter?: Record<string, unknown>;
}

async function listFeedback(caseSlug: string, brainId: string): Promise<FeedbackPage[]> {
  const res = await fetch(
    `${ENGINE_URL}/api/pages?type=client_feedback&slug_prefix=${encodeURIComponent(`feedback-${caseSlug}-`)}&limit=50`,
    { headers: engineHeadersForBrain(brainId), signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data : (data.pages ?? [])) as FeedbackPage[];
}

export const POST = createPublicHandler(
  {
    body: postSchema,
    cors: true,
    rateLimitKey: (req) => `portal-feedback:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 60_000,
  },
  async (req, body) => {
    // Full gate: portal_enabled + archived + link-reset cutoff, in one place.
    const access = await resolvePortalAccess(portalToken(req, body.token));
    if (access instanceof Response) return access;
    const headers = access.headers;

    const now = Date.now();
    const existing = await listFeedback(access.caseSlug, access.payload.brain_id);
    const recent = existing.find((p) => {
      const ts = p.frontmatter?.submitted_at;
      const t = typeof ts === "string" ? Date.parse(ts) : NaN;
      return Number.isFinite(t) && now - t < RECENT_WINDOW_MS;
    });

    const frontmatter = {
      case_slug: access.caseSlug,
      nps_score: body.score,
      comment: body.comment?.trim() || null,
      submitted_at: new Date(now).toISOString(),
      channel: "portal",
    };

    if (recent) {
      const patch = await enginePatchPage(headers, {
        slug: recent.slug,
        frontmatter,
      });
      if (!patch.ok)
        return apiError("feedback_failed", "Feedback konnte nicht gespeichert werden", 502);
      return apiSuccess({ ok: true, updated: true });
    }

    const slug = `feedback-${access.caseSlug}-${now}`;
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: `Mandanten-Feedback (NPS ${body.score})`,
        type: "client_feedback",
        content: body.comment?.trim() || `NPS-Bewertung: ${body.score}/10`,
        frontmatter,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok)
      return apiError("feedback_failed", "Feedback konnte nicht gespeichert werden", 502);
    return apiSuccess({ ok: true, updated: false });
  }
);
