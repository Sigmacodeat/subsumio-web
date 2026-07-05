import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import type { CaseFrontmatter } from "@/lib/legal-types";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  case_slug: z.string().min(1).max(300),
  blocked_users: z.array(z.string().min(1).max(200)).max(100),
});

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: patchSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "ethical_wall",
      entityId: body.case_slug,
      details: { blockedUsers: body.blocked_users },
    }),
  },
  async (ctx, body) => {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.case_slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("case_not_found", "Akte nicht gefunden", 404);
    const page = await res.json();
    const fm = (page.frontmatter ?? {}) as CaseFrontmatter;
    const permissions = fm.permissions ?? { blocked_users: [] };
    const updatedPermissions = {
      ...permissions,
      blocked_users: body.blocked_users,
    };

    const updateRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.case_slug)}`, {
      method: "PATCH",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        frontmatter: {
          permissions: updatedPermissions,
          updated_at: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!updateRes.ok) return apiError("update_failed", "Aktualisierung fehlgeschlagen", 502);

    return apiSuccess({
      case_slug: body.case_slug,
      blocked_users: body.blocked_users,
    });
  }
);

const querySchema = z.object({
  case_slug: z.string().min(1).max(300),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    if (!query?.case_slug) return apiError("missing_case", "case_slug erforderlich", 400);

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(query.case_slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("case_not_found", "Akte nicht gefunden", 404);
    const page = await res.json();
    const fm = (page.frontmatter ?? {}) as CaseFrontmatter;
    const blockedUsers = fm.permissions?.blocked_users ?? [];

    const auditRes = await fetch(
      `${ENGINE_URL}/api/audit?entityId=${encodeURIComponent(query.case_slug)}&limit=50`,
      {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      }
    );
    let auditEvents: Array<{ action: string; timestamp: string; details: unknown }> = [];
    if (auditRes.ok) {
      const auditData = await auditRes.json();
      auditEvents = (Array.isArray(auditData) ? auditData : (auditData.events ?? []))
        .filter((e: { action: string }) => e.action === "case.update")
        .filter((e: { details: unknown }) => {
          const d = e.details as Record<string, unknown> | undefined;
          return d && "blockedUsers" in d;
        });
    }

    return apiSuccess({
      case_slug: query.case_slug,
      blocked_users: blockedUsers,
      audit_events: auditEvents,
    });
  }
);
