"use client";

import { useState } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { useLang } from "@/lib/use-lang";

/**
 * WP-8.53: NPS-Feedback im Mandantenportal.
 * Score 0–10 als Tastatur-bedienbare Button-Reihe + optionaler Kommentar.
 * Re-Submission innerhalb von 7 Tagen aktualisiert die Bewertung (Server-seitig).
 */
export function PortalFeedback({ token }: { token: string }) {
  const { t } = useLang();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit() {
    if (score === null || state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/portal/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, score, comment: comment.trim() || undefined }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-surface)]">
        <div className="flex items-center gap-2 text-sm [color:var(--ds-success-text)]">
          <CheckCircle2 size={16} aria-hidden />
          {t("portal.feedback_thanks")}
        </div>
      </div>
    );
  }

  return (
    <fieldset className="rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-surface)]">
      <legend className="px-1 text-sm font-semibold">{t("portal.feedback_title")}</legend>
      <p className="mb-3 text-xs [color:var(--mk-text-muted)]">{t("portal.feedback_hint")}</p>
      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label={t("portal.feedback_title")}
      >
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={score === i}
            onClick={() => setScore(i)}
            className={`h-9 w-9 rounded-lg border text-sm font-medium transition-all focus-visible:ring-2 focus-visible:[--tw-ring-color:var(--brand-primary)] focus-visible:outline-none active:scale-95 ${
              score === i
                ? "[border-color:var(--brand-primary)] [color:var(--brand-on-primary,#fff)] [background:var(--brand-primary)]"
                : "[border-color:var(--mk-border)] [background:var(--mk-surface-2)] hover:[border-color:var(--brand-primary)]"
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] [color:var(--mk-text-subtle)]">
        <span>{t("portal.feedback_low")}</span>
        <span>{t("portal.feedback_high")}</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 2000))}
        placeholder={t("portal.feedback_comment_ph")}
        rows={2}
        className="mt-3 w-full rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [background:var(--mk-surface-2)] focus-visible:ring-2 focus-visible:[--tw-ring-color:var(--brand-primary)] focus-visible:outline-none"
        aria-label={t("portal.feedback_comment_ph")}
      />
      {state === "error" && (
        <p role="alert" className="mt-2 text-xs [color:var(--ds-danger-text)]">
          {t("portal.feedback_error")}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={score === null || state === "sending"}
        className="mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium [color:var(--brand-on-primary,#fff)] transition-all [background:var(--brand-primary)] hover:[background:var(--brand-primary-hover)] focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98] disabled:opacity-50"
      >
        <Star size={14} aria-hidden />
        {state === "sending" ? t("portal.feedback_sending") : t("portal.feedback_submit")}
      </button>
    </fieldset>
  );
}
