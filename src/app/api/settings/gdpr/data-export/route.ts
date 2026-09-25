import { NextResponse } from "next/server";
import { leadsForEmail } from "@/lib/concierge/store";
import { getStore } from "@/lib/auth/store";
import { getApiKeyStore } from "@/lib/api-key-store";
import { decrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { createServerBrainClient } from "@/lib/server-brain";
import { listMemories } from "@/lib/copilot-memory";
import { createHandler, apiError } from "@/lib/api-handler";
import { redactPageSecrets } from "@/lib/kanzlei-settings-secrets";
import { logger } from "@/lib/logger";

const log = logger("api/settings/gdpr/data-export");

export const maxDuration = 120;

/** The engine serves at most this many pages per request (`/api/pages` clamps `limit`). */
const EXPORT_PAGE_SIZE = 100;
/** Hard stop against a misbehaving engine whose cursor never advances. */
const EXPORT_MAX_BATCHES = 5_000;

/**
 * Art. 15/20 DSGVO: the export must contain every page, not the first batch.
 * Keyset-paginated (`x-next-cursor`) so batches shortened by matter-scope/ACL
 * filters do not look like the end of the list; falls back to offset paging
 * for engines without the header.
 */
async function listAllPages(brain: ReturnType<typeof createServerBrainClient>) {
  const pages: unknown[] = [];
  let cursor: string | undefined;
  for (let batch = 0; batch < EXPORT_MAX_BATCHES; batch++) {
    const chunk = brain.listPagesPaged
      ? await brain.listPagesPaged({
          limit: EXPORT_PAGE_SIZE,
          cursor,
          offset: cursor ? 0 : pages.length,
        })
      : {
          items: await brain.listPages({ limit: EXPORT_PAGE_SIZE, offset: pages.length }),
          nextCursor: null,
        };
    pages.push(...chunk.items);
    const next = chunk.nextCursor;
    if (next && next !== cursor) {
      cursor = next;
      continue;
    }
    if (chunk.items.length < EXPORT_PAGE_SIZE) break;
  }
  return pages;
}

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "heavy",
  },
  async (ctx, _body, _query, _req) => {
    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return apiError("user_not_found", "User not found", 404);

    const [openaiKey, anthropicKey, zeroEntropyKey] = await Promise.all([
      decrypt(user.openaiKey),
      decrypt(user.anthropicKey),
      decrypt(user.zeroEntropyKey),
    ]);

    const apiKeyStore = getApiKeyStore();
    const apiKeys = await apiKeyStore.listByOwner(ctx.user.id);

    // Art. 15/20 covers the requester's own data. A firm member's brain is the
    // firm's shared matter store (other clients, other lawyers' matters,
    // ethical walls) — it is not personal data of the member and must not
    // leave through a self-service export.
    let brainPages: unknown[] = [];
    const firmBrain = Boolean(user.orgId);
    if (!firmBrain) {
      try {
        brainPages = redactPageSecrets(await listAllPages(createServerBrainClient(ctx.headers)));
      } catch (err) {
        // Art. 15: a partial export must never be presented as complete.
        log.error("brain page listing failed:", err instanceof Error ? err.message : err);
        return apiError(
          "export_incomplete",
          "Der Export ist derzeit nicht vollständig möglich. Bitte später erneut versuchen.",
          503
        );
      }
    }

    // Same completeness rule for every personal-data source: any failure
    // fails the whole export instead of shipping a silently incomplete file.
    let copilotMemories: Awaited<ReturnType<typeof listMemories>>;
    let contactRequests: Awaited<ReturnType<typeof leadsForEmail>>;
    try {
      [copilotMemories, contactRequests] = await Promise.all([
        listMemories({ userId: ctx.user.id, ownedOnly: true }, ctx.headers),
        leadsForEmail(user.email),
      ]);
    } catch (err) {
      log.error("personal-data source failed:", err instanceof Error ? err.message : err);
      return apiError(
        "export_incomplete",
        "Der Export ist derzeit nicht vollständig möglich. Bitte später erneut versuchen.",
        503
      );
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
        locale: user.locale,
        referralCode: user.referralCode,
        referredBy: user.referredBy,
        brainId: user.brainId,
        stripeCustomerId: user.stripeCustomerId,
        emailVerifiedAt: user.emailVerifiedAt,
        orgId: user.orgId,
        industry: user.industry,
        twoFactorEnabled: user.twoFactorEnabled,
        ssoProvider: user.ssoProvider,
        openaiKey: openaiKey ? "***configured***" : null,
        anthropicKey: anthropicKey ? "***configured***" : null,
        zeroEntropyKey: zeroEntropyKey ? "***configured***" : null,
        createdAt: user.createdAt,
      },
      apiKeys: apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scopes: k.scopes,
        active: k.active,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
      brainPages,
      // WP-5.30 / Art. 15 DSGVO: the user's own copilot-memory entries are
      // personal data even when they live in the firm's shared brain.
      copilotMemories,
      // Contact requests this address sent through the website chat or the
      // contact form (Art. 15 DSGVO).
      contactRequests,
      ...(firmBrain
        ? {
            brainPagesNote:
              "Matter data of the firm is not part of a personal export. Requests concerning firm records are handled by the firm as controller.",
          }
        : {}),
    };

    void logAudit("data.export", "user", {
      entityId: ctx.user.id,
      userId: ctx.user.id,
      details: { page_count: brainPages.length },
    });

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="subsumio-data-export-${user.email}-${new Date().toISOString().split("T")[0]}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }
);
