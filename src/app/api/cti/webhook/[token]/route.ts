import { NextRequest } from "next/server";
import { createPublicHandler } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { handleCtiWebhook } from "@/lib/cti-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/cti/webhook/<token> — for telephony providers that cannot send
 * an Authorization header (sipgate.io, Placetel): the token is part of the
 * configured webhook URL. Accepted only when CTI_WEBHOOK_PATH_TOKENS is set
 * (at least 32 characters each; several, comma-separated, for rotation).
 */
export const POST = createPublicHandler(
  {
    rateLimitKey: (req) => `cti-webhook:ip:${clientIp(req.headers)}`,
    rateLimitMax: 240,
    rateLimitWindowMs: 60_000,
  },
  async (req: NextRequest, _body, _query, extra) => {
    const params = (await extra.params) as { token?: string } | undefined;
    return handleCtiWebhook(req, { kind: "path", token: String(params?.token ?? "") });
  }
);
