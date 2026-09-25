// Shared engine HTTP client for the chat/WhatsApp lanes. Extracted from
// legal-chat/actions.ts and whatsapp-natural-chat.ts, which each carried a
// byte-identical copy of engineRequest + listPages. One source of truth here
// keeps the two chat entry points from drifting (e.g. differing timeouts or
// matter-scope header handling).
import { lawyerFacingAnswer } from "./engine-degraded";
import {
  ENGINE_URL,
  engineHeadersForBrain,
  engineHeadersForBrainWithMatterScope,
} from "@/lib/engine";
import { collectSSEChunks } from "@/lib/sse-stream";
import type { BrainPage } from "@/lib/types";

export interface EnginePageInput {
  slug: string;
  title: string;
  type?: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
  merge?: boolean;
}

export async function engineRequest<T>(
  brainId: string,
  path: string,
  init?: RequestInit,
  matterScope?: string[] | "all"
): Promise<T> {
  const headers = matterScope
    ? engineHeadersForBrainWithMatterScope(brainId, matterScope)
    : engineHeadersForBrain(brainId);
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const error = await res.text().catch(() => "");
    throw new Error(error || `Engine HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Engine returned non-JSON response: ${text.slice(0, 200)}`);
  }
}

/**
 * Up to `limit` pages of a type. Pages through the engine's keyset cursor
 * (`x-next-cursor`) instead of trusting "short batch means done" — matter
 * scope and tombstones shrink batches below the limit without meaning the
 * list ended. `limit` bounds the total rows scanned (including filtered).
 */
export async function listPages(brainId: string, type: string, limit = 200): Promise<BrainPage[]> {
  const headers = engineHeadersForBrain(brainId);
  const out: BrainPage[] = [];
  let fetched = 0;
  let cursor: string | undefined;
  let iterations = 0;
  for (;;) {
    if (++iterations > 1000) break;
    const want = Math.min(100, limit - fetched);
    if (want <= 0) break;
    const pageParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : `&offset=${fetched}`;
    const res = await fetch(
      `${ENGINE_URL}/api/pages?type=${encodeURIComponent(type)}&limit=${want}${pageParam}`,
      {
        headers: { "Content-Type": "application/json", ...headers },
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!res.ok) {
      const error = await res.text().catch(() => "");
      throw new Error(error || `Engine HTTP ${res.status}`);
    }
    const result = (await res.json()) as unknown;
    const batch = Array.isArray(result) ? (result as BrainPage[]) : [];
    fetched += batch.length;
    out.push(...batch);
    const next = res.headers.get("x-next-cursor");
    if (next && next !== cursor) {
      cursor = next;
      continue;
    }
    if (batch.length < want) break;
  }
  return out;
}

// mode differs deliberately per call site: the direct chat lane uses
// "conservative" (tighter token budget), the WhatsApp lane uses "balanced"
// (relational retrieval) — see CLAUDE.md's Search Mode table.
export async function think(
  brainId: string,
  query: string,
  matterScope?: string[] | "all",
  mode: "conservative" | "balanced" | "tokenmax" = "conservative"
): Promise<string> {
  const headers = matterScope
    ? engineHeadersForBrainWithMatterScope(brainId, matterScope)
    : engineHeadersForBrain(brainId);
  const res = await fetch(`${ENGINE_URL}/api/think`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ query, mode }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Brain-Q&A fehlgeschlagen: HTTP ${res.status}`);
  const contentType = res.headers.get("Content-Type") || "";
  if (!contentType.includes("text/event-stream")) {
    const data = (await res.json().catch(() => ({}))) as { answer?: string };
    return data.answer ? lawyerFacingAnswer(data.answer) : "Keine Antwort erhalten.";
  }
  if (!res.body) return "Keine Antwort erhalten.";
  const answer = await collectSSEChunks(res.body);
  return answer.trim() ? lawyerFacingAnswer(answer.trim()) : "Keine Antwort erhalten.";
}
