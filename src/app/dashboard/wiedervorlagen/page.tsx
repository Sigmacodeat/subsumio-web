"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Circle, Loader2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn, daysUntil, encodeSlugPath, formatDate, formatDaysUntil } from "@/lib/utils";

function openCreateDialog() {
  window.dispatchEvent(new Event("subsumio:create-wiedervorlage"));
}

export default function WiedervorlagenPage() {
  const { t } = useLang();
  const { addToast } = useToast();
  const client = useQueryClient();
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["legal-follow-ups"],
    queryFn: () => api.brain.listPages({ type: "legal_follow_up", limit: 500 }),
  });
  const casesQuery = useQuery({
    queryKey: ["wiedervorlagen-cases"],
    queryFn: () => api.cases.list({ limit: 200 }),
    staleTime: 60_000,
  });

  // The create dialog lives in the layout; refresh once it reports a new entry.
  useEffect(() => {
    const refresh = () => void client.invalidateQueries({ queryKey: ["legal-follow-ups"] });
    window.addEventListener("subsumio:practice-data-changed", refresh);
    return () => window.removeEventListener("subsumio:practice-data-changed", refresh);
  }, [client]);

  const caseTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of casesQuery.data ?? []) map.set(c.slug, c.title);
    return map;
  }, [casesQuery.data]);

  // Offene zuerst (nach Datum), erledigte am Ende.
  const items = useMemo(
    () =>
      [...(query.data ?? [])].sort((a, b) => {
        const doneA = Boolean(a.frontmatter?.completed);
        const doneB = Boolean(b.frontmatter?.completed);
        if (doneA !== doneB) return doneA ? 1 : -1;
        return String(a.frontmatter?.date ?? "").localeCompare(String(b.frontmatter?.date ?? ""));
      }),
    [query.data]
  );

  async function toggle(slug: string, completed: boolean) {
    setBusySlug(slug);
    try {
      await api.brain.updatePage({
        slug,
        frontmatter: {
          completed: !completed,
          completed_at: !completed ? new Date().toISOString() : null,
        },
      });
      await client.invalidateQueries({ queryKey: ["legal-follow-ups"] });
      window.dispatchEvent(new Event("subsumio:practice-data-changed"));
    } catch {
      addToast({
        type: "error",
        title: "Wiedervorlage nicht geändert",
        description: "Bitte versuchen Sie es erneut.",
      });
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("practice.followup.title")}
        description={t("practice.followup.page_description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("practice.followup.title") },
        ]}
        actions={
          <PrimaryAction onClick={openCreateDialog}>{t("practice.followup.new")}</PrimaryAction>
        }
      />
      {query.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          <span>Die Wiedervorlagen konnten nicht geladen werden.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void query.refetch()}
            className="shrink-0 gap-1.5 text-[color:var(--ds-danger-text)]"
          >
            <RotateCcw size={13} aria-hidden="true" />
            Erneut laden
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={t("practice.followup.empty")}
          description="Legen Sie eine Wiedervorlage an, um sich an einem bestimmten Tag an eine Akte erinnern zu lassen."
          actionLabel={t("practice.followup.new")}
          onAction={openCreateDialog}
        />
      ) : (
        <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          {items.map((item) => {
            const completed = Boolean(item.frontmatter?.completed);
            const date = String(item.frontmatter?.date ?? "");
            const caseSlug =
              typeof item.frontmatter?.case_slug === "string" ? item.frontmatter.case_slug : "";
            const days = daysUntil(date);
            const overdue = !completed && days !== null && days < 0;
            const busy = busySlug === item.slug;
            return (
              <li
                key={item.slug}
                className={cn("flex items-center gap-3 px-4 py-3", completed && "opacity-60")}
              >
                <button
                  type="button"
                  onClick={() => void toggle(item.slug, completed)}
                  disabled={busy}
                  aria-label={`${t(
                    completed ? "practice.followup.reopen" : "practice.followup.complete"
                  )}: ${item.title}`}
                  className="shrink-0 rounded-full p-1 transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                >
                  {busy ? (
                    <Loader2 size={20} className="animate-spin text-[color:var(--ds-text-muted)]" />
                  ) : completed ? (
                    <CheckCircle2 size={20} className="text-[color:var(--ds-success-text)]" />
                  ) : (
                    <Circle size={20} className="text-[color:var(--ds-text-subtle)]" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-medium text-[color:var(--ds-text)]",
                      completed && "line-through"
                    )}
                  >
                    {item.title}
                  </p>
                  {caseSlug ? (
                    <Link
                      href={`/dashboard/cases/${encodeSlugPath(caseSlug)}`}
                      className="block truncate text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:underline"
                    >
                      {caseTitles.get(caseSlug) ?? "Akte öffnen"}
                    </Link>
                  ) : null}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <time
                    className={cn(
                      "block text-sm font-medium",
                      overdue ? "text-[color:var(--ds-danger-text)]" : "text-[color:var(--ds-text)]"
                    )}
                    dateTime={date}
                  >
                    {formatDate(date)}
                  </time>
                  {!completed && days !== null && (
                    <span className="text-xs text-[color:var(--ds-text-muted)]">
                      {days < 0
                        ? `seit ${-days === 1 ? "gestern" : `${-days} Tagen`} fällig`
                        : formatDaysUntil(days)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
