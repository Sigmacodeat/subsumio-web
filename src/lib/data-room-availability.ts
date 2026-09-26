/**
 * What a data room may still hand out. A document the host firm deleted, a
 * matter it archived or deleted, and firm-internal AML records are not served
 * to guests — sharing ends with the deletion, whatever the share list says.
 */
import { ENGINE_URL } from "@/lib/engine";
import { isTombstoned } from "@/lib/tombstone";
import { isStaffOnlyRecord } from "@/lib/staff-only-records";

export interface RoomPage {
  slug?: string;
  title?: string;
  type?: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
}

/** The matter of a room still open for guests? Unreadable → no (fail-closed). */
export async function roomMatterOpen(
  caseSlug: string,
  headers: Record<string, string>
): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const page = (await res.json()) as RoomPage;
    const status = page.frontmatter?.status;
    return status !== "archived" && status !== "tombstoned";
  } catch {
    return false;
  }
}

/** May this page (read from the host brain) be served out of the room? */
export function servableRoomDocument(
  page: RoomPage | null | undefined,
  role: "host" | "guest"
): boolean {
  if (!page) return false;
  if (isTombstoned(page)) return false;
  if (role === "guest" && isStaffOnlyRecord(page)) return false;
  return true;
}
