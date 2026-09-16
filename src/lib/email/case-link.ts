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

/** Matters among `caseSlugs` the user is walled off from (unknown matters count as blocked). */
export async function blockedCasesForUser(
  headers: Record<string, string>,
  caseSlugs: string[],
  userId: string
): Promise<Set<string>> {
  const unique = [...new Set(caseSlugs.filter(Boolean))].slice(0, 100);
  const results = await Promise.all(
    unique.map(async (slug) => [slug, await caseAccessForUser(headers, slug, userId)] as const)
  );
  return new Set(results.filter(([, access]) => access === "blocked").map(([slug]) => slug));
}
