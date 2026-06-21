"use client";

import { Sparkles, Search, FileText, Scale, ArrowUpRight } from "lucide-react";
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
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-6 text-center",
        className
      )}
    >
      <div className="relative mb-4">
        <div
          className="brand-glow-bg absolute inset-0 -z-10 scale-125 rounded-full opacity-50 blur-2xl"
          aria-hidden
        />
        <div className="brand-bg relative flex h-12 w-12 items-center justify-center rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_6px_20px_-4px_var(--brand-glow)]">
          <Sparkles size={20} className="text-white" />
        </div>
      </div>
      <h3 className="font-display text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
        {t("chat.empty_title")}
      </h3>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
        {t("chat.empty_desc")}
        {contextLabel && (
          <>
            {" "}
            <span className="brand-text font-medium">{contextLabel}</span>
          </>
        )}
      </p>

      <div className="mt-4 grid w-full max-w-xs grid-cols-2 gap-2">
        {queries.slice(0, 4).map((q, i) => (
          <button
            key={i}
            onClick={() => onExampleClick(q)}
            className="group relative flex flex-col items-start gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-2.5 text-left shadow-sm transition-[border-color,background-color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-[var(--brand-primary)]/30 hover:bg-[color:var(--ds-hover)] hover:shadow-md active:translate-y-0 active:scale-[0.98]"
          >
            <div className="group-hover:brand-soft group-hover:brand-text flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)] transition-colors">
              {i === 0 ? (
                <Sparkles size={12} />
              ) : i === 1 ? (
                <Search size={12} />
              ) : i === 2 ? (
                <Scale size={12} />
              ) : (
                <FileText size={12} />
              )}
            </div>
            <p className="line-clamp-3 text-[11px] leading-snug text-[color:var(--ds-text-muted)] transition-colors group-hover:text-[color:var(--ds-text)]">
              {q}
            </p>
            <ArrowUpRight
              size={11}
              className="brand-text absolute top-2 right-2 shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
