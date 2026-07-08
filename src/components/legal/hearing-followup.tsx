"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, Plus, Trash2, Check, CalendarCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FollowupTask {
  id: string;
  label: string;
  done: boolean;
}

interface HearingFollowup {
  slug: string;
  title: string;
  hearing_date: string;
  outcome: string;
  tasks: FollowupTask[];
  notes: string;
}

const DEFAULT_TASKS_DE: FollowupTask[] = [
  { id: "protokoll", label: "Sitzungsprotokoll erstellt", done: false },
  { id: "frist", label: "Fristen aus Urteil/Verfügung notiert", done: false },
  { id: "mandant", label: "Mandant informiert (schriftlich)", done: false },
  { id: "aktennotiz", label: "Aktennotiz erstellt", done: false },
  { id: "kosten", label: "Kostenrechnung / RVG geprüft", done: false },
  { id: "rechtsmittel", label: "Rechtsmittelprüfung dokumentiert", done: false },
];

const DEFAULT_TASKS_EN: FollowupTask[] = [
  { id: "minutes", label: "Hearing minutes created", done: false },
  { id: "deadlines", label: "Deadlines from order noted", done: false },
  { id: "client", label: "Client informed (written)", done: false },
  { id: "memo", label: "Case memo created", done: false },
  { id: "costs", label: "Cost calculation / RVG checked", done: false },
  { id: "appeal", label: "Appeal review documented", done: false },
];

export function HearingFollowupWorkflow() {
  const { t, lang } = useLang();
  const ctx = useMatterDetail();
  const { addToast } = useToast();
  const [followups, setFollowups] = useState<HearingFollowup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [hearingDate, setHearingDate] = useState("");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");

  const caseSlug = ctx.caseData?.slug ?? "";

  const load = useCallback(async () => {
    if (!caseSlug) return;
    try {
      const pages = await api.brain.listPages({ type: "legal_hearing_followup", limit: 50 });
      const filtered = pages.filter((p) => p.frontmatter?.case_slug === caseSlug);
      const mapped: HearingFollowup[] = filtered.map((p: BrainPage) => ({
        slug: p.slug,
        title: p.title,
        hearing_date: String(p.frontmatter?.hearing_date ?? ""),
        outcome: String(p.frontmatter?.outcome ?? ""),
        tasks: (p.frontmatter?.tasks as FollowupTask[]) ?? [],
        notes: String(p.content ?? ""),
      }));
      mapped.sort((a, b) => b.hearing_date.localeCompare(a.hearing_date));
      setFollowups(mapped);
    } catch {
      addToast({ type: "error", title: t("common.error") });
    } finally {
      setLoading(false);
    }
  }, [caseSlug, addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !hearingDate) return;
    setSaving(true);
    try {
      const slug = `legal/hearing-followups/${Date.now().toString(36)}`;
      await api.brain.createPage({
        slug,
        title: title.trim(),
        type: "legal_hearing_followup",
        content: notes.trim(),
        frontmatter: {
          case_slug: caseSlug,
          hearing_date: hearingDate,
          outcome: outcome.trim(),
          tasks: lang === "en" ? [...DEFAULT_TASKS_EN] : [...DEFAULT_TASKS_DE],
          created_at: new Date().toISOString(),
        },
      });
      addToast({ type: "success", title: t("mattertab.hearing_checklist_saved") });
      setTitle("");
      setHearingDate("");
      setOutcome("");
      setNotes("");
      setShowCreate(false);
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(followup: HearingFollowup, taskId: string) {
    const updatedTasks = followup.tasks.map((task) =>
      task.id === taskId ? { ...task, done: !task.done } : task
    );
    try {
      await api.brain.updatePage({
        slug: followup.slug,
        frontmatter: { tasks: updatedTasks },
      });
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    }
  }

  async function deleteFollowup(followup: HearingFollowup) {
    try {
      await api.brain.deletePage(followup.slug);
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarCheck size={16} className="text-[color:var(--brand-primary)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {lang === "en" ? "Hearing Follow-up" : "Termin-Nachbereitung"}
          </h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(!showCreate)}>
          <Plus size={14} /> {lang === "en" ? "Add" : "Hinzufügen"}
        </Button>
      </div>

      {showCreate && (
        <form className="space-y-3" onSubmit={handleCreate}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {lang === "en" ? "Hearing" : "Termin"} *
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={lang === "en" ? "e.g. Hearing at LG Munich" : "z.B. Verhandlung am LG München"}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {lang === "en" ? "Date" : "Datum"} *
              </Label>
              <Input
                type="date"
                value={hearingDate}
                onChange={(e) => setHearingDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {lang === "en" ? "Outcome" : "Ergebnis"}
            </Label>
            <Input
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder={lang === "en" ? "e.g. Ruling, adjourned, settlement" : "z.B. Urteil, Vertagt, Vergleich"}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("mattertab.client_meeting_notes")}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t("common.save")}
          </Button>
        </form>
      )}

      {followups.length === 0 ? (
        <p className="py-4 text-center text-sm text-[color:var(--ds-text-muted)]">
          {lang === "en" ? "No hearing follow-ups yet" : "Keine Termin-Nachbereitungen vorhanden"}
        </p>
      ) : (
        <div className="space-y-2">
          {followups.map((followup) => {
            const completedCount = followup.tasks.filter((t) => t.done).length;
            return (
              <div
                key={followup.slug}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
              >
                <div className="flex items-start gap-2">
                  <Clock size={12} className="mt-1 shrink-0 text-[color:var(--ds-text-subtle)]" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-[color:var(--ds-text)]">
                        {followup.title}
                      </h4>
                      <span className="text-xs text-[color:var(--ds-text-subtle)]">
                        {followup.hearing_date}
                      </span>
                      <span className="ml-auto text-xs text-[color:var(--ds-text-subtle)]">
                        {completedCount}/{followup.tasks.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteFollowup(followup)}
                        aria-label={t("common.delete")}
                        className="rounded p-1 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-danger-text)]"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {followup.outcome && (
                      <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                        <strong>{lang === "en" ? "Outcome" : "Ergebnis"}:</strong> {followup.outcome}
                      </p>
                    )}
                    <div className="mt-2 space-y-1">
                      {followup.tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleTask(followup, task.id)}
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                              task.done
                                ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white"
                                : "border-[color:var(--ds-border)] hover:border-[color:var(--brand-primary)]"
                            )}
                            aria-label={task.label}
                          >
                            {task.done && <Check size={10} />}
                          </button>
                          <span
                            className={cn(
                              "text-xs",
                              task.done
                                ? "text-[color:var(--ds-text-subtle)] line-through"
                                : "text-[color:var(--ds-text)]"
                            )}
                          >
                            {task.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    {followup.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-[color:var(--ds-text-muted)]">
                        {followup.notes}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
