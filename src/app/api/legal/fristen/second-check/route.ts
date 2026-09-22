import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { enginePatchPage } from "@/lib/engine";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slug: z.string().min(1).max(500),
});

/**
 * Vier-Augen-Kontrolle für Notfristen — server-seitig erzwungen.
 *
 * Vorher wurde die Regel "Zweitprüfer darf nicht der Ersteller sein" nur im
 * Browser geprüft (deadlines/page.tsx secondCheckSelfBlocked); der eigentliche
 * Schreibvorgang ging über das allgemeine `api.brain.updatePage`, das jeden
 * second_check_by-Wert akzeptiert hat. Jeder mit Schreibrecht auf die Seite
 * konnte second_check_by also selbst frei setzen. Diese Route ist jetzt der
 * einzige unterstützte Weg, eine Notfrist als zweitgeprüft abzuschließen: sie
 * liest die aktuelle Seite, vergleicht den angemeldeten Nutzer gegen
 * reviewed_by/completed_by (den Ersteller) und lehnt bei Gleichheit ab, statt
 * dem Client zu vertrauen.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "deadline.second_check" as const,
      entityType: "page",
      entityId: body.slug,
    }),
  },
  async (ctx, body) => {
    const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (getRes.status === 404) {
      return Response.json(
        { error: "not_found", message: "Frist nicht gefunden" },
        { status: 404 }
      );
    }
    if (!getRes.ok) {
      return Response.json(
        { error: "engine_unreachable", message: "Frist nicht lesbar" },
        { status: 503 }
      );
    }
    const page = (await getRes.json()) as { frontmatter?: Record<string, unknown> };
    const fm = page.frontmatter ?? {};

    const checker = (ctx.user.name || ctx.user.email || "").trim().toLowerCase();
    const firstChecker = String(fm.reviewed_by ?? fm.completed_by ?? "")
      .trim()
      .toLowerCase();
    if (checker && firstChecker && checker === firstChecker) {
      // NOTE: uses the explicit { error: <code>, message: <text> } shape, not
      // the apiError() helper — apiError() writes { error: <message>, code },
      // which src/lib/api.ts's request() parser reads backwards (it takes
      // `.error` as the code and `.message` as the text). This is the
      // convention that already works elsewhere, e.g. api/pages/route.ts's
      // conflict_detected response.
      return Response.json(
        {
          error: "second_check_self_blocked",
          message:
            "Die Zweitprüfung darf nicht von derselben Person durchgeführt werden, die die Frist erstgeprüft oder erledigt hat.",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const identity = ctx.user.name || ctx.user.email || "unknown";
    const patchRes = await enginePatchPage(
      ctx.headers,
      {
        slug: body.slug,
        frontmatter: {
          status: "done",
          completed_at: now,
          completed_by: identity,
          second_check_required: true,
          second_check_by: identity,
          second_check_at: now,
        },
      },
      { timeoutMs: 15_000 }
    );
    if (!patchRes.ok) {
      return Response.json(
        { error: "engine_unreachable", message: "Zweitprüfung fehlgeschlagen" },
        { status: 503 }
      );
    }

    return apiSuccess({ slug: body.slug, second_check_by: identity, second_check_at: now });
  }
);
