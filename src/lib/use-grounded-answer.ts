"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { GroundingMetadata } from "@/lib/citation-gate-client";

interface UseGroundedAnswerState {
  grounding: GroundingMetadata | null;
  isGrounding: boolean;
  groundingError: string | null;
}

interface UseGroundedAnswerResult extends UseGroundedAnswerState {
  groundAnswer: (answerText: string) => Promise<GroundingMetadata | null>;
  reset: () => void;
}

/**
 * Hook that runs corpus grounding on an AI answer text via the server-side
 * API route POST /api/legal/ground. This is the single entry point for
 * client-side grounding — chat, strategy-tab, and rechtsprechung all use this.
 *
 * Usage:
 *   const { grounding, isGrounding, groundAnswer } = useGroundedAnswer();
 *   // After AI response completes:
 *   await groundAnswer(finalAnswerText);
 *   // Pass `grounding` to CitationPanel as data.grounding
 */
export function useGroundedAnswer(): UseGroundedAnswerResult {
  const [state, setState] = useState<UseGroundedAnswerState>({
    grounding: null,
    isGrounding: false,
    groundingError: null,
  });

  const groundAnswer = useCallback(
    async (answerText: string): Promise<GroundingMetadata | null> => {
      if (!answerText.trim()) return null;
      setState((s) => ({ ...s, isGrounding: true, groundingError: null }));
      try {
        const meta = await api.legal.ground(answerText);
        setState((s) => ({ ...s, grounding: meta, isGrounding: false }));
        return meta;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Grounding failed";
        setState((s) => ({ ...s, isGrounding: false, groundingError: msg }));
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({ grounding: null, isGrounding: false, groundingError: null });
  }, []);

  return {
    grounding: state.grounding,
    isGrounding: state.isGrounding,
    groundingError: state.groundingError,
    groundAnswer,
    reset,
  };
}
