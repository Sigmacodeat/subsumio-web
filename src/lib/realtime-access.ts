import { ENGINE_URL } from "@/lib/engine";
import { checkEthicalWall } from "@/lib/ethical-wall";
import type { PermissionInfo } from "@/lib/legal-types";

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 500;

interface EnginePage {
  type?: string;
  frontmatter?: { type?: string; case_slug?: unknown; permissions?: PermissionInfo };
}

/**
 * Page-visibility check for one real-time stream, answered by the engine with
 * the stream user's own signed identity (matter scope, grants, restricted
 * matters) plus the ethical wall of the page's matter. Anything that is not a
 * clear yes — engine 404/403, timeout, unreadable body — is a no.
 * Results are cached briefly per stream so a burst of events costs one lookup.
 */
export function createPageVisibilityChecker(
  headers: Record<string, string>,
  userId: string,
  opts: { now?: () => number; ttlMs?: number } = {}
): (slug: string) => Promise<boolean> {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? CACHE_TTL_MS;
  const cache = new Map<string, { at: number; visible: Promise<boolean> }>();

  async function load(slug: string): Promise<EnginePage | null> {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res?.ok) return null;
    return (await res.json().catch(() => null)) as EnginePage | null;
  }

  async function compute(slug: string, depth: number): Promise<boolean> {
    const page = await load(slug);
    if (!page) return false;
    const type = page.type ?? page.frontmatter?.type;
    if (type === "legal_case") {
      return checkEthicalWall(userId, page.frontmatter?.permissions).allowed;
    }
    const caseSlug = page.frontmatter?.case_slug;
    if (typeof caseSlug === "string" && caseSlug && caseSlug !== slug && depth === 0) {
      return visible(caseSlug, depth + 1);
    }
    return true;
  }

  function visible(slug: string, depth = 0): Promise<boolean> {
    const hit = cache.get(slug);
    if (hit && now() - hit.at < ttl) return hit.visible;
    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    const result = compute(slug, depth).catch(() => false);
    cache.set(slug, { at: now(), visible: result });
    return result;
  }

  return (slug: string) => visible(slug);
}
