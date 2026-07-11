"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function WiedervorlagenPage() {
  const { t, lang } = useLang();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["legal-follow-ups"],
    queryFn: () => api.brain.listPages({ type: "legal_follow_up", limit: 500 }),
  });
  const items = useMemo(
    () =>
      [...(query.data ?? [])].sort((a, b) =>
        String(a.frontmatter?.date ?? "").localeCompare(String(b.frontmatter?.date ?? ""))
      ),
    [query.data]
  );

  async function toggle(slug: string, completed: boolean) {
    await api.brain.updatePage({
      slug,
      frontmatter: {
        completed: !completed,
        completed_at: !completed ? new Date().toISOString() : null,
      },
    });
    await client.invalidateQueries({ queryKey: ["legal-follow-ups"] });
    window.dispatchEvent(new Event("subsumio:practice-data-changed"));
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("practice.followup.title")}
        description={t("practice.followup.page_description")}
        actions={
          <Button onClick={() => window.dispatchEvent(new Event("subsumio:create-wiedervorlage"))}>
            <Plus size={15} aria-hidden="true" />
            {t("practice.followup.new")}
          </Button>
        }
      />
      {query.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4 text-sm text-[color:var(--ds-danger-text)]"
        >
          {t("common.error")}
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border)] text-center">
          <CalendarClock
            size={36}
            className="mb-3 text-[color:var(--ds-text-subtle)]"
            aria-hidden="true"
          />
          <p className="font-medium">{t("practice.followup.empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const completed = Boolean(item.frontmatter?.completed);
            const date = String(item.frontmatter?.date ?? "");
            return (
              <div
                key={item.slug}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4",
                  completed && "opacity-60"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(item.slug, completed)}
                  aria-label={t(
                    completed ? "practice.followup.reopen" : "practice.followup.complete"
                  )}
                  className="rounded-full p-1 hover:bg-[color:var(--ds-hover)]"
                >
                  <CheckCircle2
                    size={20}
                    className={
                      completed
                        ? "text-[color:var(--ds-success-text)]"
                        : "text-[color:var(--ds-text-subtle)]"
                    }
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "font-medium text-[color:var(--ds-text)]",
                      completed && "line-through"
                    )}
                  >
                    {item.title}
                  </p>
                  {item.frontmatter?.case_slug ? (
                    <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
                      {String(item.frontmatter.case_slug)}
                    </p>
                  ) : null}
                </div>
                <time
                  className="text-sm text-[color:var(--ds-text-muted)] tabular-nums"
                  dateTime={date}
                >
                  {date
                    ? new Date(`${date}T12:00:00`).toLocaleDateString(
                        lang === "en" ? "en-GB" : "de-DE"
                      )
                    : "—"}
                </time>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
