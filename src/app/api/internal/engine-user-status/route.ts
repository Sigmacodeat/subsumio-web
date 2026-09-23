/**
 * Engine-only: may this user still work in this firm, and with which role?
 *
 * MCP tokens created in the settings act for the person who created them.
 * The engine asks here on every use (cached ~60 s there), so a deleted,
 * deactivated or suspended account — or one that left the firm — stops the
 * token, and a role change applies to it. Authenticated with
 * ENGINE_WEBHOOK_API_KEY like the pipeline billing endpoints; answers
 * "inactive" for anything it cannot confirm.
 */

import { z } from "zod";
import { createWebhookHandler } from "@/lib/api-handler";
import { timingSafeCompare } from "@/lib/crypto-utils";
import { clientIp } from "@/lib/auth/rate-limit";
import { getStore } from "@/lib/auth/store";
import { isAccountBlocked } from "@/lib/auth/account-status";
import { firmBrainIdFor } from "@/lib/engine";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  uid: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_:.-]+$/),
  source: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9:_-]+$/),
});

const inactive = () => Response.json({ active: false });

export const GET = createWebhookHandler(
  {
    rateLimitKey: (req) => `engine:user-status:${clientIp(req.headers)}`,
    rateLimitMax: 1_000,
    rateLimitWindowMs: 60_000,
  },
  async (_body, req) => {
    const expectedKey = process.env.ENGINE_WEBHOOK_API_KEY;
    const providedKey = req.headers.get("x-engine-webhook-key") ?? "";
    if (!expectedKey || !providedKey || !timingSafeCompare(providedKey, expectedKey)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const parsed = querySchema.safeParse({
      uid: req.nextUrl.searchParams.get("uid") ?? "",
      source: req.nextUrl.searchParams.get("source") ?? "",
    });
    if (!parsed.success) return Response.json({ error: "invalid_query" }, { status: 400 });

    const user = await getStore().getById(parsed.data.uid);
    if (!user || (await isAccountBlocked(user))) return inactive();
    // The firm's brain the user works in today — a member who left the firm
    // no longer reaches its source.
    const brainId = await firmBrainIdFor(user);
    if (!brainId || brainId !== parsed.data.source) return inactive();
    return Response.json({ active: true, role: user.role });
  }
);
