/**
 * Hand facts that only the handler knows (page type, cascade counts, the
 * slug from the route params) to the route's `audit:` spec, so createHandler
 * writes exactly ONE audit entry per action — with the right action name —
 * instead of the handler logging a second entry of its own.
 */

import type { AuditAction } from "@/lib/audit";

export interface AuditExtra {
  action?: AuditAction;
  entityId?: string;
  details?: Record<string, unknown>;
}

const extras = new WeakMap<object, AuditExtra>();

export function setAuditExtra(ctx: object, extra: AuditExtra): void {
  const prev = extras.get(ctx);
  extras.set(ctx, {
    ...prev,
    ...extra,
    details: { ...prev?.details, ...extra.details },
  });
}

export function getAuditExtra(ctx: object): AuditExtra | undefined {
  return extras.get(ctx);
}

/** Slug of a `[...slug]` route from the request URL (the params are async). */
export function slugFromRoutePath(req: { url?: string } | undefined, routePrefix: string): string {
  if (!req?.url) return "";
  try {
    const pathname = new URL(req.url).pathname;
    if (!pathname.startsWith(routePrefix)) return "";
    return pathname
      .slice(routePrefix.length)
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part))
      .join("/");
  } catch {
    return "";
  }
}
