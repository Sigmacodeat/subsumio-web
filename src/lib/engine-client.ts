// Shared engine HTTP client for the chat/WhatsApp lanes. Extracted from
// legal-chat/actions.ts and whatsapp-natural-chat.ts, which each carried a
// byte-identical copy of engineRequest + listPages. One source of truth here
// keeps the two chat entry points from drifting (e.g. differing timeouts or
// matter-scope header handling).
import { AsyncLocalStorage } from "node:async_hooks";
import { lawyerFacingAnswer } from "./engine-degraded";
import {
  ENGINE_URL,
  engineHeadersForBrain,
  engineHeadersForBrainWithMatterScope,
  type EngineCaller,
} from "@/lib/engine";
import { collectSSEAnswer } from "@/lib/sse-stream";
import type { BrainPage } from "@/lib/types";

/**
 * Who a chat-lane engine call is made for: the firm member bound to the
 * WhatsApp number plus the number's matter scope. The engine applies that
 * member's walls and document ACL (KI4-04).
 */
export interface EngineSenderScope {
  matterScope: string[] | "all";
  caller: EngineCaller;
}

const senderScope = new AsyncLocalStorage<EngineSenderScope>();

/**
 * Run `fn` with every engine-client call (engineRequest, listPages, think)
 * made on behalf of `scope`. The WhatsApp staff handlers run inside this, so
 * no helper deep in the handler can fall back to firm-wide headers.
 */
export function withEngineSender<T>(scope: EngineSenderScope, fn: () => Promise<T>): Promise<T> {
  return senderScope.run(scope, fn);
}

/** Headers for a chat-lane call: the explicit scope, else the ambient sender, else firm-wide. */
function chatEngineHeaders(brainId: string, scope?: EngineSenderScope): Record<string, string> {
  const effective = scope ?? senderScope.getStore();
  return effective
    ? engineHeadersForBrainWithMatterScope(brainId, effective.matterScope, effective.caller)
    : engineHeadersForBrain(brainId);
}

export interface EnginePageInput {
  slug: string;
  title: string;
  type?: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
  merge?: boolean;
  /** Create-only: the engine refuses (409 page_exists) instead of replacing a stored page. */
  if_absent?: boolean;
}

export async function engineRequest<T>(
  brainId: string,
  path: string,
  init?: RequestInit,
  scope?: EngineSenderScope
): Promise<T> {
  const headers = chatEngineHeaders(brainId, scope);
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
  const headers = chatEngineHeaders(brainId);
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

/** A brain answer as the engine finally stands behind it. */
export interface ThinkAnswer {
  /** Lawyer-facing answer text (the verified `final_answer` when the engine revised the draft). */
  answer: string;
  /** Engine warning codes (GUARDRAIL_*, RETRIEVAL_FAILED, …). */
  warnings: string[];
}

const NO_ANSWER = "Keine Antwort erhalten.";

// mode differs deliberately per call site: the direct chat lane uses
// "conservative" (tighter token budget), the WhatsApp lane uses "balanced"
// (relational retrieval) — see CLAUDE.md's Search Mode table.
export async function think(
  brainId: string,
  query: string,
  scope: EngineSenderScope,
  mode: "conservative" | "balanced" | "tokenmax" = "conservative"
): Promise<ThinkAnswer> {
  const headers = chatEngineHeaders(brainId, scope);
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
    const data = (await res.json().catch(() => ({}))) as {
      answer?: string;
      warnings?: unknown;
    };
    const warnings = Array.isArray(data.warnings)
      ? data.warnings.filter((w): w is string => typeof w === "string")
      : [];
    return { answer: data.answer ? lawyerFacingAnswer(data.answer) : NO_ANSWER, warnings };
  }
  if (!res.body) return { answer: NO_ANSWER, warnings: [] };
  // The final event's `final_answer` replaces the streamed first draft (KI5-02).
  const { answer, warnings } = await collectSSEAnswer(res.body);
  return { answer: answer.trim() ? lawyerFacingAnswer(answer.trim()) : NO_ANSWER, warnings };
}
