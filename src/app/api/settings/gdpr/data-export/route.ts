import { NextResponse } from "next/server";
import { leadsForEmail } from "@/lib/concierge/store";
import { getStore } from "@/lib/auth/store";
import { getApiKeyStore } from "@/lib/api-key-store";
import { decrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError } from "@/lib/api-handler";

export const maxDuration = 120;

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
        const brain = createServerBrainClient(ctx.headers);
        brainPages = await brain.listPages({ limit: 10000 });
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
