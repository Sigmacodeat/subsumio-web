import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";

const schema = z.object({
  jurisdiction: z.enum(["DE", "AT", "CH"]),
});

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: schema,
    audit: (ctx, body) => ({
      action: "settings.jurisdiction" as const,
      entityType: "user",
      details: { user: ctx.user.email, jurisdiction: body.jurisdiction },
    }),
  },
  async (ctx, body) => {
    const updated = await getStore().update(ctx.user.id, {
      jurisdiction: body.jurisdiction,
    });
    if (!updated) {
      return Response.json({ error: "user_not_found" }, { status: 404 });
    }
    return Response.json({ ok: true, jurisdiction: body.jurisdiction });
  }
);
