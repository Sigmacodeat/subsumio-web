/**
 * Browser side of the server-kept Copilot conversations (/api/chat/sessions).
 * IndexedDB stays the fast local copy; the server copy follows each finished
 * answer, is auditable, survives a device change and can be shared.
 */
import { csrfFetch } from "@/lib/csrf";
import { unwrapApiBody } from "@/lib/api-body";
import type { ChatMessage } from "@/components/chat/chat-types";

export interface ServerChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ServerChatSession {
  id: string;
  owner_id: string;
  owner_name: string;
  title: string;
  case_slug?: string;
  message_count: number;
  shared: boolean;
  updated_at: string;
  messages?: ServerChatMessage[];
}

const MAX_CONTENT_CHARS = 20_000;

/** The part of a conversation worth keeping: finished, non-empty turns. */
export function serverMessages(messages: ChatMessage[]): ServerChatMessage[] {
  return messages
    .filter((m) => !m.error && !m.isStreaming && m.content.trim().length > 0)
    .filter(
      (m): m is ChatMessage & { role: "user" | "assistant" } =>
        m.role === "user" || m.role === "assistant"
    )
    .slice(-300)
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content.slice(0, MAX_CONTENT_CHARS),
      createdAt: m.createdAt,
    }));
}

export async function saveSessionToServer(input: {
  id: string;
  title: string;
  caseSlug?: string;
  messages: ChatMessage[];
}): Promise<boolean> {
  const messages = serverMessages(input.messages);
  if (messages.length === 0) return false;
  try {
    const res = await csrfFetch("/api/chat/sessions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: input.id,
        title: input.title.slice(0, 200),
        ...(input.caseSlug ? { case_slug: input.caseSlug } : {}),
        messages,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchServerSession(
  id: string,
  owner?: string
): Promise<ServerChatSession | null> {
  try {
    const params = new URLSearchParams({ id, ...(owner ? { owner } : {}) });
    const res = await fetch(`/api/chat/sessions?${params}`);
    if (!res.ok) return null;
    return unwrapApiBody<ServerChatSession>(await res.json());
  } catch {
    return null;
  }
}

/** Shares a session with colleagues who may see its matter; returns its link. */
export async function shareSession(id: string): Promise<string | null> {
  try {
    const res = await csrfFetch("/api/chat/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, shared: true }),
    });
    if (!res.ok) return null;
    const body = unwrapApiBody<{ owner_id: string }>(await res.json());
    const params = new URLSearchParams({ session: id, owner: body.owner_id });
    return `${window.location.origin}/dashboard/chat?${params}`;
  } catch {
    return null;
  }
}
