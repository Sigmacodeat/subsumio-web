import { deadlinesIcsFor } from "@/lib/deadlines-ics";
import { resolveFeedToken } from "@/lib/feed-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/<userId>.<secret>/fristen.ics — the personal deadline
 * subscription.
 *
 * Deliberately without a session: Outlook, Apple Kalender and Google Kalender
 * fetch a subscribed calendar with a bare HTTP request. The secret in the path
 * is the credential; only its SHA-256 is stored, and the link can be revoked in
 * the settings. The feed carries the person's own identity into the engine, so
 * it shows exactly the matters they may see.
 */
export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const deny = () =>
    new Response("Dieser Kalender-Link gilt nicht mehr.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });

  const auth = await resolveFeedToken(token ?? "");
  if (!auth.ok) {
    if (auth.status === 429) {
      return new Response("Zu viele Abrufe. Bitte später erneut versuchen.", {
        status: 429,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return deny();
  }

  let ics: string;
  try {
    ics = await deadlinesIcsFor(auth.headers);
  } catch {
    return new Response("Kalender derzeit nicht verfügbar.", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="subsumio-fristen.ics"',
      "Cache-Control": "no-store, max-age=0",
      // The URL is a credential: keep it out of caches and referrers.
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
