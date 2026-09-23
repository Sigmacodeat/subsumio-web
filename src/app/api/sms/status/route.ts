import { NextRequest } from "next/server";
import { z } from "zod";
import { createHandler, createWebhookHandler } from "@/lib/api-handler";
import { verifyTwilioSignature } from "@/lib/sms/twilio-verify";
import { phoneHash } from "@/lib/whatsapp/verify";
import { normalizePhone } from "@/lib/whatsapp/types";
import { listAuditLogs, logAudit } from "@/lib/audit";
import { filterNewIds } from "@/lib/caselaw-dedup";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/sms/status — Twilio StatusCallback webhook.
 *
 * Twilio posts application/x-www-form-urlencoded with MessageSid,
 * MessageStatus (queued|sent|delivered|undelivered|failed|…) and
 * optionally ErrorCode. We verify X-Twilio-Signature over the exact
 * request URL + sorted params (HMAC-SHA1, auth token) — fail closed
 * without TWILIO_AUTH_TOKEN.
 *
 * Delivery state lands in the audit log; no per-message store exists yet
 * (SMS sends are fire-and-forget with audit trail). A delivery console
 * can be layered on `sms.delivery_status` entries.
 */
export const POST = createWebhookHandler({}, async (_body, req: NextRequest) => {
  const rawBody = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody)) params[k] = v;

  // Signatur gilt für die URL, die wir Twilio als StatusCallback
  // mitgegeben haben (NEXT_PUBLIC_APP_URL-basiert). Hinter TLS-Termination
  // (Caddy) ist req.url intern http:// — Twilio signiert aber https://,
  // also gegen die kanonische Public-URL prüfen, nicht gegen req.url.
  const appUrl = env("NEXT_PUBLIC_APP_URL")?.replace(/\/+$/, "");
  const callbackUrl = appUrl ? `${appUrl}/api/sms/status` : req.url;
  const signature = req.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature(callbackUrl, params, signature)) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  const sid = params.MessageSid;
  const status = params.MessageStatus;
  if (!sid || !status) {
    return Response.json({ error: "missing_fields" }, { status: 400 });
  }

  // Replay-Schutz: identische sid+status-Kombination nur einmal auditieren.
  // Legitime Status-Progression (queued→sent→delivered) hat je eigenen Key.
  const fresh = await filterNewIds("system", "sms-status", [`${sid}:${status}`]);
  if (fresh.size === 0) {
    return Response.json({ ok: true, deduped: true });
  }

  await logAudit("sms.delivery_status", "sms_outbound", {
    details: {
      sid,
      status,
      errorCode: params.ErrorCode ?? null,
      // Korrelation zum Consent-Store über denselben SHA-256-Phone-Hash —
      // die Rohtelefonnummer wird nie persistiert.
      toHash: params.To ? phoneHash(params.To) : null,
    },
  });

  return Response.json({ ok: true });
});

const statusQuerySchema = z.object({
  phone: z.string().min(5).max(30),
});

interface SmsDeliveryRow {
  status: string;
  errorCode: string | null;
  timestamp: string;
}

/**
 * GET /api/sms/status?phone= — letzte Zustellstände für eine Nummer.
 *
 * Korreliert `sms.delivery_status`-Audit-Einträge über denselben
 * SHA-256-Phone-Hash, den Consent-Store und Webhook nutzen — die
 * Rohtelefonnummer verlässt den Request nicht. Der Dialog zeigt damit
 * „zugestellt/fehlgeschlagen" statt nur „gesendet".
 */
export const GET = createHandler(
  {
    action: "agent.read",
    rateTier: "standard",
    query: statusQuerySchema,
  },
  async (ctx, _body, query) => {
    const hash = phoneHash(normalizePhone(query.phone));
    const entries = await listAuditLogs({
      brainId: ctx.brainId,
      action: "sms.delivery_status",
      limit: 100,
    });
    const deliveries: SmsDeliveryRow[] = entries
      .filter((e) => (e.details as { toHash?: string } | undefined)?.toHash === hash)
      .slice(0, 5)
      .map((e) => {
        const d = (e.details ?? {}) as { status?: string; errorCode?: string | null };
        return {
          status: d.status ?? "unknown",
          errorCode: d.errorCode ?? null,
          timestamp: e.timestamp,
        };
      });
    return Response.json({ deliveries });
  }
);
