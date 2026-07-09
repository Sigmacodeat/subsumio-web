"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Upload,
  Search,
  ArrowRight,
  FileText,
  AlertTriangle,
  Clock,
  Mail,
  FileCheck,
  PenSquare,
  Zap,
  X,
  CalendarPlus,
  Gavel,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/dashboard/skeleton";
import { useBrainStats, useRecentQueries } from "@/lib/queries/brain";
import { useKanzleiCockpitData } from "@/components/dashboard/widget-dashboard";
import { useSidebarBadges } from "@/lib/queries/sidebar-badges";
import { useMe } from "@/lib/queries/auth";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/content/site";
import type { BrainStats } from "@/lib/types";
import { StaggerContainer, StaggerItem } from "@/components/marketing/motion-system";

const WidgetBoard = dynamic(() =>
  import("@/components/dashboard/widget-board").then((m) => m.WidgetBoard)
);
const TaxWidgetBoard = dynamic(() =>
  import("@/components/dashboard/tax-widget-board").then((m) => m.TaxWidgetBoard)
);
const MorningBriefing = dynamic(
  () => import("@/components/dashboard/morning-briefing").then((m) => m.MorningBriefing),
  { ssr: false }
);
const TodayView = dynamic(
  () => import("@/components/dashboard/today-view").then((m) => m.TodayView),
  { ssr: false }
);
const WeeklyReview = dynamic(
  () => import("@/components/dashboard/weekly-review").then((m) => m.WeeklyReview),
  { ssr: false }
);

type Greeting = {
  greeting: string;
  sub: string;
};

function useGreeting(name: string | null, lang: Lang): Greeting {
  const [hour, setHour] = useState<number>(12);
  useEffect(() => {
    setHour(new Date().getHours());
  }, []);
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
      sub: "Hier ist, was heute deine Aufmerksamkeit braucht.",
    };
  if (hour < 18)
    return {
      greeting: isFirst ? "Guten Tag" : `Guten Tag, ${firstName}`,
      sub: "Hier ist, was heute deine Aufmerksamkeit braucht.",
    };
  return {
    greeting: isFirst ? "Guten Abend" : `Guten Abend, ${firstName}`,
    sub: "Hier ist, was heute deine Aufmerksamkeit braucht.",
  };
}

function CalmGreeting({ name }: { name: string | null }) {
  const { t, lang } = useLang();
  const router = useRouter();
  const { greeting, sub } = useGreeting(name, lang);
  const [query, setQuery] = useState("");
  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      })
    );
  }, [lang]);
  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim()) return;
      const value = query.trim();
      try {
        window.dispatchEvent(new CustomEvent("subsumio:copilot:open"));
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("subsumio:copilot:send", { detail: { query: value } })
          );
        }, 50);
        setQuery("");
      } catch {
        router.push(`/dashboard/chat?q=${encodeURIComponent(value)}`);
      }
    },
    [query, router]
  );

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p
          className="text-xs font-medium text-[color:var(--ds-text-subtle)]"
          suppressHydrationWarning
        >
          {dateStr}
        </p>
        <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-[color:var(--ds-text)] md:text-xl">
          {greeting}
        </h1>
        <p className="mt-1 text-[13px] text-[color:var(--ds-text-muted)]">{sub}</p>
      </div>
      <form onSubmit={onSubmit} className="relative w-full shrink-0 lg:w-96">
        <Search
          size={14}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("cockpit.ask_placeholder")}
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

function ProactiveActionBanner() {
  const { t } = useLang();
  const cockpit = useKanzleiCockpitData();
  const badges = useSidebarBadges();
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);

  const reviewInboxCount = badges.data?.["/dashboard/communications"]?.count ?? 0;

  const actions = useMemo(() => {
    const items: Array<{
      href: string;
      icon: typeof AlertTriangle;
      label: string;
      count: number;
      variant: "danger" | "warning" | "info";
    }> = [];

    const criticalCount = cockpit.criticalDeadlines.length;
    if (criticalCount > 0) {
      items.push({
        href: "/dashboard/deadlines",
        icon: Clock,
        label: t("cockpit.stat_deadlines"),
        count: criticalCount,
        variant: "danger",
      });
    }

    const inboxCount = cockpit.inboxItems.length;
    if (inboxCount > 0) {
      items.push({
        href: "/dashboard/intake",
        icon: Mail,
        label: t("cockpit.stat_inbox"),
        count: inboxCount,
        variant: "info",
      });
    }

    if (reviewInboxCount > 0) {
      items.push({
        href: "/dashboard/communications?view=review",
        icon: FileCheck,
        label: t("cockpit.stat_review_inbox"),
        count: reviewInboxCount,
        variant: "warning",
      });
    }

    const reviewCount = cockpit.pendingReviews.length;
    if (reviewCount > 0) {
      items.push({
        href: "/dashboard/review-queue",
        icon: FileCheck,
        label: t("cockpit.stat_reviews"),
        count: reviewCount,
        variant: "warning",
      });
    }

    const sigCount = cockpit.pendingSignatures.length;
    if (sigCount > 0) {
      items.push({
        href: "/dashboard/docusign",
        icon: PenSquare,
        label: t("cockpit.stat_signatures"),
        count: sigCount,
        variant: "warning",
      });
    }

    const gapsCount = cockpit.unassignedDocs.length + cockpit.reviewGaps.length;
    if (gapsCount > 0) {
      items.push({
        href: "/dashboard/vault",
        icon: AlertTriangle,
        label: t("cockpit.gaps_title"),
        count: gapsCount,
        variant: "danger",
      });
    }

    return items;
  }, [cockpit, reviewInboxCount, t]);

  const actionSignature = actions.map((action) => `${action.href}:${action.count}`).join("|");
  useEffect(() => {
    try {
      setDismissedSignature(sessionStorage.getItem("subsumio:dashboard-actions-dismissed"));
    } catch {}
  }, []);

  if (actions.length === 0 || dismissedSignature === actionSignature) return null;

  const variantClasses = {
    danger:
      "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
    warning:
      "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
    info: "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  };

  return (
    <StaggerContainer>
      <StaggerItem>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 md:p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <Zap size={14} className="text-[color:var(--brand-primary)]" />
            <span className="text-xs font-semibold text-[color:var(--ds-text)]">
              {t("cockpit.action_needed")}
            </span>
            <button
              type="button"
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ds-text-subtle)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              aria-label={t("common.close")}
              onClick={() => {
                try {
                  sessionStorage.setItem("subsumio:dashboard-actions-dismissed", actionSignature);
                } catch {}
                setDismissedSignature(actionSignature);
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`group inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-[opacity,transform] hover:opacity-90 active:scale-95 ${variantClasses[action.variant]}`}
                >
                  <Icon size={13} />
                  <span>{action.label}</span>
                  <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-xs font-bold tabular-nums">
                    {action.count}
                  </span>
                  <ArrowRight
                    size={11}
                    className="ml-0.5 opacity-60 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              );
            })}
          </div>
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}

function DashboardQuickActions() {
  const { t } = useLang();
  const actions = [
    { label: t("dashboard.quick_deadline"), icon: CalendarPlus, event: "subsumio:create-deadline" },
    { label: t("cockpit.action_case"), icon: Briefcase, event: "subsumio:create-case" },
    { label: t("dashboard.quick_upload"), icon: Upload, href: "/dashboard/upload" },
    { label: t("dashboard.quick_drafting"), icon: FileText, href: "/dashboard/drafting" },
    { label: t("dashboard.quick_research"), icon: Gavel, href: "/dashboard/research" },
  ];
  return (
    <section aria-label={t("dashboard.quick_actions")} className="overflow-x-auto">
      <div className="flex min-w-max gap-2">
        {actions.map(({ label, icon: Icon, event, href }) => {
          const content = (
            <>
              <Icon size={14} aria-hidden="true" />
              <span>{label}</span>
            </>
          );
          const classes =
            "inline-flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]";
          return href ? (
            <Link key={label} href={href} className={classes}>
              {content}
            </Link>
          ) : (
            <button
              key={label}
              type="button"
              className={classes}
              onClick={() => window.dispatchEvent(new CustomEvent(event!))}
            >
              {content}
            </button>
          );
        })}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--brand-primary)]/40 bg-[color:var(--brand-glow)] px-3 py-2 text-xs font-medium text-[color:var(--brand-primary)] transition-[background-color,border-color] hover:border-[color:var(--brand-primary)]/70 hover:bg-[color:var(--brand-glow)]"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("subsumio:copilot:open"));
          }}
        >
          <Search size={14} aria-hidden="true" />
          <span>{t("cockpit.ask_placeholder")}</span>
        </button>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const [dashboardView, setDashboardView] = useState<"today" | "dashboard">("today");
  const statsQuery = useBrainStats();
  const recentQuery = useRecentQueries(5);
  const meQuery = useMe();
  const { t } = useLang();

  const stats = (statsQuery.data ?? null) as BrainStats | null;
  const loading = statsQuery.isLoading && recentQuery.isLoading;
  const degraded = statsQuery.isError;

  const isFirstTime =
    !loading && !degraded && (stats?.total_pages ?? 0) === 0 && (stats?.total_queries ?? 0) === 0;

  useEffect(() => {
    const stored = localStorage.getItem("subsumio:dashboard-view");
    if (stored === "today" || stored === "dashboard") setDashboardView(stored);
  }, []);

  const selectDashboardView = (view: "today" | "dashboard") => {
    setDashboardView(view);
    localStorage.setItem("subsumio:dashboard-view", view);
  };

  if (loading) {
    return <PageSkeleton />;
  }

  const userName = meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? null;
  const industry = meQuery.data?.user?.industry ?? "legal";
  const isTax = industry === "tax";

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      {!isFirstTime && <ProactiveActionBanner />}
      <WeeklyReview />

      {isFirstTime && (
        <StaggerContainer>
          <StaggerItem>
            <div className="rounded-lg border border-[color:var(--brand-primary)]/20 bg-[color:var(--brand-glow)] p-4 md:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {isTax ? t("dashboard.welcome_tax") : t("dashboard.welcome")}
                  </h2>
                  <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[color:var(--ds-text-muted)]">
                    {isTax ? t("dashboard.welcome_tax_desc") : t("dashboard.welcome_desc")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="glow"
                    data-tour="quick-create"
                    onClick={() => window.dispatchEvent(new CustomEvent("subsumio:quick-create"))}
                  >
                    {isTax ? (
                      <>
                        <FileText size={14} /> {t("dashboard.welcome_tax_action")}
                      </>
                    ) : (
                      <>
                        <Briefcase size={14} /> {t("cockpit.action_case")}
                      </>
                    )}
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

      <CalmGreeting name={userName} />

      <DashboardQuickActions />

      <div
        className="flex w-fit rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1"
        role="tablist"
        aria-label={t("today.view_selector")}
      >
        {(["today", "dashboard"] as const).map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={dashboardView === view}
            onClick={() => selectDashboardView(view)}
            className={
              dashboardView === view
                ? "rounded-md bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-sm font-medium text-[color:var(--ds-text)]"
                : "rounded-md px-3 py-1.5 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            }
          >
            {t(view === "today" ? "today.title" : "today.dashboard")}
          </button>
        ))}
      </div>

      {!isFirstTime && <MorningBriefing />}

      {dashboardView === "today" ? <TodayView /> : isTax ? <TaxWidgetBoard /> : <WidgetBoard />}
    </div>
  );
}
