"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, AlertCircle, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

type FeedbackType = "relevant" | "irrelevant" | "outdated" | "wrong";

interface Props {
  query: string;
  resultSlug: string;
  resultTitle: string;
  rankPosition?: number;
  className?: string;
}

const FEEDBACK_OPTIONS: Array<{
  type: FeedbackType;
  icon: React.ElementType;
  label: string;
  hoverClass: string;
}> = [
  {
    type: "relevant",
    icon: ThumbsUp,
    label: "Relevant",
    hoverClass: "hover:text-[color:var(--ds-success-text)]",
  },
  {
    type: "irrelevant",
    icon: ThumbsDown,
    label: "Irrelevant",
    hoverClass: "hover:text-[color:var(--ds-warning-text)]",
  },
  {
    type: "outdated",
    icon: AlertCircle,
    label: "Veraltet",
    hoverClass: "hover:text-[color:var(--ds-attention-text)]",
  },
  {
    type: "wrong",
    icon: XCircle,
    label: "Falsch",
    hoverClass: "hover:text-[color:var(--ds-danger-text)]",
  },
];

export function RetrievalFeedbackButtons({
  query,
  resultSlug,
  resultTitle,
  rankPosition,
  className,
}: Props) {
  const [submitted, setSubmitted] = useState<FeedbackType | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(type: FeedbackType) {
    if (submitted || submitting) return;
    setSubmitting(true);
    try {
      await api.legal.submitRetrievalFeedback({
        query,
        result_slug: resultSlug,
        result_title: resultTitle,
        feedback_type: type,
        rank_position: rankPosition,
      });
      setSubmitted(type);
    } catch {
      // Silent fail — feedback is best-effort
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-subtle)]",
          className
        )}
      >
        <ThumbsUp size={10} className="text-[color:var(--ds-success-text)]" />
        Danke für dein Feedback
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {submitting && (
        <Loader2 size={10} className="animate-spin text-[color:var(--ds-text-subtle)]" />
      )}
      {FEEDBACK_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.type}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleSubmit(opt.type);
            }}
            disabled={submitting}
            title={opt.label}
            className={cn(
              "rounded p-1 text-[color:var(--ds-text-subtle)] transition-colors disabled:opacity-50",
              opt.hoverClass
            )}
          >
            <Icon size={12} />
          </button>
        );
      })}
    </span>
  );
}
