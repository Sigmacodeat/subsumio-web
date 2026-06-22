import { NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { getApiKeyStore } from "@/lib/api-key-store";
import { decrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError } from "@/lib/api-handler";

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

    let brainPages: unknown[] = [];
    try {
      const brain = createServerBrainClient(ctx.headers);
      brainPages = await brain.listPages({ limit: 10000 });
    } catch {
      // Brain may not be available
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
