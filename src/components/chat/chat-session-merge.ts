import type { ChatContextType, ChatSession } from "@/components/chat/chat-types";
import type { ServerChatSession } from "@/lib/chat-server-sync";

/**
 * The conversation list a lawyer sees: what this browser has, plus what only
 * the server has (another device, or a colleague's shared thread). Server
 * entries are marked `remote` and are fetched when opened.
 *
 * Matter isolation is kept: with a matter selected only that matter's threads
 * show; without one, only threads that belong to no matter.
 */
export function mergeSessionLists(
  local: ChatSession[],
  remote: ServerChatSession[],
  opts: { caseSlug?: string; contextType: ChatContextType }
): ChatSession[] {
  const known = new Set(local.map((s) => s.id));
  const serverOnly = remote
    .filter((r) => !known.has(r.id))
    .filter((r) => (opts.caseSlug ? r.case_slug === opts.caseSlug : !r.case_slug))
    .map(
      (r): ChatSession => ({
        id: r.id,
        title: r.shared && r.owner_name ? `${r.title} · ${r.owner_name}` : r.title,
        contextType: r.case_slug ? "case" : opts.contextType,
        caseSlug: r.case_slug,
        createdAt: r.updated_at,
        updatedAt: r.updated_at,
        messageCount: r.message_count,
        remote: { ownerId: r.owner_id, ownerName: r.owner_name, shared: r.shared },
      })
    );
  return [...local, ...serverOnly].sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || "")
  );
}
