/**
 * Who is who in a data room (lib/data-rooms.ts):
 *  - host: signed in to the firm that owns the room (same tenant and brain);
 *    may manage it when they may change the matter (matter-access.ts);
 *  - guest: a member of another firm whose accepted invitation is active.
 */
import { ENGINE_URL, type EngineContext } from "@/lib/engine";
import { tenantIdForUser } from "@/lib/tenants";
import { matterAccessLevel, type MatterPermissions } from "@/lib/matter-access";
import {
  getDataRoomStore,
  memberActive,
  type DataRoom,
  type DataRoomMember,
} from "@/lib/data-rooms";

export type RoomRole =
  | { kind: "host"; canManage: boolean }
  | { kind: "guest"; member: DataRoomMember };

type Ctx = Pick<EngineContext, "headers" | "brainId" | "user">;

/** The matter as the caller sees it through the engine (walls apply), or null. */
export async function readCase(
  ctx: Pick<EngineContext, "headers">,
  caseSlug: string
): Promise<{ title: string; permissions: MatterPermissions } | null> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, {
    headers: ctx.headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const page = (await res.json()) as {
    title?: string;
    type?: string;
    frontmatter?: Record<string, unknown>;
  };
  const fm = page.frontmatter ?? {};
  if ((page.type ?? fm.type) !== "legal_case") return null;
  const perms = fm.permissions;
  return {
    title: String(page.title ?? caseSlug),
    permissions: perms && typeof perms === "object" ? (perms as MatterPermissions) : {},
  };
}

/** Whether the caller may create or manage the data room of this matter. */
export async function mayManageCase(ctx: Ctx, caseSlug: string): Promise<boolean> {
  if (ctx.user.role === "client_viewer") return false;
  const matter = await readCase(ctx, caseSlug);
  if (!matter) return false;
  return (
    matterAccessLevel({ userId: ctx.user.id, role: ctx.user.role }, matter.permissions) === "write"
  );
}

export async function roomRole(ctx: Ctx, room: DataRoom): Promise<RoomRole | null> {
  const tenant = tenantIdForUser(ctx.user);
  if (tenant && tenant === room.hostTenantId && ctx.brainId === room.hostBrainId) {
    return { kind: "host", canManage: await mayManageCase(ctx, room.caseSlug) };
  }
  if (!tenant) return null;
  const memberships = await getDataRoomStore().membershipsOf(tenant);
  const member = memberships.find((m) => m.room.id === room.id && memberActive(m.member))?.member;
  return member ? { kind: "guest", member } : null;
}
