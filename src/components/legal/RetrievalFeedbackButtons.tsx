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
  { type: "relevant", icon: ThumbsUp, label: "Relevant", hoverClass: "hover:text-emerald-600" },
  { type: "irrelevant", icon: ThumbsDown, label: "Irrelevant", hoverClass: "hover:text-amber-600" },
  { type: "outdated", icon: AlertCircle, label: "Veraltet", hoverClass: "hover:text-orange-600" },
  { type: "wrong", icon: XCircle, label: "Falsch", hoverClass: "hover:text-red-600" },
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
          "inline-flex items-center gap-1 text-[10px] text-[color:var(--ds-text-subtle)]",
          className
        )}
      >
        <ThumbsUp size={10} className="text-emerald-600" />
        Danke für Ihr Feedback
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
