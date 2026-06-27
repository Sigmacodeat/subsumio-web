import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/acls/groups`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return apiError("acl_fetch_failed", `Engine returned ${res.status}`, res.status);
      }
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      console.error("[acls/groups] failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Gruppen konnten nicht geladen werden", 500);
    }
  }
);

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: z.object({ name: z.string().min(1) }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const name = body.name;
      if (typeof name !== "string" || !name.trim()) {
        return apiError("name_required", "Gruppenname ist erforderlich", 400);
      }
      const res = await fetch(`${ENGINE_URL}/api/acls/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({ name: name.trim() }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return apiError("acl_create_failed", `Engine returned ${res.status}`, res.status);
      }
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      console.error(
        "[acls/groups] create failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Gruppe konnte nicht erstellt werden", 500);
    }
  }
);
