"use client";

/**
 * Client side of the AI-text release (server: POST /api/ai-output/release,
 * checked by /api/word-export, e-mail and portal). The client never decides
 * whether text is released — it only carries the server-signed token.
 */
import { csrfFetch } from "@/lib/csrf";

export interface ReleaseSummary {
  state: string;
  citations_verified: number;
  citations_unverified: number;
  warning: string | null;
  override_required: boolean;
}

export type ReleaseResult =
  | { kind: "released"; token: string; summary: ReleaseSummary; releasedBy?: string }
  | { kind: "reason_required"; message: string; summary?: ReleaseSummary }
  | { kind: "forbidden"; message: string }
  | { kind: "error"; message: string };

export const RELEASE_FORBIDDEN_MESSAGE =
  "Freigeben dürfen nur Anwält:innen und Administrator:innen. Bitte den Entwurf zur Freigabe einreichen.";

export async function requestAiRelease(input: {
  content?: string;
  slug?: string;
  title?: string;
  overrideReason?: string;
}): Promise<ReleaseResult> {
  let res: Response;
  try {
    res = await csrfFetch("/api/ai-output/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: input.content,
        slug: input.slug,
        title: input.title,
        override_reason: input.overrideReason?.trim() || undefined,
      }),
    });
  } catch {
    return { kind: "error", message: "Keine Verbindung — bitte erneut versuchen." };
  }
  const json = (await res.json().catch(() => ({}))) as {
    data?: ReleaseSummary & { release?: string; released_by?: string };
    error?: string;
    code?: string;
    details?: ReleaseSummary;
  };
  if (res.ok && json.data?.release) {
    return {
      kind: "released",
      token: json.data.release,
      summary: json.data,
      releasedBy: json.data.released_by,
    };
  }
  if (res.status === 422 && json.code === "override_reason_required") {
    return { kind: "reason_required", message: json.error ?? "", summary: json.details };
  }
  if (res.status === 403) return { kind: "forbidden", message: RELEASE_FORBIDDEN_MESSAGE };
  return {
    kind: "error",
    message: json.error || "Die Freigabe ist fehlgeschlagen. Bitte erneut versuchen.",
  };
}

/** True when an export/send answer means "release this AI text first". */
export async function releaseRequiredMessage(res: Response): Promise<string | null> {
  if (res.status !== 403) return null;
  const json = (await res
    .clone()
    .json()
    .catch(() => null)) as { code?: string; error?: string } | null;
  return json?.code === "release_required" ? (json.error ?? "Freigabe erforderlich") : null;
}
