"use client";

import { Search, FileText, Scale, ArrowUpRight } from "lucide-react";
import { BrainAvatar } from "@/components/chat/brain-avatar";
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
        "flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center",
        className
      )}
    >
      {/* Copilot Brain Identity — larger for empty state with soft orb */}
      <div className="mb-6">
        <BrainAvatar size="lg" orb title="Subsumio Copilot" />
      </div>

      {/* Large editorial greeting */}
      <h3 className="font-display text-2xl font-semibold tracking-tight text-[color:var(--ds-text)]">
        {userName
          ? lang === "en"
            ? `Hello, ${userName}`
            : `Guten Tag, ${userName}`
          : t("chat.empty_title")}
      </h3>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[color:var(--ds-text-muted)]">
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

      {/* Pill-shaped suggestion buttons — ChatGPT/Claude style */}
      <div className="mt-8 flex w-full max-w-lg flex-col items-center gap-2.5">
        {queries.slice(0, 4).map((q, i) => {
          const Icon = icons[i] ?? Search;
          return (
            <button
              key={i}
              onClick={() => onExampleClick(q)}
              className="group flex w-full max-w-sm items-center gap-3 rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-2.5 text-left transition-[border-color,background-color] duration-200 hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)] active:scale-[0.98]"
            >
              <Icon
                size={15}
                className="shrink-0 text-[color:var(--ds-text-subtle)] transition-colors group-hover:text-[color:var(--brand-primary)]"
              />
              <span className="flex-1 truncate text-[13px] leading-snug text-[color:var(--ds-text-muted)] transition-colors group-hover:text-[color:var(--ds-text)]">
                {q}
              </span>
              <ArrowUpRight
                size={13}
                className="shrink-0 text-[color:var(--ds-text-subtle)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
            </button>
          );
        })}
      </div>

      {/* Subtle micro-text disclaimer — replaces the old banner */}
      <p className="mt-8 text-[11px] text-[color:var(--ds-text-subtle)]/70">
        {lang === "en"
          ? "AI draft — verify sources and deadlines before use."
          : "KI-Entwurf — Belege und Fristen vor Verwendung anwaltlich prüfen."}
      </p>
    </div>
  );
}
