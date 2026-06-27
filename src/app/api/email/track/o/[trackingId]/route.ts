import { createPublicHandler } from "@/lib/api-handler";
import {
  logTrackingEvent,
  getTrackingPixel,
  extractClientIp,
  lookupGeoIp,
  getMessageIdByTrackingId,
  getFirstOpenEvent,
  detectForward,
} from "@/lib/email/tracking";
import { clientIp } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Open-tracking pixel endpoint.
 *
 * Returns a 1x1 transparent PNG. As a side effect, logs an "opened" tracking event
 * with the recipient's IP, User-Agent, and geo data.
 *
 * Forward detection: compares IP/geo/UA against the first open event.
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

        // Geo lookup (best effort)
        let geo = { country: null as string | null, city: null as string | null };
        if (ip) {
          geo = await lookupGeoIp(ip);
        }

        // Forward detection
        let isForward = false;
        const firstOpen = await getFirstOpenEvent(cleanTrackingId);
        if (firstOpen) {
          isForward = detectForward(firstOpen, ip ?? "", geo, userAgent);
        }

        await logTrackingEvent({
          messageId: messageId ?? undefined,
          trackingId: cleanTrackingId,
          eventType: "opened",
          ipAddress: ip ?? undefined,
          userAgent: userAgent ?? undefined,
          geoCountry: geo.country ?? undefined,
          geoCity: geo.city ?? undefined,
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
            geoCountry: geo.country ?? undefined,
            geoCity: geo.city ?? undefined,
            isForward: true,
            raw: { source: "pixel", detected_via: "ip_geo_mismatch" },
          });
        }
      } catch (err) {
        console.error(
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
