"use client";

import { Skeleton } from "@/components/ui/skeleton";

import { useState, useEffect, useCallback } from "react";
import { markdownToPlainText } from "@/lib/markdown";
import { formatDaysUntil } from "@/lib/utils";
import { Sparkles, RefreshCw, Clock, Mail, FileCheck, ArrowRight } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { AI_BADGE_LABEL } from "@/lib/ai-act";
import { StaggerContainer, StaggerItem } from "@/components/marketing/motion-system";

import {
  loadBriefing,
  readBriefingCache as readCache,
  type BriefingResponse,
} from "@/lib/briefing-cache";

function isSameDay(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

/**
 * `compact`: only the written situation report, for the Übersicht where the
 * figures and deadlines already have their own sections. Renders nothing when
 * no model wrote a narrative (the statistical fallback would repeat the KPIs).
 */
export function MorningBriefing({ compact = false }: { compact?: boolean } = {}) {
  const { t, lang } = useLang();
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchBriefing = useCallback(
    async (force: boolean) => {
      if (!force) {
        const cached = readCache();
        if (cached && isSameDay(cached.generatedAt)) {
          setBriefing(cached);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(false);
      try {
        const result = await loadBriefing(lang, { force });
        if (!result) throw new Error("empty briefing");
        setBriefing(result);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [lang]
  );

  useEffect(() => {
    fetchBriefing(false);
  }, [fetchBriefing]);

  const stats = briefing?.data;
  const hasContent =
    stats &&
    (stats.criticalDeadlines > 0 ||
      stats.overdueDeadlines > 0 ||
      stats.inboxItems > 0 ||
      stats.pendingReviews > 0 ||
      stats.pendingSignatures > 0 ||
      stats.unassignedDocs > 0 ||
      stats.followUpsToday > 0 ||
      (stats.activeDelegations?.length ?? 0) > 0);

  if (compact) {
    // No placeholder while loading: the section only appears once a model has
    // actually written a report, so the column never jumps when it is absent.
    if (loading || !briefing || briefing.usedFallback || !briefing.narrative?.trim()) {
      return null;
    }
    return (
      <section
        aria-labelledby="overview-briefing"
        className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--ds-shadow-1)]"
      >
        <h2
          id="overview-briefing"
          className="border-b border-[color:var(--ds-border)] px-4 py-3 text-[15px] font-semibold text-[color:var(--ds-text)] md:px-5"
        >
          Tageslage
        </h2>
        {loading || !briefing ? (
          <div className="space-y-2 px-4 py-4 md:px-5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : (
          <div className="px-4 py-4 md:px-5">
            <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
              {markdownToPlainText(briefing.narrative)}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-[color:var(--ds-text-subtle)]">
                {AI_BADGE_LABEL}
              </span>
              <button
                type="button"
                onClick={() => fetchBriefing(true)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-[color:var(--ds-text-subtle)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
              >
                <RefreshCw size={11} aria-hidden />
                Aktualisieren
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  if (loading) {
    return (
      <StaggerContainer>
        <StaggerItem>
          <div className="rounded-xl border border-[color:var(--brand-primary)]/20 bg-gradient-to-br from-[color:var(--brand-glow)] to-transparent p-4 shadow-[var(--card-shadow)]">
            <div className="flex items-center gap-3">
              <div className="brand-soft brand-border flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
                <Sparkles size={16} className="brand-text" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          </div>
        </StaggerItem>
      </StaggerContainer>
    );
  }

  if (error && !briefing) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="shrink-0 text-[color:var(--ds-text-subtle)]" />
          <p className="text-[13px] text-[color:var(--ds-text-muted)]">
            {lang === "en"
              ? "KI-Morgenbriefing nicht verfügbar"
              : "KI-Morgenbriefing nicht verfügbar"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchBriefing(true)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[color:var(--ds-text-subtle)] transition-[background-color,border-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
          title={lang === "en" ? "Retry" : "Aktualisieren"}
        >
          <RefreshCw size={11} />
          {lang === "en" ? "Retry" : "Erneut"}
        </button>
      </div>
    );
  }

  if (!briefing || !hasContent) {
    return null;
  }

  const quickStats: Array<{
    icon: typeof Clock;
    count: number;
    label: string;
    variant: "danger" | "warning" | "info";
  }> = [];

  if (stats!.overdueDeadlines > 0) {
    quickStats.push({
      icon: Clock,
      count: stats!.overdueDeadlines,
      label: lang === "en" ? "Overdue" : "Überfällig",
      variant: "danger",
    });
  }
  if (stats!.criticalDeadlines > 0) {
    quickStats.push({
      icon: Clock,
      count: stats!.criticalDeadlines,
      label: lang === "en" ? "Critical" : "Kritisch",
      variant: "danger",
    });
  }
  if (stats!.inboxItems > 0) {
    quickStats.push({
      icon: Mail,
      count: stats!.inboxItems,
      label: lang === "en" ? "Inbox" : "Eingang",
      variant: "info",
    });
  }
  if (stats!.followUpsToday > 0) {
    quickStats.push({
      icon: Clock,
      count: stats!.followUpsToday,
      label: t("today.followups"),
      variant: "info",
    });
  }
  if (stats!.pendingReviews > 0) {
    quickStats.push({
      icon: FileCheck,
      count: stats!.pendingReviews,
      label: lang === "en" ? "Reviews" : "Freigaben",
      variant: "warning",
    });
  }

  const variantClasses = {
    danger: "text-[color:var(--ds-danger-text)]",
    warning: "text-[color:var(--ds-warning-text)]",
    info: "text-[color:var(--ds-info-text)]",
  };

  return (
    <StaggerContainer>
      <StaggerItem>
        <div className="rounded-xl border border-[color:var(--brand-primary)]/20 bg-gradient-to-br from-[color:var(--brand-glow)] to-transparent p-4 shadow-[var(--card-shadow)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="brand-soft brand-border flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <Sparkles size={15} className="brand-text" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {lang === "en" ? "AI Morning Briefing" : "KI-Morgenbriefing"}
                </h3>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {briefing.usedFallback
                    ? lang === "en"
                      ? "Statistical summary"
                      : "Statistische Zusammenfassung"
                    : lang === "en"
                      ? "AI-generated"
                      : "KI-generiert"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fetchBriefing(true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ds-text-subtle)] transition-[background-color,border-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
              title={lang === "en" ? "Refresh" : "Aktualisieren"}
              aria-label={lang === "en" ? "Refresh briefing" : "Briefing aktualisieren"}
            >
              <RefreshCw size={13} />
            </button>
          </div>

          <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
            {markdownToPlainText(briefing.narrative)}
          </p>

          {!briefing.usedFallback && (
            <p className="mt-2 text-[11px] font-medium text-[color:var(--ds-text-subtle)]">
              {AI_BADGE_LABEL}
            </p>
          )}

          {quickStats.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {quickStats.map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs font-medium ${variantClasses[stat.variant]}`}
                  >
                    <Icon size={12} />
                    <span className="font-bold">{stat.count}</span>
                    <span className="text-[color:var(--ds-text-muted)]">{stat.label}</span>
                  </span>
                );
              })}
            </div>
          )}

          {stats!.activeDelegations && stats!.activeDelegations.length > 0 && (
            <div className="mt-3 space-y-1">
              {stats!.activeDelegations.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-md bg-[color:var(--ds-surface-2)] px-2.5 py-1.5"
                >
                  <span className="truncate text-xs text-[color:var(--ds-text)]">
                    {lang === "en" ? `${d.name} absent` : `${d.name} abwesend`}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-[color:var(--ds-info-text)]">
                    {lang === "en"
                      ? `${d.delegate} until ${d.until}`
                      : `${d.delegate} bis ${d.until}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {stats!.topDeadlines.length > 0 && (
            <div className="mt-3 space-y-1">
              {stats!.topDeadlines.slice(0, 3).map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md bg-[color:var(--ds-surface-2)] px-2.5 py-1.5"
                >
                  <span className="min-w-0 truncate text-xs text-[color:var(--ds-text)]">
                    {d.title}
                    {d.delegate && (
                      <span className="ml-1.5 text-[color:var(--ds-info-text)]">
                        · {lang === "en" ? "repr." : "Vertr."} {d.delegate}
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      d.daysLeft < 0
                        ? "text-[color:var(--ds-danger-text)]"
                        : d.daysLeft <= 3
                          ? "text-[color:var(--ds-warning-text)]"
                          : "text-[color:var(--ds-text-subtle)]"
                    }`}
                  >
                    {lang === "en"
                      ? d.daysLeft < 0
                        ? `${Math.abs(d.daysLeft)} days overdue`
                        : d.daysLeft === 0
                          ? "Today"
                          : `in ${d.daysLeft} days`
                      : formatDaysUntil(d.daysLeft)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-end">
            <a
              href="/dashboard/deadlines"
              className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand-primary)] transition-opacity hover:opacity-80"
            >
              {lang === "en" ? "View all deadlines" : "Alle Fristen ansehen"}
              <ArrowRight size={12} />
            </a>
          </div>
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}
