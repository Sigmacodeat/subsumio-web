/**
 * client-view.ts — what a signed-in client account ("Mandant (lesend)",
 * role client_viewer) may see: exactly what the token portal shows, built
 * with the same allowlist (`buildPortalCaseView`, `isPortalVisibleDocument`,
 * `isPortalVisibleInvoice`).
 *
 * The engine refuses every request signed for a client account, so these
 * reads use the firm's own brain headers and apply the gates here: the
 * matter's access rules must name the client (team entry or active grant, no
 * block), the matter is released for the portal and not archived.
 */

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { matterAccessLevel, type MatterPermissions } from "@/lib/matter-access";
import { isTombstoned } from "@/lib/tombstone";
import type { BrainPage } from "@/lib/types";

export interface ClientViewer {
  brainId: string;
  user: { id: string; role: string };
}

const MATTER_SCAN_MAX = 20_000;

/** May this client account see this matter in its client view? */
export function clientMayViewMatter(
  user: { id: string; role: string },
  page: { frontmatter?: Record<string, unknown> } | null | undefined
): boolean {
  if (!page || user.role !== "client_viewer") return false;
  const fm = page.frontmatter ?? {};
  if (isTombstoned(page as { frontmatter?: Record<string, unknown> })) return false;
  if (fm.status === "archived") return false;
  if (fm.portal_enabled !== true) return false;
  const level = matterAccessLevel(
    { userId: user.id, role: "client_viewer" },
    (fm.permissions ?? null) as MatterPermissions | null
  );
  return level !== "none";
}

/** The matters the client account may see (raw pages — whitelist before sending). */
export async function listClientMatters(viewer: ClientViewer): Promise<BrainPage[]> {
  const headers = engineHeadersForBrain(viewer.brainId);
  const pages = await listEnginePages(headers, "legal_case", MATTER_SCAN_MAX, { strict: true });
  return pages.filter((p) => clientMayViewMatter(viewer.user, p)) as unknown as BrainPage[];
}

/**
 * One matter for the client account, or null (unknown, not released, or not
 * the client's). Never distinguishes the cases — a foreign matter looks
 * exactly like a missing one.
 */
export async function readClientMatter(
  viewer: ClientViewer,
  caseSlug: string
): Promise<{ page: BrainPage; headers: Record<string, string> } | null> {
  const headers = engineHeadersForBrain(viewer.brainId);
  const path = caseSlug.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`engine ${res.status}`);
  const page = (await res.json()) as BrainPage;
  const type = page.type ?? (page.frontmatter as Record<string, unknown> | undefined)?.type;
  if (type !== "legal_case") return null;
  if (!clientMayViewMatter(viewer.user, page)) return null;
  return { page, headers };
}
