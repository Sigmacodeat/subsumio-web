import { ENGINE_URL } from "@/lib/engine";
import { checkEthicalWall } from "@/lib/ethical-wall";
import type { PermissionInfo } from "@/lib/legal-types";

export type CaseAccess = "ok" | "not_found" | "blocked";

async function loadCase(
  headers: Record<string, string>,
  caseSlug: string
): Promise<{ type?: string; frontmatter?: { permissions?: PermissionInfo } } | null> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as {
    type?: string;
    frontmatter?: { permissions?: PermissionInfo };
  } | null;
}

/**
 * Whether the user may work with mail of this matter: the matter must exist in
 * the caller's firm brain, and an ethical wall on the matter takes precedence
 * over role permissions.
 */
export async function caseAccessForUser(
  headers: Record<string, string>,
  caseSlug: string,
  userId: string
): Promise<CaseAccess> {
  const page = await loadCase(headers, caseSlug);
  if (!page || page.type !== "legal_case") return "not_found";
  return checkEthicalWall(userId, page.frontmatter?.permissions).allowed ? "ok" : "blocked";
}

/**
 * Fail-closed: only an explicit "ok" grants access. The engine answers matters
 * outside the caller's matter scope with 404, so "not_found" never means
 * "unrestricted".
 */
export function caseAccessAllowed(access: CaseAccess): boolean {
  return access === "ok";
}

/** Upper bound of distinct matters checked per call; the rest counts as blocked. */
export const MAX_CASE_ACCESS_CHECKS = 250;
const CASE_ACCESS_CONCURRENCY = 20;

/**
 * Matters among `caseSlugs` the user may NOT see: walled off, outside the
 * matter scope, unknown, unreachable or beyond the check budget. Everything
 * that is not verifiably "ok" counts as blocked.
 */
export async function blockedCasesForUser(
  headers: Record<string, string>,
  caseSlugs: string[],
  userId: string
): Promise<Set<string>> {
  const unique = [...new Set(caseSlugs.filter(Boolean))];
  const blocked = new Set<string>(unique.slice(MAX_CASE_ACCESS_CHECKS));
  const toCheck = unique.slice(0, MAX_CASE_ACCESS_CHECKS);
  for (let i = 0; i < toCheck.length; i += CASE_ACCESS_CONCURRENCY) {
    const batch = toCheck.slice(i, i + CASE_ACCESS_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (slug) => {
        const access = await caseAccessForUser(headers, slug, userId).catch(
          (): CaseAccess => "not_found"
        );
        return [slug, access] as const;
      })
    );
    for (const [slug, access] of results) {
      if (!caseAccessAllowed(access)) blocked.add(slug);
    }
  }
  return blocked;
}
