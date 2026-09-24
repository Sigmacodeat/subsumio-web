import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { ENGINE_URL } from "@/lib/engine";
import { resolvePortalAccess } from "@/lib/portal-access";
import { createPublicHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import {
  getTemplate,
  buildWorkflowFrontmatter,
  buildWorkflowSlug,
  buildWorkflowTitle,
  fmToWorkflowInstance,
  getWorkflowProgress,
} from "@/lib/workflow";

export const maxDuration = 30;

/**
 * WP-7.40: Client-runnable Workflows (Legora-Parität).
 * Die Kanzlei gibt Workflow-Templates pro Akte frei (`portal_workflows`),
 * Mandanten starten sie selbst im Portal — ge-grounded auf die Akte,
 * interne Prompts bleiben serverseitig verborgen.
 */

// ── GET: freigegebene Templates + laufende Instanzen dieser Akte ────────

const getSchema = z.object({ token: z.string().min(1) });

export const GET = createPublicHandler(
  {
    query: getSchema,
    cors: true,
    rateLimitKey: (req) => `portal-workflows:${clientIp(req.headers)}`,
    rateLimitMax: 30,
    rateLimitWindowMs: 60_000,
  },
  async (req, _body, query) => {
    const access = await resolvePortalAccess(portalToken(req, query.token));
    if (access instanceof Response) return access;
    const fm = access.frontmatter;

    const enabled = Array.isArray(fm.portal_workflows) ? fm.portal_workflows : [];
    const templates = enabled
      .map((id) => getTemplate(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined)
      .map((t) => ({ id: t.id, label: t.label, description: t.description, icon: t.icon }));

    // Nur portal-gestartete Instanzen dieser Akte — Prompt/Steps-Details intern.
    let instances: Array<{
      slug: string;
      title: string;
      status: string;
      started_at: string;
      completed_at?: string;
      progress: { completed: number; total: number };
      steps: Array<{ label: string; status: string }>;
    }> = [];
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?type=workflow&limit=200`, {
        headers: access.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const raw = await res.json();
        const pages = Array.isArray(raw)
          ? raw
          : (((raw as Record<string, unknown>)?.pages as unknown[] | undefined) ?? []);
        instances = pages
          .map((p) => fmToWorkflowInstance(p))
          .filter((w): w is NonNullable<typeof w> => w !== null)
          .filter(
            (w) =>
              w.frontmatter.case_slug === access.caseSlug &&
              w.frontmatter.started_by.startsWith("portal:")
          )
          .map((w) => ({
            slug: w.slug,
            title: w.title,
            status: w.frontmatter.status,
            started_at: w.frontmatter.started_at,
            completed_at: w.frontmatter.completed_at,
            progress: getWorkflowProgress(w.frontmatter.steps),
            steps: w.frontmatter.steps.map((s) => ({ label: s.label, status: s.status })),
          }))
          .sort((a, b) => b.started_at.localeCompare(a.started_at))
          .slice(0, 10);
      }
    } catch {
      // Instanzen-Liste optional — Template-Liste trotzdem liefern.
    }

    return apiSuccess({ templates, instances });
  }
);

// ── POST: Mandant startet einen freigegebenen Workflow ──────────────────

const postSchema = z.object({
  token: z.string().min(1),
  template_id: z.string().min(1).max(200),
});

export const POST = createPublicHandler(
  {
    body: postSchema,
    cors: true,
    rateLimitKey: (req) => `portal-workflow-start:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 60_000,
  },
  async (req, body) => {
    // Token kann der Session-Slug sein → Cookie-Fallback via portalToken().
    const access = await resolvePortalAccess(portalToken(req, body.token));
    if (access instanceof Response) return access;
    const fm = access.frontmatter;

    const enabled = Array.isArray(fm.portal_workflows) ? fm.portal_workflows : [];
    if (!enabled.includes(body.template_id)) {
      return apiError(
        "workflow_not_enabled",
        "Dieser Service wurde von Ihrer Kanzlei nicht freigegeben.",
        403
      );
    }

    const template = getTemplate(body.template_id);
    if (!template) return apiError("template_not_found", "Workflow-Template nicht gefunden", 404);

    // Prompt kommt ausschließlich vom Template — nie vom Client.
    const frontmatter = buildWorkflowFrontmatter({
      template_id: template.id,
      prompt: template.prompt,
      started_by: "portal:mandant",
      case_slug: access.caseSlug,
    });
    const slug = buildWorkflowSlug(template.id);
    const title = buildWorkflowTitle(template);

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...access.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title,
        type: "workflow",
        content: template.prompt,
        frontmatter,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return apiError("workflow_create_failed", "Service konnte nicht gestartet werden", 502);
    }

    return apiSuccess({
      slug,
      title,
      status: "running",
      message: `Service '${template.label}' wurde gestartet.`,
    });
  }
);
