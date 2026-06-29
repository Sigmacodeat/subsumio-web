"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface _SpeechRecognitionResult {
  transcript: string;
  confidence: number;
}

interface UseVoiceInputOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (text: string) => void;
}

interface UseVoiceInputReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { lang = "de-DE", continuous = false, interimResults = true, onResult } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<unknown>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionClass =
      (
        window as unknown as {
          SpeechRecognition?: new () => unknown;
          webkitSpeechRecognition?: new () => unknown;
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass() as {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      start: () => void;
      stop: () => void;
      abort: () => void;
      onresult: (event: {
        results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>>;
      }) => void;
      onerror: (event: { error: string }) => void;
      onend: () => void;
    };

    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result[0];
        if (alt) {
          interimText += alt.transcript;
          if (alt.confidence > 0) {
            finalText += alt.transcript;
          }
        }
      }
      if (finalText) {
        setTranscript((prev) => prev + finalText);
        onResultRef.current?.(finalText);
      }
      setInterimTranscript(interimText);
    };

    recognition.onerror = (event) => {
      setError(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.abort();
      } catch {
        // ignore
      }
    };
  }, [isSupported, lang, continuous, interimResults]);

  const start = useCallback(() => {
    if (!recognitionRef.current || isListening) return;
    setError(null);
    setTranscript("");
    setInterimTranscript("");
    try {
      (recognitionRef.current as { start: () => void }).start();
      setIsListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start voice input");
    }
  }, [isListening]);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      (recognitionRef.current as { stop: () => void }).stop();
    } catch {
      // ignore
    }
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  };
}
