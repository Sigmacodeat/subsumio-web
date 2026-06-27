import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { createHandler, apiError } from "@/lib/api-handler";

function validSlug(raw: string): string | null {
  const decoded = decodeURIComponent(raw);
  if (!decoded || decoded.includes("..") || decoded.includes("//")) return null;
  return decoded;
}

const patchSchema = z.object({}).passthrough();

export const GET = createHandler(
  {
    action: "invoice.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = validSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) return apiError("not_found", "Rechnung nicht gefunden", 404);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = await res.json();
      if (page?.type && page.type !== "invoice") {
        return apiError("not_an_invoice", "Seite ist keine Rechnung", 400);
      }
      return Response.json(page);
    } catch (err) {
      console.error(
        "[invoices/slug] get failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("not_found", "Rechnung nicht gefunden", 404);
    }
  }
);

export const PATCH = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: patchSchema,
  },
  async (ctx, body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = validSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    if (Object.keys(body).length === 0) {
      return apiError("nothing_to_update", "Keine Felder zum Aktualisieren", 400);
    }

    const BLOCKED_STATUS = new Set(["sent", "paid"]);
    if (
      typeof body.status === "string" &&
      BLOCKED_STATUS.has(body.status) &&
      !body._allow_status_override
    ) {
      return apiError(
        "use_dedicated_endpoint",
        "Use /api/invoices/send or /api/invoices/remind",
        409
      );
    }

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({ ...body, slug }),
      signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404) return apiError("not_found", "Rechnung nicht gefunden", 404);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return Response.json(payload.error ? payload : { error: `Engine returned ${res.status}` }, {
          status: res.status,
        });
      }
      void logAudit("invoice.update", "invoice", {
        entityId: slug,
        details: { fields: Object.keys(body) },
      });
      return Response.json(await res.json());
    } catch (err) {
      console.error(
        "[invoices/slug] patch failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unreachable", "Engine nicht erreichbar", 503);
    }
  }
);

export const DELETE = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = validSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    try {
      const checkRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
      });
      if (checkRes.status === 404) return apiError("not_found", "Rechnung nicht gefunden", 404);
      if (checkRes.ok) {
        const page = await checkRes.json();
        const fm = page?.frontmatter ?? {};
        const protectedStatuses = new Set(["sent", "paid", "overdue"]);
        if (protectedStatuses.has(String(fm.status ?? ""))) {
          return apiError("cannot_delete_non_draft", "Nur Entwürfe können gelöscht werden", 409);
        }
      }
    } catch {
      // If check fails, let the DELETE through — engine will enforce.
    }

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) return apiError("not_found", "Rechnung nicht gefunden", 404);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      void logAudit("invoice.delete", "invoice", { entityId: slug });
      return Response.json({ ok: true });
    } catch (err) {
      console.error(
        "[invoices/slug] delete failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unreachable", "Engine nicht erreichbar", 503);
    }
  }
);
