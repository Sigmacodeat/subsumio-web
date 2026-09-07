"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CalendarClock, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { TaxDeadlineEntry } from "@/lib/tax-types";
import { useLang } from "@/lib/use-lang";

interface TaxDeadlineTimelineProps {
  deadlines: TaxDeadlineEntry[];
  onSelect?: (deadline: TaxDeadlineEntry) => void;
  className?: string;
}

export function TaxDeadlineTimeline({ deadlines, onSelect, className }: TaxDeadlineTimelineProps) {
  const { t, lang } = useLang();
  const locale = lang === "en" ? "en-GB" : "de-DE";

  const sorted = useMemo(
    () =>
      [...deadlines].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [deadlines]
  );

  if (sorted.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-10 text-center",
          className
        )}
      >
        <CalendarClock
          size={28}
          className="mx-auto text-[color:var(--ds-text-subtle)] opacity-50"
        />
        <p className="mt-2 text-sm text-[color:var(--ds-text-subtle)]">
          {t("tax.deadline_timeline.none")}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {sorted.map((d) => {
        const Icon = d.isOverdue
          ? AlertTriangle
          : d.isUrgent
            ? Clock
            : d.daysRemaining < 0
              ? CheckCircle2
              : CalendarClock;

        const colorClass = d.isOverdue
          ? "text-[color:var(--ds-danger-text)] bg-[color:var(--ds-danger-bg)] border-[color:var(--ds-danger-border)]"
          : d.isUrgent
            ? "text-[color:var(--ds-warning-text)] bg-[color:var(--ds-warning-bg)] border-[color:var(--ds-warning-border)]"
            : "text-[color:var(--ds-text-muted)] bg-[color:var(--ds-surface-2)] border-[color:var(--ds-border)]";

        const dateLabel = new Date(d.dueDate).toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
          year: "numeric",
        });

        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelect?.(d)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-[background-color,border-color,color] hover:border-[color:var(--ds-border-strong)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none",
              colorClass
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/50">
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">{d.label}</p>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">
                {d.clientName ? `${d.clientName} · ` : ""}
                {dateLabel}
                {d.recurring !== "none" && (
                  <span className="ml-1.5 rounded bg-[color:var(--ds-surface)] px-1 py-0.5 text-[10px]">
                    {d.recurring === "monthly"
                      ? lang === "en"
                        ? "monthly"
                        : "monatlich"
                      : d.recurring === "quarterly"
                        ? lang === "en"
                          ? "quarterly"
                          : "quartalsweise"
                        : lang === "en"
                          ? "annually"
                          : "jährlich"}
                  </span>
                )}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span
                className={cn(
                  "text-sm font-bold",
                  d.isOverdue
                    ? "text-[color:var(--ds-danger-text)]"
                    : d.isUrgent
                      ? "text-[color:var(--ds-warning-text)]"
                      : "text-[color:var(--ds-text)]"
                )}
              >
                {d.daysRemaining < 0
                  ? lang === "en"
                    ? `${Math.abs(d.daysRemaining)}d overdue`
                    : `${Math.abs(d.daysRemaining)}T überfällig`
                  : lang === "en"
                    ? `${d.daysRemaining}d`
                    : `${d.daysRemaining}T`}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
