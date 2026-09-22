import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { isVideoConfigured, videoLinkFor } from "@/lib/video-link";

const bodySchema = z.object({ slug: z.string().min(1).max(300) });

/**
 * POST /api/legal/appointments/video-link — erzeugt (idempotent) den
 * Jitsi-Raum-Link für einen Termin und persistiert ihn im Frontmatter.
 * Ohne JITSI_DOMAIN → ehrliches 503 not_configured.
 */
export const POST = createHandler(
  { action: "brain.write", rateTier: "standard", body: bodySchema },
  async (ctx, body) => {
    if (!isVideoConfigured()) {
      return apiError(
        "video_not_configured",
        "Video-Termine sind nicht konfiguriert (JITSI_DOMAIN fehlt)",
        503
      );
    }
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("appointment_not_found", "Termin nicht gefunden", 404);
    const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
    const existing = page.frontmatter?.video_link;
    if (typeof existing === "string" && existing.startsWith("https://")) {
      return Response.json({ video_link: existing });
    }
    const link = videoLinkFor(body.slug);
    if (!link) return apiError("video_not_configured", "JITSI_DOMAIN fehlt", 503);
    const patch = await enginePatchPage(ctx.headers, {
      slug: body.slug,
      frontmatter: { video_link: link },
    });
    if (!patch.ok) {
      return apiError("video_link_failed", "Video-Link konnte nicht gespeichert werden", 502);
    }
    return Response.json({ video_link: link });
  }
);
