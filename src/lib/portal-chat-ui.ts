/**
 * Client-side helpers for the portal's message and assistant tabs. Pure, so
 * the failure paths (which the client must see) are testable on their own.
 */

/** The portal message route accepts at most this many characters. */
export const PORTAL_MESSAGE_MAX = 5_000;

const ESCALATION_PREFIX = "[Eskalation aus Portal-Chat]\n\n";
const TRUNCATED_NOTE = "(frühere Nachrichten gekürzt)\n";

export interface PortalChatLine {
  role: "user" | "bot";
  text: string;
}

/**
 * The escalation message for the firm: the most recent part of the chat that
 * fits the message limit (a long chat used to exceed it and fail).
 */
export function buildEscalationMessage(
  messages: PortalChatLine[],
  max: number = PORTAL_MESSAGE_MAX - 500
): string {
  const lines = messages.map((m) => `${m.role === "user" ? "Mandant" : "Bot"}: ${m.text}`);
  const budget = max - ESCALATION_PREFIX.length - TRUNCATED_NOTE.length;
  const kept: string[] = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const cost = line.length + (kept.length ? 1 : 0);
    if (used + cost <= budget) {
      kept.unshift(line);
      used += cost;
      continue;
    }
    // Always keep something of the latest message, shortened if needed.
    if (kept.length === 0) kept.unshift(`${line.slice(0, Math.max(0, budget - 1))}…`);
    break;
  }
  const truncated = kept.length < lines.length || lines.at(-1) !== kept.at(-1);
  return `${ESCALATION_PREFIX}${truncated ? TRUNCATED_NOTE : ""}${kept.join("\n")}`;
}

/** The message a failed portal response carries, else the given fallback. */
export function portalErrorText(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as { message?: unknown; error?: unknown };
    if (typeof d.message === "string" && d.message.trim()) return d.message;
    if (typeof d.error === "string" && d.error.trim() && d.error.includes(" ")) return d.error;
  }
  return fallback;
}
