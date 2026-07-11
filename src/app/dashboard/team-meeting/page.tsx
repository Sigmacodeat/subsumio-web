"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, Trash2, Users, RefreshCw, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";

interface AgendaItem {
  id: string;
  title: string;
  caseRef: string;
  assignee: string;
  status: "open" | "done";
  priority: "low" | "medium" | "high";
}

interface TeamMeeting {
  slug: string;
  title: string;
  date: string;
  items: AgendaItem[];
  notes: string;
}

export default function TeamMeetingPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [meetings, setMeetings] = useState<TeamMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "legal_team_meeting", limit: 50 });
      const mapped: TeamMeeting[] = pages.map((p: BrainPage) => ({
        slug: p.slug,
        title: p.title,
        date: String(p.frontmatter?.date ?? ""),
        items: (p.frontmatter?.items as AgendaItem[]) ?? [],
        notes: String(p.content ?? ""),
      }));
      mapped.sort((a, b) => b.date.localeCompare(a.date));
      setMeetings(mapped);
    } catch {
      addToast({ type: "error", title: t("common.error") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function autoGenerate() {
    setGenerating(true);
    try {
      const deadlines = await api.brain.listPages({ type: "legal_deadline", limit: 100 });
      const followUps = await api.brain.listPages({ type: "legal_follow_up", limit: 100 });
      const now = new Date();
      const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const upcomingDeadlines = deadlines.filter((p) => {
        const due = p.frontmatter?.due_date as string | undefined;
        return due && new Date(due) <= weekAhead && new Date(due) >= now;
      });

      const openFollowUps = followUps.filter((p) => !p.frontmatter?.completed);

      const items: AgendaItem[] = [];

      upcomingDeadlines.slice(0, 5).forEach((p) => {
        items.push({
          id: `dl-${p.slug}`,
          title: t("team_meeting.item_deadline").replace("{title}", p.title),
          caseRef: String(p.frontmatter?.case_slug ?? ""),
          assignee: String(p.frontmatter?.responsible ?? ""),
          status: "open",
          priority: "high",
        });
      });

      openFollowUps.slice(0, 5).forEach((p) => {
        items.push({
          id: `fu-${p.slug}`,
          title: t("team_meeting.item_followup").replace("{title}", p.title),
          caseRef: String(p.frontmatter?.case_slug ?? ""),
          assignee: String(p.frontmatter?.responsible ?? ""),
          status: "open",
          priority: "medium",
        });
      });

      if (items.length === 0) {
        items.push(
          {
            id: "default-1",
            title: t("team_meeting.default_item_1"),
            caseRef: "",
            assignee: "",
            status: "open",
            priority: "medium",
          },
          {
            id: "default-2",
            title: t("team_meeting.default_item_2"),
            caseRef: "",
            assignee: "",
            status: "open",
            priority: "medium",
          },
          {
            id: "default-3",
            title: t("team_meeting.default_item_3"),
            caseRef: "",
            assignee: "",
            status: "open",
            priority: "low",
          }
        );
      }

      const slug = `legal/team-meetings/${Date.now().toString(36)}`;
      const dateStr = new Date().toISOString();
      await api.brain.createPage({
        slug,
        title: `${t("team_meeting.title")} ${new Date().toLocaleDateString("de-DE")}`,
        type: "legal_team_meeting",
        content: "",
        frontmatter: {
          date: dateStr,
          items,
          auto_generated: true,
        },
      });
      addToast({ type: "success", title: t("team_meeting.generate_success") });
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    } finally {
      setGenerating(false);
    }
  }

  async function deleteMeeting(meeting: TeamMeeting) {
    try {
      await api.brain.deletePage(meeting.slug);
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    }
  }

  async function toggleItem(meeting: TeamMeeting, itemId: string) {
    const updatedItems = meeting.items.map((item) =>
      item.id === itemId
        ? { ...item, status: item.status === "open" ? ("done" as const) : ("open" as const) }
        : item
    );
    try {
      await api.brain.updatePage({
        slug: meeting.slug,
        frontmatter: { items: updatedItems },
      });
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    }
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("team_meeting.title")}
        description={t("team_meeting.desc")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("team_meeting.title") },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={autoGenerate} disabled={generating}>
              {generating ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RefreshCw size={15} />
              )}
              {t("team_meeting.generate")}
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-16 text-center">
          <Users size={32} className="mb-3 text-[color:var(--ds-text-subtle)]" aria-hidden="true" />
          <p className="text-sm font-medium text-[color:var(--ds-text-muted)]">
            {t("team_meeting.empty_title")}
          </p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {t("team_meeting.empty_desc")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => (
            <div
              key={meeting.slug}
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-center gap-2">
                <CalendarDays
                  size={14}
                  className="text-[color:var(--brand-primary)]"
                  aria-hidden="true"
                />
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {meeting.title}
                </h3>
                <span className="text-xs text-[color:var(--ds-text-subtle)]">
                  {new Date(meeting.date).toLocaleDateString("de-DE")}
                </span>
                <button
                  type="button"
                  onClick={() => deleteMeeting(meeting)}
                  aria-label={t("common.delete")}
                  className="ml-auto rounded p-1 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-danger-text)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {meeting.items.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {meeting.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleItem(meeting, item.id)}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          item.status === "done"
                            ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white"
                            : "border-[color:var(--ds-border)] hover:border-[color:var(--brand-primary)]"
                        }`}
                        aria-label={item.title}
                      >
                        {item.status === "done" && "✓"}
                      </button>
                      <span
                        className={`flex-1 text-sm ${
                          item.status === "done"
                            ? "text-[color:var(--ds-text-subtle)] line-through"
                            : "text-[color:var(--ds-text)]"
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.priority === "high" && (
                        <Badge
                          variant="default"
                          className="border-[color:var(--ds-danger-border)] text-xs text-[color:var(--ds-danger-text)]"
                        >
                          {t("mattertab.urgency_high")}
                        </Badge>
                      )}
                      {item.assignee && (
                        <span className="text-xs text-[color:var(--ds-text-subtle)]">
                          {item.assignee}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {meeting.notes && (
                <p className="mt-2 text-sm whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                  {meeting.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
