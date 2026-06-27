import { describe, it, expect, vi } from "vitest";
import { consumeSSEStream, collectSSEChunks, handleDataLine } from "./sse-stream";

function makeSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
}

function makeFailingStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.error(new Error("stream broke"));
    },
  });
}

function makeChunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("consumeSSEStream", () => {
  it("parses data events and invokes callback with raw + parsed", async () => {
    const events: Array<{ data: string; parsed?: Record<string, unknown> }> = [];
    const stream = makeSSEStream([
      'data: {"chunk":"hello"}\n\n',
      'data: {"chunk":" world"}\n\n',
      "data: [DONE]\n\n",
    ]);

    await consumeSSEStream(stream, (data, parsed) => {
      events.push({ data, parsed });
    });

    expect(events).toHaveLength(3);
    expect(events[0].data).toBe('{"chunk":"hello"}');
    expect(events[0].parsed).toEqual({ chunk: "hello" });
    expect(events[1].parsed).toEqual({ chunk: " world" });
    expect(events[2].data).toBe("[DONE]");
    expect(events[2].parsed).toBeUndefined();
  });

  it("handles non-JSON data lines (parsed is undefined)", async () => {
    const events: Array<{ data: string; parsed?: Record<string, unknown> }> = [];
    const stream = makeSSEStream(["data: not-json\n\n", "data: [DONE]\n\n"]);

    await consumeSSEStream(stream, (data, parsed) => {
      events.push({ data, parsed });
    });

    expect(events).toHaveLength(2);
    expect(events[0].data).toBe("not-json");
    expect(events[0].parsed).toBeUndefined();
  });

  it("handles chunks split across SSE event boundaries", async () => {
    const events: string[] = [];
    // Simulate a chunk that arrives split across two network reads
    const stream = makeChunkedStream([
      'data: {"chunk":"hel',
      'lo"}\n\ndata: {"chunk":"!"}\n\n',
      "data: [DONE]\n\n",
    ]);

    await consumeSSEStream(stream, (data) => {
      events.push(data);
    });

    expect(events).toHaveLength(3);
    expect(events[0]).toBe('{"chunk":"hello"}');
    expect(events[1]).toBe('{"chunk":"!"}');
    expect(events[2]).toBe("[DONE]");
  });

  it("flushes remaining buffer after stream ends", async () => {
    const events: string[] = [];
    // No trailing newline after last event
    const stream = makeSSEStream(['data: {"chunk":"tail"}\n\n', "data: [DONE]"]);

    await consumeSSEStream(stream, (data) => {
      events.push(data);
    });

    expect(events).toHaveLength(2);
    expect(events[1]).toBe("[DONE]");
  });

  it("ignores non-data lines", async () => {
    const events: string[] = [];
    const stream = makeSSEStream([
      ": comment line\n\n",
      'data: {"chunk":"ok"}\n\n',
      "event: custom\n\n",
      "data: [DONE]\n\n",
    ]);

    await consumeSSEStream(stream, (data) => {
      events.push(data);
    });

    // Only data: lines should be captured
    expect(events).toHaveLength(2);
    expect(events[0]).toBe('{"chunk":"ok"}');
  });

  it("cancels reader and re-throws on stream error", async () => {
    const stream = makeFailingStream();

    await expect(consumeSSEStream(stream, () => {})).rejects.toThrow("stream broke");
  });

  it("handles empty stream gracefully", async () => {
    const events: string[] = [];
    const stream = makeSSEStream([]);

    await consumeSSEStream(stream, (data) => {
      events.push(data);
    });

    expect(events).toHaveLength(0);
  });
});

describe("collectSSEChunks", () => {
  it("concatenates chunk fields", async () => {
    const stream = makeSSEStream([
      'data: {"chunk":"Hello"}\n\n',
      'data: {"chunk":" "}\n\n',
      'data: {"chunk":"World"}\n\n',
      "data: [DONE]\n\n",
    ]);

    const result = await collectSSEChunks(stream);
    expect(result).toBe("Hello World");
  });

  it("invokes onChunk for each chunk", async () => {
    const stream = makeSSEStream([
      'data: {"chunk":"A"}\n\n',
      'data: {"chunk":"B"}\n\n',
      "data: [DONE]\n\n",
    ]);

    const chunks: string[] = [];
    const result = await collectSSEChunks(stream, (c) => chunks.push(c));

    expect(result).toBe("AB");
    expect(chunks).toEqual(["A", "B"]);
  });

  it("ignores non-chunk events", async () => {
    const stream = makeSSEStream([
      'data: {"citations":[]}\n\n',
      'data: {"chunk":"only this"}\n\n',
      "data: [DONE]\n\n",
    ]);

    const result = await collectSSEChunks(stream);
    expect(result).toBe("only this");
  });

  it("returns empty string for stream with no chunks", async () => {
    const stream = makeSSEStream(['data: {"citations":[]}\n\n', "data: [DONE]\n\n"]);

    const result = await collectSSEChunks(stream);
    expect(result).toBe("");
  });

  it("propagates errors from failed stream", async () => {
    const stream = makeFailingStream();
    await expect(collectSSEChunks(stream)).rejects.toThrow("stream broke");
  });
});

describe("handleDataLine", () => {
  it("passes [DONE] with undefined parsed", () => {
    const cb = vi.fn();
    handleDataLine("[DONE]", cb);
    expect(cb).toHaveBeenCalledWith("[DONE]", undefined);
  });

  it("parses valid JSON", () => {
    const cb = vi.fn();
    handleDataLine('{"chunk":"hi"}', cb);
    expect(cb).toHaveBeenCalledWith('{"chunk":"hi"}', { chunk: "hi" });
  });

  it("passes non-JSON with undefined parsed", () => {
    const cb = vi.fn();
    handleDataLine("not-json", cb);
    expect(cb).toHaveBeenCalledWith("not-json", undefined);
  });
});
