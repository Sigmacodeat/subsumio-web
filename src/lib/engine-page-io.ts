/**
 * Server-side page reads and writes on the engine for a request's caller.
 *
 * Server code must not use the browser client in `@/lib/api` for engine calls:
 * on the server it talks to the engine directly with no tenant, API key or
 * caller identity, so the engine either rejects the call (`tenant_required`)
 * or — without the signed identity — skips the matter access rules (walls,
 * restricted matters). Every function here takes the route's `ctx.headers`
 * (see `engineContext` in `@/lib/engine`), which carry all three.
 */

import { ENGINE_URL } from "@/lib/engine";
import type { BrainPage } from "@/lib/types";

export type EngineHeaders = Record<string, string>;

function slugPath(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/**
 * One page, or null when it does not exist or the caller may not see it (the
 * engine answers walled matters like missing pages). Other failures throw.
 */
export async function getEnginePage(
  headers: EngineHeaders,
  slug: string,
  opts: { timeoutMs?: number } = {}
): Promise<BrainPage | null> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${slugPath(slug)}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`engine_page_get_failed_${res.status}`);
  return (await res.json()) as BrainPage;
}

/**
 * Creates a page, or with `merge` overlays the given frontmatter keys onto the
 * existing page (the engine has no PATCH route — see `enginePatchPage`).
 */
export async function writeEnginePage(
  headers: EngineHeaders,
  page: {
    slug: string;
    title?: string;
    content?: string;
    type?: string;
    frontmatter?: Record<string, unknown>;
  },
  opts: { merge?: boolean; timeoutMs?: number } = {}
): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(opts.merge ? { ...page, merge: true } : page),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (!res.ok) throw new Error(`engine_page_write_failed_${res.status}`);
}
