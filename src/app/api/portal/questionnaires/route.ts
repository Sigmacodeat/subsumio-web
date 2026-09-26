import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { ENGINE_URL } from "@/lib/engine";
import { resolvePortalAccess } from "@/lib/portal-access";
import { toPortalQuestionnaire } from "@/lib/portal-view";
import { createPublicHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import {
  answerQuestionnaire,
  QuestionnaireValidationError,
  readQuestionnaires,
  validateAnswers,
} from "@/lib/questionnaires";

export const dynamic = "force-dynamic";

const querySchema = z.object({ token: z.string().min(1, "token_required") });
const answerSchema = z.object({
  token: z.string().min(1),
  questionnaire_id: z.string().min(1).max(120),
  answers: z.record(z.string(), z.string().max(5000)),
});

async function loadCase(headers: Record<string, string>, caseSlug: string) {
  const res = await fetch(
    `${ENGINE_URL}/api/pages/${caseSlug.split("/").map(encodeURIComponent).join("/")}`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) return null;
  return (await res.json()) as { frontmatter?: Record<string, unknown> };
}

async function saveCase(
  headers: Record<string, string>,
  caseSlug: string,
  frontmatter: Record<string, unknown>
): Promise<boolean> {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ slug: caseSlug, merge: true, frontmatter }),
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}

export const GET = createPublicHandler(
  {
    query: querySchema,
    cors: true,
    rateLimitKey: (req) => `portal-qn:${clientIp(req.headers)}`,
    rateLimitMax: 30,
    rateLimitWindowMs: 60_000,
  },
  async (req, _body, query) => {
    // resolvePortalAccess, not a bare token check: disabling the portal or
    // archiving the matter must cut questionnaire access on the next request.
    const access = await resolvePortalAccess(portalToken(req, query.token));
    if (access instanceof Response) return access;
    const page = await loadCase(access.headers, access.caseSlug);
    if (!page) return apiError("case_not_found", "Akte nicht gefunden", 404);
    return apiSuccess({
      questionnaires: readQuestionnaires(page.frontmatter).map(toPortalQuestionnaire),
    });
  }
);

export const POST = createPublicHandler(
  {
    body: answerSchema,
    cors: true,
    rateLimitKey: (req) => `portal-qn-answer:${clientIp(req.headers)}`,
    rateLimitMax: 20,
    rateLimitWindowMs: 60_000,
  },
  async (req, body) => {
    const access = await resolvePortalAccess(portalToken(req, body.token));
    if (access instanceof Response) return access;
    const headers = access.headers;
    const page = await loadCase(headers, access.caseSlug);
    if (!page) return apiError("case_not_found", "Akte nicht gefunden", 404);

    const questionnaires = readQuestionnaires(page.frontmatter);
    const target = questionnaires.find((q) => q.id === body.questionnaire_id);
    if (!target) return apiError("not_found", "Fragebogen nicht gefunden", 404);
    if (target.status === "answered") {
      return apiError("already_answered", "Dieser Fragebogen wurde bereits beantwortet.", 409);
    }

    try {
      const clean = validateAnswers(target, body.answers);
      const updated = answerQuestionnaire(questionnaires, target.id, clean);
      const ok = await saveCase(headers, access.caseSlug, { questionnaires: updated });
      if (!ok) return apiError("engine_write_failed", "Speichern fehlgeschlagen", 502);
      return apiSuccess({ answered: true });
    } catch (err) {
      if (err instanceof QuestionnaireValidationError) {
        return apiError("required_fields_missing", "Pflichtfelder fehlen", 400, {
          missing: err.missingKeys,
        });
      }
      throw err;
    }
  }
);
