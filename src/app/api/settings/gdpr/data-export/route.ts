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

export const maxDuration = 120;

/** The engine serves at most this many pages per request (`/api/pages` clamps `limit`). */
const EXPORT_PAGE_SIZE = 200;
/** Hard stop against a misbehaving engine that never returns a short page. */
const EXPORT_MAX_BATCHES = 5_000;

/**
 * Art. 15/20 DSGVO: the export must contain every page, not the first batch.
 * The engine caps `limit`, so walk the whole source by offset until a short
 * page comes back.
 */
async function listAllPages(brain: ReturnType<typeof createServerBrainClient>) {
  const pages: unknown[] = [];
  for (let batch = 0; batch < EXPORT_MAX_BATCHES; batch++) {
    const chunk = await brain.listPages({
      limit: EXPORT_PAGE_SIZE,
      offset: batch * EXPORT_PAGE_SIZE,
    });
    pages.push(...chunk);
    if (chunk.length < EXPORT_PAGE_SIZE) break;
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
      } catch {
        // Brain may not be available
      }
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
      copilotMemories: await listMemories(
        { userId: ctx.user.id, ownedOnly: true },
        ctx.headers
      ).catch(() => []),
      // Contact requests this address sent through the website chat or the
      // contact form (Art. 15 DSGVO).
      contactRequests: await leadsForEmail(user.email).catch(() => []),
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
