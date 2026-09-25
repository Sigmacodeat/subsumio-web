import { z } from "zod";
import { createHandler, apiError, type RouteContext } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { getDataRoomStore } from "@/lib/data-rooms";
import { roomRole } from "@/lib/data-room-access";

import { applyUploadedFileHeaders } from "@/lib/file-response-headers";
import { logger } from "@/lib/logger";
const log = logger("api/data-rooms/document");

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const querySchema = z.object({
  slug: z.string().min(1).max(300),
  /** "file": the original upload; "text": the extracted text. */
  format: z.enum(["file", "text"]).default("file"),
  inline: z.enum(["0", "1"]).optional(),
});

/**
 * One shared document of a data room, for its host or an active guest. Only
 * documents listed in the room are served; they are read from the host
 * firm's brain on the server, and every access lands in the host's audit log.
 */
export const GET = createHandler(
  { action: "brain.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query, req) => {
    const id = String(
      ((await (req as unknown as RouteContext).params) as { id?: string }).id ?? ""
    );
    const store = getDataRoomStore();
    const room = await store.getRoom(id);
    const role = room ? await roomRole(ctx, room) : null;
    if (!room || !role || !query) return apiError("not_found", "Datenraum nicht gefunden", 404);
    const shared = (await store.documents(room.id)).find((d) => d.docSlug === query.slug);
    if (!shared) return apiError("not_found", "Dokument nicht freigegeben", 404);

    // Hosts read with their own identity (matter scope applies); only guests
    // of another firm read through the host brain on the server.
    const hostHeaders =
      role.kind === "host" ? ctx.headers : engineHeadersForBrain(room.hostBrainId);
    const path = query.slug.split("/").map(encodeURIComponent).join("/");
    try {
      if (query.format === "text") {
        const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(query.slug)}`, {
          headers: hostHeaders,
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return apiError("not_found", "Dokument nicht gefunden", 404);
        const page = (await res.json()) as { title?: string; content?: string };
        audit();
        return Response.json({ title: page.title ?? shared.title, content: page.content ?? "" });
      }
      const res = await fetch(`${ENGINE_URL}/api/files/${path}`, {
        headers: hostHeaders,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return apiError("not_found", "Datei nicht gefunden", 404);
      const headers = new Headers();
      applyUploadedFileHeaders(headers, {
        contentType: res.headers.get("content-type"),
        contentDisposition: res.headers.get("content-disposition"),
        wantInline: query.inline === "1",
      });
      const cl = res.headers.get("content-length");
      if (cl) headers.set("Content-Length", cl);
      headers.set("Cache-Control", "private, no-store");
      audit();
      return new Response(res.body, { status: 200, headers });
    } catch (err) {
      log.error("data room document failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return apiError("not_found", "Dokument nicht verfügbar", 404);
    }

    function audit() {
      void logAudit("data_room.access", "data_room", {
        entityId: room!.id,
        brainId: room!.hostBrainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        details: { document: query!.slug, format: query!.format, role: role!.kind },
      });
    }
  }
);
