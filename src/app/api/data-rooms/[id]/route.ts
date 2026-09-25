import { z } from "zod";
import { createHandler, apiError, apiSuccess, type RouteContext } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { logAudit } from "@/lib/audit";
import { getDataRoomStore } from "@/lib/data-rooms";
import { roomRole } from "@/lib/data-room-access";

export const dynamic = "force-dynamic";

async function roomId(req: Request): Promise<string> {
  return String(((await (req as unknown as RouteContext).params) as { id?: string }).id ?? "");
}

/**
 * The room as the caller may see it. Hosts get the members and the matter's
 * documents to choose from; guests get the shared documents and nothing else.
 */
export const GET = createHandler(
  { action: "brain.read", rateTier: "standard" },
  async (ctx, _body, _query, req) => {
    const store = getDataRoomStore();
    const room = await store.getRoom(await roomId(req));
    const role = room ? await roomRole(ctx, room) : null;
    if (!room || !role) return apiError("not_found", "Datenraum nicht gefunden", 404);

    const shared = await store.documents(room.id);
    const base = {
      id: room.id,
      title: room.title,
      host_firm: room.hostFirmName,
      role: role.kind,
      documents: shared.map((d) => ({ slug: d.docSlug, title: d.title, added_at: d.addedAt })),
    };
    if (role.kind === "guest") {
      return apiSuccess({ ...base, expires_at: role.member.expiresAt });
    }

    const members = await store.members(room.id);
    // The matter's documents the host can pick from (walls apply: ctx.headers).
    const matterDocs = role.canManage
      ? // The whole document type, not the newest N of the firm: the matter
        // filter runs afterwards, so a cap would hide older matter documents.
        (await listEnginePages(ctx.headers, "document", 50_000))
          .filter((p) => p.frontmatter?.case_slug === room.caseSlug)
          .map((p) => ({ slug: p.slug, title: p.title }))
      : [];
    return apiSuccess({
      ...base,
      case_slug: room.caseSlug,
      can_manage: role.canManage,
      members: members.map((m) => ({
        id: m.id,
        email: m.email,
        status: m.status,
        expires_at: m.expiresAt,
        firm: m.guestFirmName,
        invited_at: m.invitedAt,
        accepted_at: m.acceptedAt,
      })),
      matter_documents: matterDocs,
    });
  }
);

const shareSchema = z.object({ doc_slugs: z.array(z.string().min(1).max(300)).max(500) });

/** Set which documents of the matter are shared in the room. */
export const PUT = createHandler(
  { action: "brain.write", rateTier: "standard", body: shareSchema },
  async (ctx, body, _query, req) => {
    const store = getDataRoomStore();
    const room = await store.getRoom(await roomId(req));
    const role = room ? await roomRole(ctx, room) : null;
    if (!room || !role) return apiError("not_found", "Datenraum nicht gefunden", 404);
    if (role.kind !== "host" || !role.canManage) {
      return apiError("forbidden", "Nur die Kanzlei der Akte gibt Dokumente frei.", 403);
    }

    // Only documents of this matter, read as the caller (walls apply).
    const docs: Array<{ docSlug: string; title: string }> = [];
    for (const slug of [...new Set(body.doc_slugs)]) {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return apiError("document_not_found", `Dokument nicht gefunden: ${slug}`, 400);
      const page = (await res.json()) as { title?: string; frontmatter?: Record<string, unknown> };
      if (page.frontmatter?.case_slug !== room.caseSlug) {
        return apiError("not_in_matter", `Das Dokument gehört nicht zu dieser Akte: ${slug}`, 400);
      }
      docs.push({ docSlug: slug, title: String(page.title ?? slug) });
    }
    await store.setDocuments(room.id, docs, ctx.user.id);
    void logAudit("data_room.share", "data_room", {
      entityId: room.id,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: { documents: docs.map((d) => d.docSlug) },
    });
    return apiSuccess({ id: room.id, documents: docs.length });
  }
);
