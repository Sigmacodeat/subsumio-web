import { NextRequest, NextResponse } from "next/server";

import {
  logTrackingEvent,
  extractClientIp,
  lookupGeoIp,
  getMessageIdByTrackingId,
  getFirstOpenEvent,
  detectForward,
} from "@/lib/email/tracking";

export const dynamic = "force-dynamic";

/**
 * Click-tracking redirect endpoint.
 *
 * Rewrites links in tracked emails to: /api/email/track/c/{trackingId}?l={linkId}&u={base64url}
 *
 * On visit:
 * 1. Logs a "clicked" tracking event with IP, UA, geo
 * 2. Decodes the original URL from the `u` query param
 * 3. Redirects (302) to the original URL
 *
 * Forward detection: same logic as open pixel.
 *
 * Always redirects, even if logging fails — the user must reach their destination.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  const { trackingId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const linkId = searchParams.get("l") ?? undefined;
  const encodedUrl = searchParams.get("u") ?? "";

  // Decode the original URL
  let targetUrl: string;
  try {
    targetUrl = Buffer.from(encodedUrl, "base64url").toString("utf8");
  } catch {
    // If decoding fails, redirect to the site root
    targetUrl = "/";
  }

  // Safety: only redirect to http/https URLs, never to file:// or javascript:
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = "/";
  }

  // Fire-and-forget tracking — never block the redirect
  void (async () => {
    try {
      const ip = extractClientIp(req.headers);
      const userAgent = req.headers.get("user-agent") ?? null;
      const messageId = await getMessageIdByTrackingId(trackingId);

      let geo = { country: null as string | null, city: null as string | null };
      if (ip) {
        geo = await lookupGeoIp(ip);
      }

      // Forward detection
      let isForward = false;
      const firstOpen = await getFirstOpenEvent(trackingId);
      if (firstOpen) {
        isForward = detectForward(firstOpen, ip ?? "", geo, userAgent);
      }

      await logTrackingEvent({
        messageId: messageId ?? undefined,
        trackingId,
        eventType: "clicked",
        linkId,
        targetUrl,
        ipAddress: ip ?? undefined,
        userAgent: userAgent ?? undefined,
        geoCountry: geo.country ?? undefined,
        geoCity: geo.city ?? undefined,
        isForward,
        raw: { source: "click_redirect" },
      });
    } catch (err) {
      console.error(
        `[email-tracking] click redirect logging failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  })();

  // Redirect immediately
  return NextResponse.redirect(targetUrl, {
    status: 302,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
