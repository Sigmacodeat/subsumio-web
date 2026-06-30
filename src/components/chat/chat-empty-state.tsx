"use client";

import { MessageSquareText, Search, FileText, Scale, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { DEFAULT_EXAMPLE_QUERIES, DEFAULT_EXAMPLE_QUERIES_EN } from "@/components/chat/chat-types";

interface ChatEmptyStateProps {
  onExampleClick: (query: string) => void;
  exampleQueries?: string[];
  contextLabel?: string;
  userName?: string;
  className?: string;
}

export function ChatEmptyState({
  onExampleClick,
  exampleQueries,
  contextLabel,
  userName,
  className,
}: ChatEmptyStateProps) {
  const { t, lang } = useLang();
  const queries =
    exampleQueries ?? (lang === "en" ? DEFAULT_EXAMPLE_QUERIES_EN : DEFAULT_EXAMPLE_QUERIES);

  const icons = [Search, Scale, FileText, Search];

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8 text-center",
        className
      )}
    >
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] shadow-sm">
        <MessageSquareText size={22} className="text-[color:var(--ds-text-muted)]" />
      </div>
      <h3 className="font-display text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
        {userName
          ? lang === "en"
            ? `Hello, ${userName}`
            : `Guten Tag, ${userName}`
          : t("chat.empty_title")}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
        {userName
          ? lang === "en"
            ? "How can I help you today?"
            : "Womit kann ich dir heute helfen?"
          : t("chat.empty_desc")}
        {contextLabel && (
          <>
            {" "}
            <span className="font-medium text-[color:var(--ds-text)]">{contextLabel}</span>
          </>
        )}
      </p>

      <div className="mt-6 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {queries.slice(0, 4).map((q, i) => {
          const Icon = icons[i] ?? Search;
          return (
            <button
              key={i}
              onClick={() => onExampleClick(q)}
              className="group flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-left shadow-sm transition-[border-color,background-color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)] hover:shadow-md active:translate-y-0 active:scale-[0.98]"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-subtle)] transition-colors group-hover:text-[color:var(--ds-text)]">
                <Icon size={14} />
              </div>
              <p className="line-clamp-2 text-[13px] leading-snug text-[color:var(--ds-text-muted)] transition-colors group-hover:text-[color:var(--ds-text)]">
                {q}
              </p>
              <ArrowUpRight
                size={12}
                className="mt-0.5 shrink-0 text-[color:var(--ds-text-subtle)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
