import { z } from "zod";
import { createHandler, apiError, apiSuccess, type RouteContext } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { sendMail, siteUrl } from "@/lib/mail";
import { getDataRoomStore } from "@/lib/data-rooms";
import { roomRole } from "@/lib/data-room-access";

export const dynamic = "force-dynamic";

async function roomId(req: Request): Promise<string> {
  return String(((await (req as unknown as RouteContext).params) as { id?: string }).id ?? "");
}

const inviteSchema = z.object({
  email: z.string().trim().email().max(200),
  expires_at: z.string().datetime().optional(),
});

const revokeSchema = z.object({ member_id: z.string().min(1).max(100) });

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Invite a person of another firm; they get a link to accept with their own account. */
export const POST = createHandler(
  { action: "brain.write", rateTier: "standard", body: inviteSchema },
  async (ctx, body, _query, req) => {
    const store = getDataRoomStore();
    const room = await store.getRoom(await roomId(req));
    const role = room ? await roomRole(ctx, room) : null;
    if (!room || !role) return apiError("not_found", "Datenraum nicht gefunden", 404);
    if (role.kind !== "host" || !role.canManage) {
      return apiError("forbidden", "Nur die Kanzlei der Akte lädt ein.", 403);
    }
    if (body.expires_at && Date.parse(body.expires_at) <= Date.now()) {
      return apiError("expired", "Das Ablaufdatum liegt in der Vergangenheit.", 400);
    }

    const { member, token } = await store.invite({
      roomId: room.id,
      email: body.email,
      expiresAt: body.expires_at,
      invitedBy: ctx.user.id,
    });
    const link = `${siteUrl()}/dashboard/shared-spaces/accept?token=${encodeURIComponent(token)}`;
    const until = body.expires_at
      ? ` Der Zugang gilt bis ${new Date(body.expires_at).toLocaleDateString("de-AT")}.`
      : "";
    const mail = await sendMail({
      to: member.email,
      subject: `${room.hostFirmName} teilt Unterlagen mit Ihnen: ${room.title}`,
      text: `${room.hostFirmName} hat Ihnen in Subsumio Unterlagen zur Akte „${room.title}“ freigegeben.${until}\n\nZum Datenraum: ${link}\n\nSie melden sich mit dieser E-Mail-Adresse an; der Link gilt nur für Sie.`,
      html: `<p>${escapeHtml(room.hostFirmName)} hat Ihnen in Subsumio Unterlagen zur Akte „${escapeHtml(room.title)}“ freigegeben.${escapeHtml(until)}</p><p><a href="${escapeHtml(link)}">Zum Datenraum</a></p><p>Sie melden sich mit dieser E-Mail-Adresse an; der Link gilt nur für Sie.</p>`,
    });
    void logAudit("data_room.invite", "data_room", {
      entityId: room.id,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: { email: member.email, expires_at: body.expires_at, mail_sent: mail.sent },
    });
    return apiSuccess({
      member_id: member.id,
      mail_sent: mail.sent,
      // Shown to the inviter when no mail provider is configured, so they can pass it on.
      ...(mail.sent ? {} : { link }),
    });
  }
);

/** Take back a person's access or invitation. */
export const DELETE = createHandler(
  { action: "brain.write", rateTier: "standard", body: revokeSchema },
  async (ctx, body, _query, req) => {
    const store = getDataRoomStore();
    const room = await store.getRoom(await roomId(req));
    const role = room ? await roomRole(ctx, room) : null;
    if (!room || !role) return apiError("not_found", "Datenraum nicht gefunden", 404);
    if (role.kind !== "host" || !role.canManage) {
      return apiError("forbidden", "Nur die Kanzlei der Akte entzieht Zugänge.", 403);
    }
    const member = (await store.members(room.id)).find((m) => m.id === body.member_id);
    if (!member) return apiError("not_found", "Zugang nicht gefunden", 404);
    await store.revoke(member.id);
    void logAudit("data_room.revoke", "data_room", {
      entityId: room.id,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: { email: member.email },
    });
    return apiSuccess({ member_id: member.id, status: "revoked" });
  }
);
