"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, RefreshCw, Clock, Mail, FileCheck, ArrowRight } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { StaggerContainer, StaggerItem } from "@/components/marketing/motion-system";

interface BriefingData {
  criticalDeadlines: number;
  overdueDeadlines: number;
  inboxItems: number;
  pendingReviews: number;
  pendingSignatures: number;
  openInvoices: number;
  activeCases: number;
  unassignedDocs: number;
  reviewGaps: number;
  overdueReconciliations: number;
  followUpsToday: number;
  topDeadlines: Array<{ title: string; due: string; daysLeft: number }>;
  topCases: Array<{ title: string; status: string }>;
}

interface BriefingResponse {
  narrative: string;
  data: BriefingData;
  generatedAt: string;
  usedFallback: boolean;
}

const CACHE_KEY = "subsumio:morning-briefing";
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

function readCache(): BriefingResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BriefingResponse & { cachedAt: string };
    const age = Date.now() - new Date(parsed.cachedAt).getTime();
    if (age > CACHE_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(briefing: BriefingResponse) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...briefing, cachedAt: new Date().toISOString() })
    );
  } catch {
    // ignore quota errors
  }
}

function isSameDay(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

export function MorningBriefing() {
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
        const res = await csrfFetch("/api/dashboard/briefing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: lang }),
          signal: AbortSignal.timeout(50_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: BriefingResponse };
        const result = json.data;
        setBriefing(result);
        writeCache(result);
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
      stats.followUpsToday > 0);

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
                <div className="h-4 w-48 animate-pulse rounded bg-[color:var(--ds-border)]" />
                <div className="h-3 w-full animate-pulse rounded bg-[color:var(--ds-border)]" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-[color:var(--ds-border)]" />
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
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              title={lang === "en" ? "Refresh" : "Aktualisieren"}
              aria-label={lang === "en" ? "Refresh briefing" : "Briefing aktualisieren"}
            >
              <RefreshCw size={13} />
            </button>
          </div>

          <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
            {briefing.narrative}
          </p>

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

          {stats!.topDeadlines.length > 0 && (
            <div className="mt-3 space-y-1">
              {stats!.topDeadlines.slice(0, 3).map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md bg-[color:var(--ds-surface-2)] px-2.5 py-1.5"
                >
                  <span className="truncate text-xs text-[color:var(--ds-text)]">{d.title}</span>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      d.daysLeft < 0
                        ? "text-[color:var(--ds-danger-text)]"
                        : d.daysLeft <= 3
                          ? "text-[color:var(--ds-warning-text)]"
                          : "text-[color:var(--ds-text-subtle)]"
                    }`}
                  >
                    {d.daysLeft < 0
                      ? lang === "en"
                        ? `${Math.abs(d.daysLeft)}d overdue`
                        : `${Math.abs(d.daysLeft)}T überfällig`
                      : d.daysLeft === 0
                        ? lang === "en"
                          ? "Today"
                          : "Heute"
                        : lang === "en"
                          ? `${d.daysLeft}d left`
                          : `noch ${d.daysLeft}T`}
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
