import { createPublicHandler } from "@/lib/api-handler";
import {
  logTrackingEvent,
  getTrackingPixel,
  extractClientIp,
  getMessageIdByTrackingId,
  getFirstOpenEvent,
  detectForward,
} from "@/lib/email/tracking";
import { clientIp } from "@/lib/auth/rate-limit";

import { logger } from "@/lib/logger";
const log = logger("api/email/track/o/[trackingId]");

export const dynamic = "force-dynamic";

/**
 * Open-tracking pixel endpoint.
 *
 * Returns a 1x1 transparent PNG. As a side effect, logs an "opened" tracking event
 * with the recipient's IP and User-Agent (no third-party geo lookup).
 *
 * Forward detection: compares IP/UA against the first open event.
 * If they differ significantly, the event is flagged as is_forward.
 *
 * Always returns 200 + PNG, even on errors — the email client must not see a broken image.
 */
export const GET = createPublicHandler(
  {
    rateLimitKey: (req) => `email-track-open:ip:${clientIp(req.headers)}`,
    rateLimitMax: 60,
    rateLimitWindowMs: 60_000,
  },
  async (req) => {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const trackingId = pathParts[pathParts.indexOf("o") + 1] ?? "";

    // Strip .png suffix if present in the URL
    const cleanTrackingId = trackingId.replace(/\.png$/i, "");

    // Fire-and-forget tracking — never block the pixel response
    void (async () => {
      try {
        const ip = extractClientIp(req.headers);
        const userAgent = req.headers.get("user-agent") ?? null;
        const messageId = await getMessageIdByTrackingId(cleanTrackingId);

        // Forward detection
        let isForward = false;
        const firstOpen = await getFirstOpenEvent(cleanTrackingId);
        if (firstOpen) {
          isForward = detectForward(firstOpen, ip ?? "", userAgent);
        }

        await logTrackingEvent({
          messageId: messageId ?? undefined,
          trackingId: cleanTrackingId,
          eventType: "opened",
          ipAddress: ip ?? undefined,
          userAgent: userAgent ?? undefined,
          isForward,
          raw: { source: "pixel" },
        });

        // If forward detected, also log a separate forwarded event
        if (isForward) {
          await logTrackingEvent({
            messageId: messageId ?? undefined,
            trackingId: cleanTrackingId,
            eventType: "forwarded",
            ipAddress: ip ?? undefined,
            userAgent: userAgent ?? undefined,
            isForward: true,
            raw: { source: "pixel", detected_via: "ip_ua_mismatch" },
          });
        }
      } catch (err) {
        log.error(
          `[email-tracking] open pixel logging failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })();

    // Return the pixel immediately — no caching
    const png = getTrackingPixel();
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.length),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  }
);
