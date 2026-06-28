"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Briefcase, Upload, Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/dashboard/skeleton";
import { WidgetBoard } from "@/components/dashboard/widget-board";
import { useBrainStats, useRecentQueries } from "@/lib/queries/brain";
import { useMe } from "@/lib/queries/auth";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/content/site";
import type { BrainStats, RecentQuery } from "@/lib/types";
import { StaggerContainer, StaggerItem } from "@/components/marketing/motion-system";

type Greeting = {
  greeting: string;
  sub: string;
};

function useGreeting(name: string | null, lang: Lang): Greeting {
  const hour = new Date().getHours();
  const isFirst = !name;
  const firstName = name?.split(" ")[0] ?? "";
  if (lang === "en") {
    if (hour < 12)
      return {
        greeting: isFirst ? "Good morning" : `Good morning, ${firstName}`,
        sub: "Here's what needs your attention today.",
      };
    if (hour < 18)
      return {
        greeting: isFirst ? "Good afternoon" : `Good afternoon, ${firstName}`,
        sub: "Here's what needs your attention today.",
      };
    return {
      greeting: isFirst ? "Good evening" : `Good evening, ${firstName}`,
      sub: "Here's what needs your attention today.",
    };
  }
  if (hour < 12)
    return {
      greeting: isFirst ? "Guten Morgen" : `Guten Morgen, ${firstName}`,
      sub: "Hier ist, was heute Ihre Aufmerksamkeit braucht.",
    };
  if (hour < 18)
    return {
      greeting: isFirst ? "Guten Tag" : `Guten Tag, ${firstName}`,
      sub: "Hier ist, was heute Ihre Aufmerksamkeit braucht.",
    };
  return {
    greeting: isFirst ? "Guten Abend" : `Guten Abend, ${firstName}`,
    sub: "Hier ist, was heute Ihre Aufmerksamkeit braucht.",
  };
}

function CalmGreeting({
  name,
  engineOnline,
  degraded,
}: {
  name: string | null;
  engineOnline: boolean;
  degraded: boolean;
}) {
  const { t, lang } = useLang();
  const { greeting, sub } = useGreeting(name, lang);
  const [query, setQuery] = useState("");
  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim()) return;
      window.location.href = `/dashboard/chat?q=${encodeURIComponent(query.trim())}`;
    },
    [query]
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p
          className="text-xs font-medium text-[color:var(--ds-text-subtle)]"
          suppressHydrationWarning
        >
          {new Date().toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </p>
        <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-[color:var(--ds-text)] md:text-xl">
          {greeting}
        </h1>
        <p className="mt-1 text-[13px] text-[color:var(--ds-text-muted)]">
          {sub}
          {!degraded && engineOnline && (
            <span className="ml-2 inline-flex items-center gap-1 text-[color:var(--ds-success-text)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ds-success-text)]" />
              {t("dashboard.connected")}
            </span>
          )}
        </p>
      </div>
      <form onSubmit={onSubmit} className="relative w-full max-w-md shrink-0">
        <Search
          size={14}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === "en" ? "Ask AI anything…" : "KI fragen…"}
          className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-9 pl-9 text-[13px] text-[color:var(--ds-text)] transition-[border-color,box-shadow] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
        />
        <button
          type="submit"
          className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[color:var(--ds-text-subtle)] transition-colors hover:text-[color:var(--ds-text)]"
          aria-label="Send"
        >
          <ArrowRight size={14} />
        </button>
      </form>
    </div>
  );
}

export default function DashboardPage() {
  const statsQuery = useBrainStats();
  const recentQuery = useRecentQueries(5);
  const meQuery = useMe();
  const { t } = useLang();

  const stats = (statsQuery.data ?? null) as BrainStats | null;
  const recent = (recentQuery.data ?? []) as RecentQuery[];
  const loading = statsQuery.isLoading && recentQuery.isLoading;
  const degraded = statsQuery.isError;

  const engineOnline = useMemo(() => {
    if (stats) {
      return stats.total_pages > 0 || stats.total_edges > 0 || stats.total_queries > 0;
    }
    if (recent.length > 0) return true;
    return false;
  }, [stats, recent.length]);

  if (loading) {
    return <PageSkeleton />;
  }

  const isFirstTime =
    !loading && !degraded && (stats?.total_pages ?? 0) === 0 && (stats?.total_queries ?? 0) === 0;

  const userName = meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      {isFirstTime && (
        <StaggerContainer>
          <StaggerItem>
            <div className="rounded-lg border border-[color:var(--brand-primary)]/20 bg-[color:var(--brand-glow)] p-4 md:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {t("dashboard.welcome")}
                  </h2>
                  <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[color:var(--ds-text-muted)]">
                    {t("dashboard.welcome_desc")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="glow"
                    onClick={() => window.dispatchEvent(new CustomEvent("subsumio:create-case"))}
                  >
                    <Briefcase size={14} /> {t("cockpit.action_case")}
                  </Button>
                  <Link href="/dashboard/import-kanzlei">
                    <Button size="sm" variant="outline">
                      <Upload size={14} /> {t("dashboard.welcome_upload")}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </StaggerItem>
        </StaggerContainer>
      )}

      <CalmGreeting name={userName} engineOnline={engineOnline} degraded={degraded} />

      <WidgetBoard />
    </div>
  );
}
