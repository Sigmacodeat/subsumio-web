// How the AI in the client portal may answer a client (KI im Mandantenportal).
//
//  - "aus"      no AI: the portal has no assistant, the chat route makes no
//               model call.
//  - "entwurf"  DEFAULT. The AI only drafts an answer. The client is told the
//               message reached the firm; the draft waits on the client's
//               portal message until a lawyer reviews, edits and releases it
//               as a portal reply (/api/portal/reply). Nothing AI-written
//               reaches the client unreviewed — same principle as the
//               WhatsApp client queue.
//  - "direkt"   the AI answers the client directly. Only on a deliberate firm
//               choice; every answer is labelled as AI-generated, not
//               reviewed by the firm and no legal advice (AI Act Art. 50).
//
// The mode is a firm setting (Kanzlei-Einstellungen), read server-side from the
// firm's brain. Anything unset or unreadable resolves to "entwurf" — never to
// "direkt".

import type { GroundingMetadata } from "@/lib/citation-gate-client";

export type PortalAiMode = "aus" | "entwurf" | "direkt";

export const PORTAL_AI_MODES: readonly PortalAiMode[] = ["aus", "entwurf", "direkt"];

export const PORTAL_AI_MODE_DEFAULT: PortalAiMode = "entwurf";

/** Only an exactly stored "aus" or "direkt" leaves the default. */
export function resolvePortalAiMode(value: unknown): PortalAiMode {
  return value === "aus" || value === "direkt" ? value : PORTAL_AI_MODE_DEFAULT;
}

/** An AI draft stored on a client's portal message, waiting for the firm. */
export interface PortalAiDraft {
  text: string;
  grounded: boolean;
  /** Citation check of the draft, shown to the reviewing lawyer. */
  grounding?: GroundingMetadata;
  status: "pending" | "approved" | "discarded";
  created_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

/** The pending draft on a portal message's frontmatter, if any. */
export function pendingPortalAiDraft(
  fm: Record<string, unknown> | null | undefined
): PortalAiDraft | null {
  const d = fm?.ai_draft as Partial<PortalAiDraft> | undefined;
  if (!d || typeof d !== "object") return null;
  if (d.status !== "pending" || typeof d.text !== "string" || !d.text.trim()) return null;
  return {
    text: d.text,
    grounded: d.grounded === true,
    ...(d.grounding && typeof d.grounding === "object" ? { grounding: d.grounding } : {}),
    status: "pending",
    created_at: String(d.created_at ?? ""),
  };
}
