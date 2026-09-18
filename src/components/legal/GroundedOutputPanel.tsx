"use client";

/**
 * The grounding invariant (CLAUDE.md) in one line: give it the AI-generated
 * text, it runs `useGroundedAnswer` once per distinct text and renders the
 * standard `CitationPanel` (verified/unverified counts, AI notice, sources).
 *
 * Use it under any AI output that does not already wire the hook + panel
 * itself. Grounding is non-blocking — the output is visible first.
 */

import { useEffect } from "react";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";

/** The ground route rejects shorter input; nothing citable fits in it anyway. */
const MIN_GROUNDABLE = 10;

interface GroundedOutputPanelProps {
  /** The AI-generated text as shown to the user (markdown or plain). */
  text: string | null | undefined;
  /** Brain sources the answer was built from, if the caller has them. */
  citations?: CitationPanelData["citations"];
  gaps?: string[];
  /** True while the text is still streaming — grounding waits for the final text. */
  isStreaming?: boolean;
  compact?: boolean;
  className?: string;
}

export function GroundedOutputPanel({
  text,
  citations,
  gaps,
  isStreaming = false,
  compact = true,
  className,
}: GroundedOutputPanelProps) {
  const { grounding, isGrounding, groundAnswer, reset } = useGroundedAnswer();
  const finalText = !isStreaming && text && text.trim().length >= MIN_GROUNDABLE ? text : null;

  useEffect(() => {
    if (!finalText) {
      reset();
      return;
    }
    groundAnswer(finalText).catch(() => {});
  }, [finalText, groundAnswer, reset]);

  if (!text || !text.trim()) return null;

  return (
    <CitationPanel
      data={{
        grounding: grounding ?? null,
        citations: citations ?? [],
        gaps,
        isStreaming: isStreaming || isGrounding,
      }}
      compact={compact}
      className={className}
    />
  );
}
