"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BrainCircuit,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import type { MatterUnderstandingPanel } from "@/lib/matter-context-types";
import { deriveMatterWorkflowActions, type MatterWorkflowAction } from "@/lib/matter-workflow";
import { cn } from "@/lib/utils";
import { MatterAnalysisReview } from "@/components/legal/MatterAnalysisReview";
import { MatterReviewInbox } from "@/components/legal/MatterReviewInbox";

const PRIORITY_STYLES: Record<MatterWorkflowAction["priority"], string> = {
  critical: "border-red-500/30 bg-red-500/5 text-red-700",
  high: "border-amber-500/30 bg-amber-500/5 text-amber-700",
  medium:
    "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)]",
  low: "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)]",
};

function deadlineKey(deadline: { id?: string; title?: string; due_date: string }) {
  return deadline.id || `${deadline.title}:${deadline.due_date}`;
}

export function MatterWorkflowCockpit() {
  const router = useRouter();
  const ctx = useMatterDetail();
  const { addToast } = useToast();
  const [understanding, setUnderstanding] = useState<MatterUnderstandingPanel | null>(null);
  const [calendarDeadlineIds, setCalendarDeadlineIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const matter = ctx.caseData;

  const load = useCallback(async () => {
    if (!matter) return;
    setLoading(true);
    try {
      const [understandingResponse, appointments] = await Promise.all([
        fetch(`/api/matter-context/${encodeURIComponent(matter.slug)}/understanding`).then((res) =>
          res.ok ? (res.json() as Promise<MatterUnderstandingPanel>) : null
        ),
        api.brain.listPages({ type: "appointment", limit: 300 }).catch(() => [] as BrainPage[]),
      ]);
      setUnderstanding(understandingResponse);
      setCalendarDeadlineIds(
        new Set(
          appointments
            .filter((page) => page.frontmatter?.case_slug === matter.slug)
            .map((page) => page.frontmatter?.deadline_id)
            .filter((value): value is string => typeof value === "string")
        )
      );
    } finally {
      setLoading(false);
    }
  }, [matter]);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo(
    () => (matter ? deriveMatterWorkflowActions(matter, understanding, calendarDeadlineIds) : []),
    [calendarDeadlineIds, matter, understanding]
  );

  if (!matter) return null;
  const currentMatter = matter;

  const reviewedDeadlines = currentMatter.deadlines.filter(
    (deadline) =>
      deadline.status !== "done" &&
      (deadline.review_status === "reviewed" || deadline.review_status === "approved") &&
      !calendarDeadlineIds.has(deadlineKey(deadline))
  );

  async function syncReviewedDeadlines() {
    if (reviewedDeadlines.length === 0) return;
    setSyncing(true);
    try {
      await Promise.all(
        reviewedDeadlines.flatMap((deadline) => {
          const key = deadlineKey(deadline);
          const safeKey = `${currentMatter.slug}-${key}`
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .slice(0, 120);
          const entries: ReturnType<typeof api.brain.updatePage>[] = [
            api.brain.updatePage({
              slug: `legal/appointments/deadline-${safeKey}`,
              title: deadline.title || "Frist",
              type: "appointment",
              content: deadline.description || deadline.calculation_note || "",
              frontmatter: {
                type: "appointment",
                appointment_type: "deadline",
                deadline_id: key,
                date: deadline.due_date,
                time: "09:00",
                duration: 15,
                case_slug: currentMatter.slug,
                status: "scheduled",
                source: deadline.source || "matter_deadline",
                law: deadline.law,
                updated_at: new Date().toISOString(),
              },
            }),
          ];

          if (deadline.vorfrist_date) {
            entries.push(
              api.brain.updatePage({
                slug: `legal/appointments/vorfrist-${safeKey}`,
                title: `Vorfrist: ${deadline.title || "Frist"}`,
                type: "appointment",
                content: `Vorfrist (innere Kontrolle) für: ${deadline.title || "Frist"}\n\nHauptfrist: ${deadline.due_date}`,
                frontmatter: {
                  type: "appointment",
                  appointment_type: "vorfrist",
                  deadline_id: key,
                  date: deadline.vorfrist_date,
                  time: "09:00",
                  duration: 10,
                  case_slug: currentMatter.slug,
                  status: "scheduled",
                  source: deadline.source || "matter_deadline",
                  law: deadline.law,
                  is_notfrist: deadline.is_notfrist || false,
                  updated_at: new Date().toISOString(),
                },
              })
            );
          }

          return entries;
        })
      );
      setCalendarDeadlineIds((current) => {
        const next = new Set(current);
        reviewedDeadlines.forEach((deadline) => next.add(deadlineKey(deadline)));
        return next;
      });
      const vorfristCount = reviewedDeadlines.filter((d) => d.vorfrist_date).length;
      addToast({
        type: "success",
        title: `${reviewedDeadlines.length} Frist${reviewedDeadlines.length === 1 ? "" : "en"} in den Aktenkalender übernommen${vorfristCount > 0 ? ` (${vorfristCount} Vorfrist${vorfristCount === 1 ? "" : "en"} zusätzlich)` : ""}`,
      });
    } catch (error) {
      addToast({
        type: "error",
        title: error instanceof Error ? error.message : "Kalendersynchronisierung fehlgeschlagen",
      });
    } finally {
      setSyncing(false);
    }
  }

  function runAction(action: MatterWorkflowAction) {
    const clientName = encodeURIComponent(currentMatter.clientName ?? "");
    const caseSlugParam = encodeURIComponent(currentMatter.slug);

    if (action.kind === "upload") {
      window.dispatchEvent(
        new CustomEvent("subsumio:upload-document", { detail: { caseSlug: currentMatter.slug } })
      );
    } else if (action.kind === "review_documents") {
      ctx.navigateToTab("documents");
    } else if (action.kind === "review_deadlines") {
      ctx.navigateToTab("deadlines");
    } else if (action.kind === "calendar") {
      void syncReviewedDeadlines();
    } else if (action.kind === "work_task") {
      window.dispatchEvent(
        new CustomEvent("subsumio:create-task", { detail: { caseSlug: currentMatter.slug } })
      );
    } else if (action.kind === "complete_acceptance" || action.kind === "send_engagement_letter") {
      router.push(`/dashboard/intake?highlight=${caseSlugParam}`);
    } else if (action.kind === "verify_kyc") {
      router.push(`/dashboard/kyc?case_slug=${caseSlugParam}&client_name=${clientName}`);
    } else if (action.kind === "create_poa") {
      router.push(
        `/dashboard/power-of-attorney?case_slug=${caseSlugParam}&client_name=${clientName}`
      );
    } else {
      ctx.setQuery(
        action.kind === "complete_facts"
          ? "Welche entscheidenden Tatsachen, Beweismittel, Parteien und Unterlagen fehlen in dieser Akte? Begründe jede Lücke mit Aktenquellen."
          : "Erstelle die nächsten rechtmäßigen Verfahrensschritte, Angriffs- und Verteidigungsoptionen für diese Akte. Trenne gesicherte Tatsachen, Annahmen, Beweislast, Fristen und Risiken und belege alles mit Quellen."
      );
      ctx.navigateToTab("strategy");
    }
  }

  const score = Math.round((understanding?.understanding_score || 0) * 100);
  const topActions = actions.slice(0, 4);

  return (
    <section
      aria-labelledby="matter-workflow-title"
      className="rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 md:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit size={18} className="brand-text" aria-hidden="true" />
            <h2
              id="matter-workflow-title"
              className="text-base font-semibold text-[color:var(--ds-text)]"
            >
              Akten-Cockpit
            </h2>
          </div>
          <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
            Verarbeitung, Fristenkontrolle und nächste anwaltliche Arbeitsschritte.
          </p>
        </div>
        {loading ? (
          <Loader2
            size={18}
            className="animate-spin text-[color:var(--ds-text-muted)]"
            aria-label="Aktenverständnis wird geladen"
          />
        ) : (
          <Badge
            variant="default"
            className={cn(
              "gap-1.5",
              score >= 80
                ? "bg-emerald-500/10 text-emerald-700"
                : score >= 50
                  ? "bg-amber-500/10 text-amber-700"
                  : "bg-red-500/10 text-red-700"
            )}
          >
            <FileSearch size={13} aria-hidden="true" />
            Superbrain: {score}% verstanden
          </Badge>
        )}
      </div>

      {understanding && (
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3">
            <span className="text-[color:var(--ds-text-muted)]">Fakten</span>
            <strong className="mt-1 block text-sm text-[color:var(--ds-text)]">
              {understanding.facts.length}
            </strong>
          </div>
          <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3">
            <span className="text-[color:var(--ds-text-muted)]">Offene Lücken</span>
            <strong className="mt-1 block text-sm text-[color:var(--ds-text)]">
              {understanding.gaps.length}
            </strong>
          </div>
          <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3">
            <span className="text-[color:var(--ds-text-muted)]">Risiken</span>
            <strong className="mt-1 block text-sm text-[color:var(--ds-text)]">
              {understanding.risks.length}
            </strong>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2" aria-live="polite">
        {topActions.length === 0 && !loading ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">
            <CheckCircle2 size={16} aria-hidden="true" />
            Keine kritischen nächsten Schritte erkannt. Akte fachlich weiterbearbeiten oder
            aktualisieren.
          </div>
        ) : (
          topActions.map((action, index) => (
            <div
              key={action.id}
              className={cn(
                "flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center",
                PRIORITY_STYLES[action.priority]
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {action.priority === "critical" || action.priority === "high" ? (
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                ) : (
                  <ShieldCheck size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {index === 0 && (
                      <span className="mr-1.5 text-xs tracking-wide uppercase">Jetzt</span>
                    )}
                    {action.title}
                  </p>
                  <p className="mt-0.5 text-xs opacity-80">{action.description}</p>
                </div>
              </div>
              <Button
                type="button"
                variant={index === 0 ? "primary" : "outline"}
                size="sm"
                className="h-11 shrink-0 gap-1.5"
                disabled={syncing && action.kind === "calendar"}
                onClick={() => runAction(action)}
              >
                {syncing && action.kind === "calendar" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : action.kind === "calendar" ? (
                  <CalendarPlus size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                {action.kind === "calendar" ? "Übernehmen" : "Bearbeiten"}
              </Button>
            </div>
          ))
        )}
      </div>

      <MatterReviewInbox understanding={understanding} />

      {understanding && <MatterAnalysisReview understanding={understanding} />}

      <p className="mt-4 text-xs text-[color:var(--ds-text-muted)]">
        Strategiehinweise sind Entscheidungshilfen: Quellen, Rechtsraum, Fristen und anwaltliche
        Berufspflichten müssen vor Verwendung geprüft werden.
      </p>
    </section>
  );
}
