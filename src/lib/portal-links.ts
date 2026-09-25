/**
 * Portal-Link-Registry — hash-only record of every issued portal link on the
 * case frontmatter (`portal_links`). Portal tokens are stateless, so without
 * this list the firm could only kill a leaked link by disabling the whole
 * portal. The registry stores the SHA-256 hash (never the token) plus
 * issue/expiry metadata, enabling per-link listing and revocation.
 */

import { ENGINE_URL } from "./engine";
import { withKeyedLock } from "./keyed-lock";
import { portalTokenHash } from "./portal-token";

import { logger } from "./logger";
import { engineWriteOrThrow } from "@/lib/engine-write";
const log = logger("lib/portal-links");

export interface PortalLinkEntry {
  /** SHA-256 of the raw token — revocation works on this value. */
  token_hash: string;
  created_at: string;
  created_by?: string;
  expires_at: string;
  /** What the link was issued for (e.g. the signature document slug). */
  purpose?: string;
  revoked_at?: string;
}

/** Recent links per matter are bounded; ancient entries fall off the list. */
export const MAX_PORTAL_LINKS = 50;

function isEntry(v: unknown): v is PortalLinkEntry {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as PortalLinkEntry).token_hash === "string" &&
    typeof (v as PortalLinkEntry).created_at === "string" &&
    typeof (v as PortalLinkEntry).expires_at === "string"
  );
}

export function readPortalLinks(
  frontmatter: Record<string, unknown> | undefined
): PortalLinkEntry[] {
  const raw = frontmatter?.portal_links;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isEntry);
}

/**
 * Append an issued link to the registry. The registry is capped: the oldest
 * revoked or expired entries are dropped first, then the oldest overall.
 */
export function appendPortalLink(
  frontmatter: Record<string, unknown> | undefined,
  entry: Omit<PortalLinkEntry, "token_hash"> & { token: string }
): PortalLinkEntry[] {
  const { token, ...rest } = entry;
  const links = [...readPortalLinks(frontmatter), { ...rest, token_hash: portalTokenHash(token) }];
  if (links.length <= MAX_PORTAL_LINKS) return links;

  const now = Date.now();
  const isDead = (l: PortalLinkEntry) => Boolean(l.revoked_at) || Date.parse(l.expires_at) <= now;
  const alive = links.filter((l) => !isDead(l));
  const dead = links.filter(isDead);
  const kept = [...alive, ...dead.slice(-Math.max(0, MAX_PORTAL_LINKS - alive.length))];
  return kept.slice(-MAX_PORTAL_LINKS);
}

export type PortalLinkStatus = "active" | "expired" | "revoked";

export function portalLinkStatus(
  entry: PortalLinkEntry,
  now: number = Date.now()
): PortalLinkStatus {
  if (entry.revoked_at) return "revoked";
  const exp = Date.parse(entry.expires_at);
  if (Number.isFinite(exp) && exp <= now) return "expired";
  return "active";
}

/**
 * Register an issued link on the matter's page. Read-modify-write under a
 * keyed lock so two links generated in quick succession don't lose each
 * other's registry entries. Best-effort: a failed write leaves the link
 * working but unlisted (revocable via raw token or by disabling the portal).
 */
export async function registerPortalLink(
  headers: Record<string, string>,
  caseSlug: string,
  entry: Omit<PortalLinkEntry, "token_hash"> & { token: string }
): Promise<void> {
  try {
    await withKeyedLock(`portal-links:${caseSlug}`, async () => {
      const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!getRes.ok) throw new Error(`case read failed: HTTP ${getRes.status}`);
      const page = (await getRes.json()) as { frontmatter?: Record<string, unknown> };
      const links = appendPortalLink(page.frontmatter, entry);
      await engineWriteOrThrow(
        `${ENGINE_URL}/api/pages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            slug: caseSlug,
            merge: true,
            frontmatter: { portal_links: links },
          }),
          signal: AbortSignal.timeout(10_000),
        },
        "Portal-Link-Register"
      );
    });
  } catch (err) {
    log.error(
      `[portal-links] register failed for ${caseSlug}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/** Mark a registry entry revoked; returns the updated list (or null if absent). */
export function markPortalLinkRevoked(
  frontmatter: Record<string, unknown> | undefined,
  tokenHash: string,
  revokedAt: string = new Date().toISOString()
): PortalLinkEntry[] | null {
  const links = readPortalLinks(frontmatter);
  const idx = links.findIndex((l) => l.token_hash === tokenHash);
  if (idx === -1) return null;
  const next = [...links];
  next[idx] = { ...next[idx]!, revoked_at: revokedAt };
  return next;
}
