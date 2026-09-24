"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";

interface Props {
  query: string;
  slug: string;
  title: string;
  rank: number;
  score: number;
}

type NegativeType = "irrelevant" | "outdated" | "wrong";

/**
 * Retrieval feedback on a single search result — thumbs up posts a
 * "relevant" event; thumbs down expands an inline reason picker
 * (irrelevant / outdated / wrong + optional comment). Both feed
 * /api/legal/retrieval-feedback which feeds ranking evaluation.
 */
export function SearchResultFeedback({ query, slug, title, rank, score }: Props) {
  const { lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);
  const [state, setState] = useState<"idle" | "up" | "down" | "sending">("idle");
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState<NegativeType>("irrelevant");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(feedbackType: "relevant" | NegativeType, note?: string) {
    setState("sending");
    setError(null);
    try {
      await api.legal.retrievalFeedback({
        query,
        result_slug: slug,
        result_title: title,
        feedback_type: feedbackType,
        severity: feedbackType === "relevant" ? "low" : "medium",
        ...(note ? { comment: note } : {}),
        search_mode: "global_search",
        rank_position: rank,
        result_score: score,
      });
      setState(feedbackType === "relevant" ? "up" : "down");
      setExpanded(false);
    } catch {
      setState("idle");
      setError(L("Feedback konnte nicht gesendet werden.", "Feedback could not be sent."));
    }
  }

  if (state === "up" || state === "down") {
    return (
      <span className="flex items-center gap-1.5 self-center text-xs text-[color:var(--ds-text-muted)]">
        <Check size={14} className="text-[color:var(--ds-success-text)]" aria-hidden="true" />
        {L("Danke für das Feedback", "Thanks for the feedback")}
      </span>
    );
  }

  const reasons: Array<{ id: NegativeType; label: string }> = [
    { id: "irrelevant", label: L("Nicht relevant", "Not relevant") },
    { id: "outdated", label: L("Veraltet", "Outdated") },
    { id: "wrong", label: L("Falsch", "Wrong") },
  ];

  return (
    <div className="shrink-0 self-center">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={L("Ergebnis ist hilfreich", "Result is helpful")}
          disabled={state === "sending"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void submit("relevant");
          }}
          className="rounded-md p-1.5 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-success-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none disabled:opacity-50 motion-reduce:transition-none"
        >
          {state === "sending" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ThumbsUp size={14} />
          )}
        </button>
        <button
          type="button"
          aria-label={L("Ergebnis ist nicht hilfreich", "Result is not helpful")}
          aria-expanded={expanded}
          disabled={state === "sending"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className={cn(
            "rounded-md p-1.5 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-danger-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none disabled:opacity-50 motion-reduce:transition-none",
            expanded && "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-danger-text)]"
          )}
        >
          <ThumbsDown size={14} />
        </button>
      </div>

      {expanded && (
        <div
          role="group"
          aria-label={L("Was stimmt nicht?", "What is wrong?")}
          className="absolute right-0 z-10 mt-1 w-64 space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 shadow-lg"
        >
          <fieldset className="space-y-1.5">
            <legend className="sr-only">{L("Grund", "Reason")}</legend>
            {reasons.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-2 text-xs text-[color:var(--ds-text)]"
              >
                <input
                  type="radio"
                  name={`feedback-reason-${slug}`}
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                  className="accent-[var(--brand-primary)]"
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={L("Kommentar (optional)", "Comment (optional)")}
            aria-label={L("Kommentar (optional)", "Comment (optional)")}
            maxLength={500}
            className="w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-xs text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          />
          {error && (
            <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setExpanded(false);
              }}
            >
              {L("Abbrechen", "Cancel")}
            </Button>
            <Button
              variant="primary"
              className="gap-1 px-2 py-1 text-xs"
              disabled={state === "sending"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void submit(reason, comment.trim() || undefined);
              }}
            >
              {state === "sending" && <Loader2 size={12} className="animate-spin" />}
              {L("Senden", "Send")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
