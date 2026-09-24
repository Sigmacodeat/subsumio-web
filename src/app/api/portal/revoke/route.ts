import { z } from "zod";
import {
  revokePortalToken,
  revokePortalTokenHash,
  verifyPortalToken,
  portalTokenHash,
} from "@/lib/portal-token";
import { markPortalLinkRevoked, readPortalLinks, portalLinkStatus } from "@/lib/portal-links";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

const revokeSchema = z
  .object({
    /** Raw token — used right after generating a link still on screen. */
    token: z.string().min(1).max(2_000).optional(),
    /** Registry-based revocation for links whose raw token is gone. */
    case_slug: z.string().min(1).max(300).optional(),
    token_hash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    all: z.literal(true).optional(),
  })
  .refine((d) => d.token || (d.case_slug && (d.token_hash || d.all)), {
    message: "token or (case_slug + token_hash|all) required",
  });

async function loadCaseFrontmatter(ctx: {
  headers: Record<string, string>;
  caseSlug: string;
}): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(ctx.caseSlug)}`, {
    headers: ctx.headers,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const page = (await res.json().catch(() => null)) as {
    frontmatter?: Record<string, unknown>;
  } | null;
  return page?.frontmatter ?? null;
}

async function persistLinks(
  headers: Record<string, string>,
  caseSlug: string,
  links: unknown[],
  resetAt?: string
): Promise<boolean> {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      slug: caseSlug,
      merge: true,
      frontmatter: {
        portal_links: links,
        ...(resetAt ? { portal_links_reset_at: resetAt } : {}),
      },
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: revokeSchema,
    audit: (_ctx, body) => ({
      action: "portal.token_revoke" as const,
      entityType: "portal_token",
      entityId: body.case_slug,
      details: {
        mode: body.token ? "token" : body.all ? "all" : "hash",
      },
    }),
  },
  async (ctx, body) => {
    if (body.token) {
      const payload = await verifyPortalToken(body.token);
      await revokePortalToken(body.token);
      // Best-effort registry sync: the token decodes to its matter, so the
      // link list can be marked revoked too.
      if (payload?.case_slug) {
        const fm = await loadCaseFrontmatter({ headers: ctx.headers, caseSlug: payload.case_slug });
        const marked = fm && markPortalLinkRevoked(fm, portalTokenHash(body.token));
        if (marked) await persistLinks(ctx.headers, payload.case_slug, marked);
      }
      return apiSuccess({ revoked: 1 });
    }

    const caseSlug = body.case_slug!;
    // Read the matter AS THE CALLER: ethical walls apply, and a caller
    // without access learns nothing about the link registry.
    const fm = await loadCaseFrontmatter({ headers: ctx.headers, caseSlug });
    if (!fm) return apiError("case_not_found", "Akte nicht gefunden", 404);

    const links = readPortalLinks(fm);
    const targets = body.all
      ? links.filter((l) => portalLinkStatus(l) === "active")
      : links.filter((l) => l.token_hash === body.token_hash);
    if (targets.length === 0) {
      return apiError("not_found", "Kein passender Portal-Link gefunden", 404);
    }

    let next = links;
    for (const target of targets) {
      await revokePortalTokenHash(target.token_hash);
      next = markPortalLinkRevoked({ portal_links: next }, target.token_hash) ?? next;
    }
    // "Revoke all" also sets the reset cutoff: tokens issued before this
    // moment die even if they never made it into the registry (links issued
    // before the registry existed). The cutoff is enforced in
    // resolvePortalAccess on every portal request.
    await persistLinks(
      ctx.headers,
      caseSlug,
      next,
      body.all ? new Date().toISOString() : undefined
    );

    return apiSuccess({ revoked: targets.length });
  }
);
