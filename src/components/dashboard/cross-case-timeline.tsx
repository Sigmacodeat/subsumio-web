"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarClock, CheckSquare, FileSignature, GitBranch, AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import type { CockpitData } from "@/components/dashboard/widget-dashboard";

type TimelineEntry = {
  id: string;
  date: Date;
  daysLeft: number;
  icon: typeof CalendarClock;
  iconColor: string;
  title: string;
  caseName: string;
  eventType: string;
  href: string;
  overdue: boolean;
};

function isOpenStatus(status: unknown) {
  return ![
    "done",
    "closed",
    "settled",
    "won",
    "lost",
    "paid",
    "archived",
    "approved",
    "rejected",
    "fulfilled",
    "signed",
    "declined",
    "cancelled",
    "canceled",
  ].includes(String(status ?? "").toLowerCase());
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getCaseName(page: { frontmatter?: Record<string, unknown> }): string {
  const fm = page.frontmatter ?? {};
  return text(fm.case_title, text(fm.case_slug, ""));
}

export function CrossCaseTimeline({ data }: { data: CockpitData }) {
  const { t, lang } = useLang();
  const locale = lang === "en" ? "en-GB" : "de-DE";

  const entries = useMemo<TimelineEntry[]>(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const sevenDaysAhead = new Date(now);
    sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

    const items: TimelineEntry[] = [];

    for (const dl of data.deadlines) {
      if (!isOpenStatus((dl.page.frontmatter ?? {}).status)) continue;
      const due = dl.due;
      if (dl.daysLeft > 7 && !dl.overdue) continue;
      const caseName = getCaseName(dl.page);
      items.push({
        id: `dl-${dl.page.slug}`,
        date: due,
        daysLeft: dl.daysLeft,
        icon: CalendarClock,
        iconColor: dl.overdue
          ? "var(--ds-danger-text)"
          : dl.daysLeft <= 1
            ? "var(--ds-danger-text)"
            : dl.daysLeft <= 3
              ? "var(--ds-warning-text)"
              : "var(--ds-info-text)",
        title: text(dl.page.title, t("widget.deadlines")),
        caseName,
        eventType: t("widget.activity_deadline"),
        href: "/dashboard/deadlines",
        overdue: dl.overdue,
      });
    }

    for (const review of data.pendingReviews) {
      if (!isOpenStatus((review.frontmatter ?? {}).status)) continue;
      const created = new Date(review.created_at);
      const daysLeft = Math.ceil((created.getTime() - now.getTime()) / 86_400_000);
      if (daysLeft > 7 && daysLeft >= 0) continue;
      const caseName = getCaseName(review as unknown as { frontmatter?: Record<string, unknown> });
      items.push({
        id: `review-${review.slug}`,
        date: created,
        daysLeft,
        icon: CheckSquare,
        iconColor: "var(--brand-primary)",
        title: text(review.title, t("widget.ai_activity")),
        caseName,
        eventType: t("widget.activity_review"),
        href: "/dashboard/review-queue",
        overdue: false,
      });
    }

    for (const sig of data.pendingSignatures) {
      if (!isOpenStatus((sig.frontmatter ?? {}).status)) continue;
      const created = new Date(sig.created_at);
      const daysLeft = Math.ceil((created.getTime() - now.getTime()) / 86_400_000);
      if (daysLeft > 7 && daysLeft >= 0) continue;
      const caseName = getCaseName(sig as unknown as { frontmatter?: Record<string, unknown> });
      items.push({
        id: `sig-${sig.slug}`,
        date: created,
        daysLeft,
        icon: FileSignature,
        iconColor: "var(--brand-primary)",
        title: text(sig.title, t("widget.activity_signature")),
        caseName,
        eventType: t("widget.activity_signature_pending"),
        href: "/dashboard/signature",
        overdue: false,
      });
    }

    for (const d of data.reviewGaps) {
      const created = new Date(d.created_at);
      const daysLeft = Math.ceil((created.getTime() - now.getTime()) / 86_400_000);
      if (daysLeft > 7 && daysLeft >= 0) continue;
      const caseName = getCaseName(d as unknown as { frontmatter?: Record<string, unknown> });
      items.push({
        id: `gap-${d.slug}`,
        date: created,
        daysLeft,
        icon: AlertTriangle,
        iconColor: "var(--ds-warning-text)",
        title: text(d.title, t("widget.review_gaps")),
        caseName,
        eventType: t("widget.review_gaps"),
        href: "/dashboard/vault",
        overdue: false,
      });
    }

    return items.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 15);
  }, [data, t]);

  if (entries.length === 0) {
    return (
      <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <GitBranch size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {t("widget.cross_timeline")}
          </span>
        </div>
        <p className="text-[13px] text-[color:var(--ds-text-muted)]">
          {t("widget.cross_timeline_empty")}
        </p>
      </section>
    );
  }

  function dayLabel(daysLeft: number, overdue: boolean): string {
    if (overdue) return t("widget.cross_overdue");
    if (daysLeft === 0) return t("widget.cross_timeline_today");
    if (daysLeft === 1) return t("widget.cross_tomorrow");
    const label = t("widget.cross_in_days");
    return label.replace("{n}", String(daysLeft));
  }

  return (
    <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <GitBranch size={15} className="text-[color:var(--ds-text-muted)]" />
        <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
          {t("widget.cross_timeline")}
        </span>
        <span className="text-xs text-[color:var(--ds-text-subtle)]">{entries.length}</span>
      </div>
      <div className="relative">
        <div
          className="absolute top-1 bottom-1 left-[7px] w-px bg-[color:var(--ds-border)]"
          aria-hidden
        />
        <div className="space-y-2.5">
          {entries.map((entry) => {
            const Icon = entry.icon;
            return (
              <Link
                key={entry.id}
                href={entry.href}
                className="group relative flex items-start gap-3 rounded-md px-1 py-0.5 transition-colors hover:bg-[color:var(--ds-hover)]"
              >
                <div
                  className="relative z-10 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--ds-surface)]"
                  style={{ backgroundColor: entry.iconColor }}
                  aria-hidden
                >
                  <Icon size={8} className="text-white" strokeWidth={2.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[color:var(--ds-text)]">
                    {entry.title}
                  </p>
                  <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
                    {entry.caseName ? `${entry.caseName} · ` : ""}
                    {entry.eventType}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs font-medium tabular-nums ${
                    entry.overdue || entry.daysLeft <= 1
                      ? "text-[color:var(--ds-danger-text)]"
                      : entry.daysLeft <= 3
                        ? "text-[color:var(--ds-warning-text)]"
                        : "text-[color:var(--ds-text-subtle)]"
                  }`}
                >
                  {dayLabel(entry.daysLeft, entry.overdue)}
                </span>
                <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                  {entry.date.toLocaleDateString(locale, {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
