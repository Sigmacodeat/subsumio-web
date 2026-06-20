
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/stats`, { headers: ctx.headers });
      if (res.ok) {
        const stats = await res.json();
        return Response.json({
          brains: [{
            name: ctx.user.orgId ? "Team-Brain" : "Haupt-Brain",
            slug: ctx.brainId,
            source: "default",
            isShared: !!ctx.user.orgId,
            stats,
          }],
        });
      }
    } catch {
      // Engine unreachable — fall back to minimal known data.
    }

    return Response.json({
      brains: [{
        name: ctx.user.orgId ? "Team-Brain" : "Haupt-Brain",
        slug: ctx.brainId,
        source: "default",
        isShared: !!ctx.user.orgId,
      }],
    });
  },
);
