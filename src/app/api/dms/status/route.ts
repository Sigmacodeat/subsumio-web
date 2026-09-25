import { getConnector, isAnyDMSConfigured, isDmsEnabledForBrain } from "@/lib/dms";
import { createHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    // The installation DMS belongs to the firm(s) enabled for it only.
    const configured = isAnyDMSConfigured() && isDmsEnabledForBrain(ctx.brainId);
    if (!configured) {
      return Response.json({ configured: false });
    }

    const connector = await getConnector();
    return Response.json({
      configured: true,
      provider: connector?.name ?? "unknown",
      ready: connector?.isConfigured() ?? false,
    });
  }
);
