"use client";

import { useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { mergeSupport, type GroundingMetadata } from "@/lib/citation-gate-client";

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
/**
 * Second stage, shared by the hook and the chat: ask whether each verified
 * source carries the statement it is cited for, and fold the verdicts in.
 * Never throws — on failure the grounding comes back unchanged.
 */
export async function withSupportCheck(
  answerText: string,
  grounding: GroundingMetadata
): Promise<GroundingMetadata> {
  if (!grounding.grounded_citations.some((gc) => gc.verified)) return grounding;
  try {
    const { results } = await api.legal.support(answerText);
    return mergeSupport(grounding, results);
  } catch {
    return grounding;
  }
}

export function useGroundedAnswer(): UseGroundedAnswerResult {
  const [state, setState] = useState<UseGroundedAnswerState>({
    grounding: null,
    isGrounding: false,
    groundingError: null,
  });
  // A slower support check for an older text must not overwrite a newer one.
  const seq = useRef(0);

  const groundAnswer = useCallback(
    async (answerText: string): Promise<GroundingMetadata | null> => {
      if (!answerText.trim()) return null;
      const mine = ++seq.current;
      setState((s) => ({ ...s, isGrounding: true, groundingError: null }));
      try {
        const meta = await api.legal.ground(answerText);
        if (mine !== seq.current) return meta;
        setState((s) => ({ ...s, grounding: meta, isGrounding: false }));
        // Non-blocking: the existence check is on screen; the support verdicts follow.
        void withSupportCheck(answerText, meta).then((checked) => {
          if (checked !== meta && mine === seq.current) {
            setState((s) => ({ ...s, grounding: checked }));
          }
        });
        return meta;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Grounding failed";
        if (mine === seq.current) {
          setState((s) => ({ ...s, isGrounding: false, groundingError: msg }));
        }
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    seq.current++;
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
