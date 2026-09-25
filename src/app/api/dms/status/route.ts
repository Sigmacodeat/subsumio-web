import { resolveDmsForBrain } from "@/lib/dms";
import { createHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    // Only the DMS of the caller's firm: its own configuration, or the
    // transitional installation DMS for firms enabled for it.
    const resolved = await resolveDmsForBrain(ctx.brainId);
    if (!resolved) {
      return Response.json({ configured: false });
    }

    return Response.json({
      configured: true,
      provider: resolved.connector.name,
      source: resolved.source,
      ready: resolved.connector.isConfigured(),
    });
  }
);
