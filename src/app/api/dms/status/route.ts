
import { getConnector, isAnyDMSConfigured } from "@/lib/dms";
import { createHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
  },
  async (_ctx, _body, _query, _req) => {
    const configured = isAnyDMSConfigured();
    if (!configured) {
      return Response.json({ configured: false });
    }

    const connector = await getConnector();
    return Response.json({
      configured: true,
      provider: connector?.name ?? "unknown",
      ready: connector?.isConfigured() ?? false,
    });
  },
);
