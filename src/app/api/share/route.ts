import { createHandler, apiError } from "@/lib/api-handler";
import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { stampInboundEntryBestEffort } from "@/lib/inbound-register-stamp";
import { randomUUID } from "node:crypto";
import { matterAccessLevel, type MatterPermissions } from "@/lib/matter-access";
import { isStaffRole } from "@/lib/team-visibility";

const shareSchema = z
  .object({
    text: z.string().max(10_000).optional(),
    url: z.string().url().max(2_000).optional(),
    title: z.string().max(500).optional(),
    caseSlug: z.string().max(200).optional(),
  })
  .refine((data) => data.text || data.url, { message: "Either text or url is required" });

/**
 * Share-into-Subsumio (share sheet / copy target): the shared text or link is
 * stored as a `shared_item` page — on the target matter when given — and
 * stamped into the inbound register, so nothing shared is ever lost.
 */
export const POST = createHandler(
  {
    action: "share.receive",
    rateTier: "standard",
    body: shareSchema,
    audit: (ctx, body) => ({
      action: "share.receive" as const,
      entityType: "share",
      entityId: ctx.user.id,
      details: {
        hasText: Boolean(body.text),
        hasUrl: Boolean(body.url),
        title: body.title,
        caseSlug: body.caseSlug,
      },
    }),
  },
  async (ctx, body) => {
    const { caseSlug } = body;

    // Sharing writes into the firm brain and the inbound register — firm staff
    // only. Client accounts hand in documents through the portal upload.
    if (!isStaffRole(ctx.user.role)) {
      return apiError("forbidden", "Keine Berechtigung zum Ablegen von Inhalten", 403);
    }

    if (caseSlug) {
      // The matter must exist, be visible to this user (ethical walls, matter
      // scope) and the user needs write access on it — a read-only grant is
      // not enough to file content into the matter.
      const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!caseRes?.ok) return apiError("case_not_found", "Akte nicht gefunden", 404);
      const casePage = (await caseRes.json().catch(() => null)) as {
        type?: string;
        frontmatter?: { type?: string; permissions?: MatterPermissions };
      } | null;
      if ((casePage?.type ?? casePage?.frontmatter?.type) !== "legal_case") {
        return apiError("case_not_found", "Akte nicht gefunden", 404);
      }
      const level = matterAccessLevel(
        { userId: ctx.user.id, role: ctx.user.role },
        casePage?.frontmatter?.permissions
      );
      if (level !== "write") {
        return apiError("forbidden", "Kein Schreibrecht auf diese Akte", 403);
      }
    }

    const shareId = `shared/${caseSlug ? `${caseSlug}/` : "eingang/"}${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const title =
      body.title?.trim() || body.url || (body.text ?? "").slice(0, 80) || "Geteilter Inhalt";
    const content = [
      body.title ? `**${body.title}**\n` : "",
      body.text ?? "",
      body.url ? `\n${body.url}` : "",
    ]
      .join("")
      .trim();

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: shareId,
        title: `Geteilt: ${title.slice(0, 120)}`,
        type: "shared_item",
        content,
        frontmatter: {
          type: "shared_item",
          case_slug: caseSlug,
          url: body.url,
          shared_by: ctx.user.email,
          created_at: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return apiError("share_not_saved", "Geteilter Inhalt konnte nicht gespeichert werden", 502);
    }

    // Posteingangsbuch: ein geteilter Inhalt ist ein Eingang wie jeder andere.
    await stampInboundEntryBestEffort(
      ctx.headers,
      {
        channel: "share",
        subject: title,
        senderName: ctx.user.name ?? ctx.user.email,
        caseSlug,
        documentSlug: shareId,
      },
      ctx.brainId
    );

    return Response.json({
      ok: true,
      shareId,
      redirect: caseSlug
        ? `/dashboard/cases/${caseSlug}?shared=${encodeURIComponent(shareId)}`
        : `/dashboard?shared=${encodeURIComponent(shareId)}`,
    });
  }
);
