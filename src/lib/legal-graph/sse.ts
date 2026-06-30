/**
 * Shared SSE (Server-Sent Events) stream collector.
 *
 * Reads a streaming Response from the engine's /api/think endpoint,
 * parses SSE data lines, and returns the concatenated text.
 *
 * Used by:
 * - reranking.ts (cross-encoder scoring)
 * - pipeline.ts (multi-agent reasoning)
 */

export async function collectSSE(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    return await res.text();
  }

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) fullText += parsed.text;
          else if (parsed.content) fullText += parsed.content;
          else if (parsed.delta) fullText += parsed.delta;
          else if (typeof parsed === "string") fullText += parsed;
        } catch {
          // Not JSON — might be plain text
          if (data && data !== "[DONE]") fullText += data;
        }
      }
    }
  }

  return fullText;
}
