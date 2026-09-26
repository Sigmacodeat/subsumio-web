/**
 * Parser for the /api/think answer stream (Server-Sent Events).
 *
 * Event shapes (engine + web route): `{chunk}` streams answer text,
 * `{final_answer}` replaces the streamed draft after verification,
 * `{grounding}` carries the server-side citation check, `{error}` reports a
 * failure after the stream opened, and `[DONE]` ends the stream. Lines can be
 * split across network packets, so input is buffered up to the line end.
 */

export interface ThinkGrounding {
  citations_verified: number;
  citations_unverified: number;
  corpus_checked?: boolean;
  has_unverified?: boolean;
  warning?: string;
  grounded_citations?: Array<{ code: string; paragraph: string; verified: boolean }>;
}

export interface ThinkStreamState {
  answer: string;
  /** Verification rewrote the answer (final_answer replaced the draft). */
  revised: boolean;
  grounding?: ThinkGrounding;
  error?: string;
  done: boolean;
}

export interface ThinkStreamParser {
  /** Feed decoded text; returns true when the visible answer changed. */
  push(text: string): boolean;
  /** Flush a last line without trailing newline. */
  end(): boolean;
  readonly state: ThinkStreamState;
}

export function createThinkStreamParser(): ThinkStreamParser {
  const state: ThinkStreamState = { answer: "", revised: false, done: false };
  let buffer = "";

  function handle(raw: string): boolean {
    const data = raw.trim();
    if (!data) return false;
    if (data === "[DONE]") {
      state.done = true;
      return false;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      // Never append raw protocol text to the answer.
      return false;
    }
    let changed = false;
    if (typeof parsed.chunk === "string" && parsed.chunk) {
      state.answer += parsed.chunk;
      changed = true;
    }
    if (typeof parsed.final_answer === "string" && parsed.final_answer) {
      state.answer = parsed.final_answer;
      state.revised = true;
      changed = true;
    }
    if (parsed.grounding && typeof parsed.grounding === "object") {
      state.grounding = parsed.grounding as ThinkGrounding;
    }
    if (typeof parsed.error === "string" && parsed.error) state.error = parsed.error;
    return changed;
  }

  function lines(final: boolean): boolean {
    const parts = buffer.split("\n");
    buffer = final ? "" : (parts.pop() ?? "");
    let changed = false;
    for (const line of parts) {
      if (line.startsWith("data:")) changed = handle(line.slice(5)) || changed;
    }
    return changed;
  }

  return {
    push(text: string) {
      buffer += text;
      return lines(false);
    },
    end() {
      buffer += "\n";
      return lines(true);
    },
    state,
  };
}
