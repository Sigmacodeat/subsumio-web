
import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiNotFound } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { broadcastSseEvent } from "@/app/api/realtime/sse/route";

function buildPath(slug: string[]): string | null {
  const path = slug.join("/");
  if (path.includes("..")) return null;
  return path;
}

const patchSchema = z.object({}).passthrough().refine(
  (data) => Object.keys(data).length > 0,
  { message: "nothing_to_update" },
);

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, req) => {
    const path = buildPath((await ((req as unknown as { params: Promise<{ slug: string[] }> }).params)).slug);
    if (!path) return apiError("invalid_slug", "Invalid slug", 400);

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(path)}`, {
        headers: ctx.headers,
      });
      if (res.status === 404) return apiNotFound("not_found");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Response.json(await res.json());
    } catch (err) {
      console.error("[pages/...slug] get failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unreachable", "Seite nicht abrufbar", 503);
    }
  },
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: patchSchema,
    audit: (ctx, body) => {
      const slug = (ctx as unknown as { __slug?: string }).__slug;
      return {
        action: "case.update" as const,
        entityType: "page",
        entityId: slug,
        details: { fields: Object.keys(body) },
      };
    },
  },
  async (ctx, body, _query, req) => {
    const path = buildPath((await ((req as unknown as { params: Promise<{ slug: string[] }> }).params)).slug);
    if (!path) return apiError("invalid_slug", "Invalid slug", 400);

    // Optimistic locking: if client sends If-Match header, verify version
    const ifMatch = req.headers.get("if-match");
    if (ifMatch) {
      try {
        const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(path)}`, {
          headers: ctx.headers,
        });
        if (getRes.ok) {
          const currentPage = await getRes.json() as { frontmatter?: { version?: number } };
          const currentVersion = currentPage.frontmatter?.version ?? 0;
          const expectedVersion = parseInt(ifMatch, 10);
          if (currentVersion !== expectedVersion) {
            return Response.json(
              {
                error: "version_conflict",
                message: "Die Seite wurde zwischenzeitlich von einem anderen Nutzer bearbeitet.",
                currentVersion,
                expectedVersion,
              },
              { status: 409 },
            );
          }
        }
      } catch {
        // If we can't check the version, proceed without locking (fail-open)
      }
    }

    // Increment version on update
    const patchBody: Record<string, unknown> = { ...body, slug: path };
    if (patchBody.frontmatter) {
      const fm = patchBody.frontmatter as Record<string, unknown>;
      const currentVersion = ifMatch ? parseInt(ifMatch, 10) : (fm.version as number | undefined);
      fm.version = (typeof currentVersion === "number" ? currentVersion : 0) + 1;
    } else if (ifMatch) {
      patchBody.frontmatter = { version: parseInt(ifMatch, 10) + 1 };
    }

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(path)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(patchBody),
      });
      if (res.status === 404) return apiNotFound("not_found");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return Response.json(
          payload.error ? payload : { error: `Engine returned ${res.status}` },
          { status: res.status },
        );
      }
      const result = await res.json();
      broadcastSseEvent(ctx.brainId, "case.updated", { slug: path, by: ctx.user.email, at: new Date().toISOString() });
      return Response.json(result);
    } catch (err) {
      console.error("[pages/...slug] patch failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unreachable", "Seite nicht aktualisierbar", 503);
    }
  },
);

export const DELETE = createHandler(
  {
    action: "brain.delete",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const path = buildPath((await ((req as unknown as { params: Promise<{ slug: string[] }> }).params)).slug);
    if (!path) return apiError("invalid_slug", "Invalid slug", 400);

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(path)}`, {
        method: "DELETE",
        headers: ctx.headers,
      });
      if (res.status === 404) return apiNotFound("not_found");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      void logAudit("document.delete", "page", { entityId: path, details: { userId: ctx.user.id } });
      return Response.json({ ok: true });
    } catch (e) {
      console.error("[pages/...slug] delete failed:", e instanceof Error ? e.message : String(e));
      return apiError("engine_unreachable", "Seite nicht löschbar", 503);
    }
  },
);
