// Portal messages between a client and the firm, one engine page per message.
//
// Every message of a matter lives under one slug prefix, so the conversation
// is read with a prefix listing instead of a firm-wide list filtered in memory
// (which silently misses messages past the engine's list cap). The text is
// also kept in `frontmatter.message`, because page listings carry no content.

import { ENGINE_URL } from "@/lib/engine";
import { ENGINE_LIST_MAX } from "@/lib/engine-pages";
import { isTombstoned } from "@/lib/tombstone";
import type { BrainPage } from "@/lib/types";

export interface PortalMessage {
  id: string;
  text: string;
  sender: "client" | "lawyer";
  createdAt: string;
  /** A firm reply released from an AI draft ("mit KI erstellt, von der Kanzlei geprüft"). */
  aiAssisted?: boolean;
}

export function portalMessageSlugPrefix(caseSlug: string): string {
  return `portal-message/${caseSlug}/`;
}

/** The conversation of one matter, oldest first. */
export async function listPortalMessages(
  headers: Record<string, string>,
  caseSlug: string,
  max = 500
): Promise<PortalMessage[]> {
  const prefix = portalMessageSlugPrefix(caseSlug);
  const pages: BrainPage[] = [];
  for (let offset = 0; offset < max; offset += ENGINE_LIST_MAX) {
    const res = await fetch(
      `${ENGINE_URL}/api/pages?type=portal_message&slug_prefix=${encodeURIComponent(prefix)}&limit=${ENGINE_LIST_MAX}&offset=${offset}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error(`portal messages: engine ${res.status}`);
    const batch = (await res.json()) as BrainPage[];
    pages.push(...batch);
    if (batch.length < ENGINE_LIST_MAX) break;
  }

  const visible = pages.filter((p) => !isTombstoned(p));
  const messages = await Promise.all(
    visible.map(async (p): Promise<PortalMessage> => {
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      let text = typeof fm.message === "string" ? fm.message : "";
      // Messages written before the text was mirrored into frontmatter.
      if (!text) text = await readContent(headers, p.slug);
      return {
        id: p.slug,
        text,
        sender: fm.sender === "lawyer" ? "lawyer" : "client",
        createdAt: String(fm.created_at ?? p.created_at ?? ""),
        // Only this flag leaves the page — a pending AI draft on a client
        // message (ai_draft) is firm-internal and never part of the result.
        ...(fm.sender === "lawyer" && fm.ai_assisted === true ? { aiAssisted: true } : {}),
      };
    })
  );
  return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function readContent(headers: Record<string, string>, slug: string): Promise<string> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return "";
    return String(((await res.json()) as BrainPage).content ?? "");
  } catch {
    return "";
  }
}
