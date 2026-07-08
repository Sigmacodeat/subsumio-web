"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CalendarClock, Inbox, Scale, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import type { BrainPage } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

const TYPES = ["legal_deadline", "legal_follow_up", "legal_intake", "legal_calendar_event"];

function dateOf(page: BrainPage): string {
  const fm = page.frontmatter ?? {};
  return String(
    fm.date ?? fm.due_date ?? fm.dueDate ?? fm.start_date ?? fm.received_at ?? ""
  ).slice(0, 10);
}

const COLUMN_META: Record<
  string,
  { emptyDe: string; emptyEn: string; ctaHref: string; ctaLabelDe: string; ctaLabelEn: string }
> = {
  legal_deadline: {
    emptyDe: "Keine Fristen heute",
    emptyEn: "No deadlines today",
    ctaHref: "/dashboard/deadlines",
    ctaLabelDe: "Alle Fristen",
    ctaLabelEn: "All deadlines",
  },
  legal_follow_up: {
    emptyDe: "Keine Wiedervorlagen",
    emptyEn: "No follow-ups",
    ctaHref: "/dashboard/wiedervorlagen",
    ctaLabelDe: "Wiedervorlagen",
    ctaLabelEn: "Follow-ups",
  },
  legal_intake: {
    emptyDe: "Posteingang leer",
    emptyEn: "Inbox is clear",
    ctaHref: "/dashboard/intake",
    ctaLabelDe: "Eingang öffnen",
    ctaLabelEn: "Open inbox",
  },
  legal_calendar_event: {
    emptyDe: "Keine Termine",
    emptyEn: "No appointments",
    ctaHref: "/dashboard/calendar",
    ctaLabelDe: "Kalender",
    ctaLabelEn: "Calendar",
  },
};

export function TodayView() {
  const { t, lang } = useLang();
  const today = new Date().toLocaleDateString("en-CA");
  const query = useQuery({
    queryKey: ["today-view", today],
    queryFn: () => api.brain.batchListPages(TYPES, 300),
  });
  const columns = [
    { type: "legal_deadline", title: t("today.deadlines"), icon: Scale },
    { type: "legal_follow_up", title: t("today.followups"), icon: CalendarClock },
    { type: "legal_intake", title: t("today.inbox"), icon: Inbox },
    { type: "legal_calendar_event", title: t("today.appointments"), icon: CalendarDays },
  ];
  if (query.isLoading)
    return (
      <div className="grid gap-4 lg:grid-cols-4">
        {columns.map((column) => (
          <Skeleton key={column.type} className="h-56" />
        ))}
      </div>
    );
  if (query.isError)
    return (
      <div
        role="alert"
        className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4 text-sm text-[color:var(--ds-danger-text)]"
      >
        {t("today.error")}
      </div>
    );
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      role="region"
      aria-label={t("today.title")}
    >
      {columns.map(({ type, title, icon: Icon }) => {
        const items = (query.data?.[type] ?? []).filter(
          (item) => dateOf(item) === today && !Boolean(item.frontmatter?.completed)
        );
        const meta = COLUMN_META[type];
        return (
          <section
            key={type}
            className="group min-h-56 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color] hover:border-[color:var(--ds-border-strong)]"
          >
            <div className="mb-4 flex items-center gap-2">
              <Icon size={16} className="text-[color:var(--brand-primary)]" aria-hidden="true" />
              <h2 className="text-sm font-semibold">{title}</h2>
              {items.length > 0 && (
                <span className="ml-auto rounded-full bg-[color:var(--ds-surface-2)] px-2 py-0.5 text-xs tabular-nums">
                  {items.length}
                </span>
              )}
            </div>
            {items.length > 0 ? (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.slug}
                    className="rounded-lg bg-[color:var(--ds-surface-2)] p-2.5 text-sm text-[color:var(--ds-text)]"
                  >
                    {item.title}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--ds-surface-2)]">
                  <CheckCircle2 size={18} className="text-[color:var(--ds-success-text,#22c55e)]" />
                </div>
                <p className="text-center text-[13px] font-medium text-[color:var(--ds-text-muted)]">
                  {lang === "en" ? meta.emptyEn : meta.emptyDe}
                </p>
                {meta && (
                  <Link
                    href={meta.ctaHref}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--brand-primary)]"
                  >
                    {lang === "en" ? meta.ctaLabelEn : meta.ctaLabelDe}
                    <ArrowRight size={11} />
                  </Link>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
