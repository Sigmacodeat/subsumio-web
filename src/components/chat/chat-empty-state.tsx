"use client";

import { Sparkles, Search, FileText, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { DEFAULT_EXAMPLE_QUERIES } from "@/components/chat/chat-types";

interface ChatEmptyStateProps {
  onExampleClick: (query: string) => void;
  exampleQueries?: string[];
  contextLabel?: string;
  className?: string;
}

export function ChatEmptyState({
  onExampleClick,
  exampleQueries,
  contextLabel,
  className,
}: ChatEmptyStateProps) {
  const { t } = useLang();
  const queries = exampleQueries ?? DEFAULT_EXAMPLE_QUERIES;

  return (
    <div
      className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}
    >
      <div className="brand-soft brand-border mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border">
        <Sparkles size={28} className="brand-text" />
      </div>
      <h3 className="text-lg font-semibold text-[color:var(--ds-text)]">{t("chat.empty_title")}</h3>
      <p className="mt-1 max-w-md text-sm text-[color:var(--ds-text-muted)]">
        {t("chat.empty_desc")}
        {contextLabel && (
          <>
            {" "}
            <span className="brand-text font-medium">{contextLabel}</span>
          </>
        )}
      </p>

      <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {queries.map((q, i) => (
          <button
            key={i}
            onClick={() => onExampleClick(q)}
            className="group flex items-start gap-2.5 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-left transition-[border-color,background-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[color:var(--brand-primary)]/30 hover:bg-[color:var(--ds-hover)] active:scale-95"
          >
            <div className="group-hover:brand-soft group-hover:brand-text flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)] transition-colors">
              {i === 0 ? (
                <Sparkles size={13} />
              ) : i === 1 ? (
                <Search size={13} />
              ) : i === 2 ? (
                <Scale size={13} />
              ) : (
                <FileText size={13} />
              )}
            </div>
            <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)] transition-colors group-hover:text-[color:var(--ds-text)]">
              {q}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
