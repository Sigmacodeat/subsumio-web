import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useVoiceInput } from "./use-voice-input";

let lastRecognition: MockSpeechRecognition | null = null;

class MockSpeechRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult:
    | ((event: {
        results: { transcript: string; confidence: number; isFinal?: boolean }[][];
      }) => void)
    | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastRecognition = this;
  }

  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
    this.onend?.();
  }
  abort() {
    this.started = false;
  }

  emitResult(text: string, isFinal = true) {
    this.onresult?.({
      results: [[{ transcript: text, confidence: isFinal ? 0.95 : 0, isFinal }]],
    });
  }

  emitError(error: string) {
    this.onerror?.({ error });
  }
}

beforeEach(() => {
  lastRecognition = null;
  Object.assign(globalThis.window, {
    SpeechRecognition: MockSpeechRecognition,
    webkitSpeechRecognition: MockSpeechRecognition,
  });
});

describe("useVoiceInput", () => {
  it("reports supported and starts listening", () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.isSupported).toBe(true);
    expect(result.current.isListening).toBe(false);
    act(() => result.current.start());
    expect(result.current.isListening).toBe(true);
  });

  it("returns final transcript and invokes onResult", async () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useVoiceInput({ onResult }));
    act(() => result.current.start());
    lastRecognition!.emitResult("Hallo Copilot");
    await waitFor(() => {
      expect(result.current.transcript).toBe("Hallo Copilot");
    });
    expect(onResult).toHaveBeenCalledWith("Hallo Copilot");
  });

  it("tracks interim transcript separately", async () => {
    const { result } = renderHook(() => useVoiceInput({ interimResults: true }));
    act(() => result.current.start());
    lastRecognition!.emitResult("interim", false);
    await waitFor(() => {
      expect(result.current.interimTranscript).toBe("interim");
      expect(result.current.transcript).toBe("");
    });
  });

  it("stops listening and clears interim on end", async () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => result.current.start());
    act(() => result.current.stop());
    await waitFor(() => {
      expect(result.current.isListening).toBe(false);
      expect(result.current.interimTranscript).toBe("");
    });
  });

  it("exposes errors from the recognition API", async () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => result.current.start());
    lastRecognition!.emitError("not-allowed");
    await waitFor(() => {
      expect(result.current.error).toBe("not-allowed");
      expect(result.current.isListening).toBe(false);
    });
  });

  it("resets transcript and error", async () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => result.current.start());
    lastRecognition!.emitResult("Text");
    await waitFor(() => expect(result.current.transcript).toBe("Text"));
    act(() => result.current.reset());
    expect(result.current.transcript).toBe("");
    expect(result.current.error).toBeNull();
  });

  it("reports unsupported when SpeechRecognition is absent", () => {
    delete (globalThis.window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (globalThis.window as unknown as { webkitSpeechRecognition?: unknown })
      .webkitSpeechRecognition;
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.isSupported).toBe(false);
  });
});
