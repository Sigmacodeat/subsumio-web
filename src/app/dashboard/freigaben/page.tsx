"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileSearch,
  Inbox,
  Send,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowSkeleton } from "@/components/dashboard/skeleton";
import { api } from "@/lib/api";
import type { ApprovalCategoryKey, ApprovalSummary } from "@/lib/approval-summary";

const ICONS: Record<ApprovalCategoryKey, LucideIcon> = {
  deadlines: CalendarClock,
  agent_actions: Bot,
  client_input: Inbox,
  analyses: FileSearch,
  requests: Send,
  time: Clock,
};

export default function FreigabenPage() {
  const query = useQuery({
    queryKey: ["approvals", "summary"],
    queryFn: async () => (await api.get<{ data: ApprovalSummary }>("/api/approvals/summary")).data,
    refetchInterval: 60_000,
  });
  const summary = query.data;
  const open = summary?.categories.filter((c) => c.count > 0) ?? [];
  // Urgent categories first, then by size; empty ones are listed compactly below.
  open.sort((a, b) => b.urgent - a.urgent || b.count - a.count);
  const done = summary?.categories.filter((c) => c.count === 0) ?? [];

  return (
    <div className="ds-page ds-page-medium space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Freigaben"
        description="Alles, was auf Ihre Entscheidung wartet: KI-Fristen, Aktionen von Copilot und Agenten, Mandanteneingaben, Analysen und Zeitvorschläge."
        breadcrumbs={[{ label: "Übersicht", href: "/dashboard" }, { label: "Freigaben" }]}
      />

      {query.isLoading ? (
        <div role="status" aria-label="Freigaben werden geladen">
          <RowSkeleton count={4} />
        </div>
      ) : query.isError || !summary ? (
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4 text-sm text-[color:var(--ds-danger-text)]"
        >
          Die Freigaben konnten nicht geladen werden. Bitte laden Sie die Seite in einem Moment neu.
        </div>
      ) : (
        <>
          {summary.unavailable.length > 0 && (
            <p className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]">
              <AlertTriangle size={14} aria-hidden="true" />
              Ein Teil der Freigaben konnte nicht gelesen werden. Die Zahlen können unvollständig
              sein.
            </p>
          )}

          {open.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nichts offen"
              description="Keine Frist, Aktion oder Eingabe wartet auf Ihre Freigabe."
            />
          ) : (
            <ul className="space-y-3">
              {open.map((c) => {
                const Icon = ICONS[c.key];
                return (
                  <li
                    key={c.key}
                    className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                  >
                    <div className="flex items-start gap-3 p-4">
                      <Icon
                        size={18}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                            {c.label}
                          </h2>
                          <span className="rounded-full bg-[color:var(--ds-hover)] px-2 py-0.5 text-xs text-[color:var(--ds-text)] tabular-nums">
                            {c.count}
                          </span>
                          {c.urgent > 0 && (
                            <span className="rounded-full border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-2 py-0.5 text-xs text-[color:var(--ds-danger-text)] tabular-nums">
                              {c.urgent} dringend
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                          {c.description}
                        </p>
                        <ul className="mt-3 space-y-1.5">
                          {c.preview.map((p, i) => (
                            <li key={i} className="flex min-w-0 items-baseline gap-2 text-sm">
                              {p.urgent && <span className="sr-only">Dringend:</span>}
                              <span
                                aria-hidden="true"
                                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${p.urgent ? "bg-[color:var(--ds-danger-text)]" : "bg-[color:var(--ds-border)]"}`}
                              />
                              <span className="min-w-0 truncate text-[color:var(--ds-text)]">
                                {p.title}
                                {p.caseTitle && (
                                  <span className="text-[color:var(--ds-text-muted)]">
                                    {" "}
                                    · {p.caseTitle}
                                  </span>
                                )}
                                {p.detail && (
                                  <span className="text-[color:var(--ds-text-muted)]">
                                    {" "}
                                    · {p.detail}
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Link
                        href={c.href}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[color:var(--ds-border)] px-2.5 py-1.5 text-xs whitespace-nowrap text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                      >
                        {c.count > c.preview.length ? `Alle ${c.count} prüfen` : "Prüfen"}
                        <ArrowRight size={12} aria-hidden="true" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {done.length > 0 && open.length > 0 && (
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              Nichts offen bei: {done.map((c) => c.label).join(", ")}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
