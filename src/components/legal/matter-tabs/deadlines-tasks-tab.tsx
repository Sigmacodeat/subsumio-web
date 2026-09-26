"use client";

import {
  CalendarClock,
  Plus,
  Trash2,
  Check,
  X,
  PenTool,
  Sparkles,
  Loader2,
  ListChecks,
  ChevronUp,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  cn,
  daysUntil as daysUntilDate,
  formatDate,
  formatDateTime,
  formatDaysUntil,
} from "@/lib/utils";
import { sourceLabel, urgencyLabel } from "./format";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { statusBadgeClasses, type StatusColor } from "@/lib/status-colors";
import { withDeadlineAudit } from "@/lib/legal-deadlines";
import type { DeadlineEntry } from "@/lib/legal-types";
import { computeFrist, fristOptionsFor, type FristComputation } from "@/lib/legal/frist-options";
import { getRechtsraumParams, resolveMatterRechtsraum } from "@/lib/legal/rechtsraum";
import { loadKanzleiSettingsStrict } from "@/lib/kanzlei-settings";
import {
  FerialsacheField,
  ferialsacheAnswerMissing,
  ferialsacheQuestionVisible,
  type FerialsacheAnswer,
} from "@/components/legal/ferialsache-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import { CitationPanel } from "@/components/legal/CitationPanel";
import type { DeadlineFormData } from "@/lib/schemas/case-detail";
import { csrfFetch } from "@/lib/csrf";
import { api, ApiRequestError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import CommentThread from "@/components/legal/CommentThread";
import { useTeam } from "@/lib/queries/settings";

/** Pseudo-Assignee-Wert im Zuständig-Select für den KI-Agenten (WP-7.42). */
const AGENT_ASSIGNEE = "__agent__";

function isCancelled(dl: { status?: string }): boolean {
  return dl.status === "cancelled" || dl.status === "storniert";
}

export function DeadlinesTasksTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [showDeadlineForm, setShowDeadlineForm] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [secondCheckIndex, setSecondCheckIndex] = useState<number | null>(null);
  const [secondCheckBusy, setSecondCheckBusy] = useState(false);
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const { data: teamData } = useTeam();
  const teamMembers = teamData?.members ?? [];
  const confirm = useConfirm();

  // Rechtsraum for the deadline calculator: the matter's jurisdiction (AT/DE/CH)
  // wins, otherwise the firm's. Until it is known — or when the firm settings
  // cannot be read — nothing is computed: no silent fallback to another
  // country's rules.
  const [firmRechtsraum, setFirmRechtsraum] = useState<{ state?: string; country?: string }>({});
  const [settingsState, setSettingsState] = useState<"loading" | "ok" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    loadKanzleiSettingsStrict()
      .then((s) => {
        if (cancelled) return;
        setFirmRechtsraum(getRechtsraumParams(s));
        setSettingsState("ok");
      })
      .catch(() => {
        if (!cancelled) setSettingsState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const rechtsraum = useMemo(
    () => resolveMatterRechtsraum(ctx.caseData?.jurisdiction, firmRechtsraum),
    [ctx.caseData?.jurisdiction, firmRechtsraum]
  );
  const fristOptions = useMemo(() => fristOptionsFor(rechtsraum.country), [rechtsraum.country]);
  const [ferialsache, setFerialsache] = useState<FerialsacheAnswer>(null);
  const [calcPreview, setCalcPreview] = useState<FristComputation | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [aiDetectError, setAiDetectError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // KI-Fristvorschläge are AI output: grounding + citation panel are mandatory.
  const { grounding: aiGrounding, groundAnswer: groundAiDeadlines } = useGroundedAnswer();
  const suggestionText = useMemo(
    () =>
      [
        ...ctx.aiDetectedDeadlines.map((d) => `${d.title} — ${d.date}`),
        ...(ctx.caseData?.suggestedDeadlines ?? [])
          .filter((sd) => !sd.confirmed)
          .map((sd) => [sd.title, sd.due_date, sd.source_quote].filter(Boolean).join(" — ")),
      ].join("\n"),
    [ctx.aiDetectedDeadlines, ctx.caseData?.suggestedDeadlines]
  );
  useEffect(() => {
    if (suggestionText.trim()) void groundAiDeadlines(suggestionText);
  }, [suggestionText, groundAiDeadlines]);

  function runFristCalc(answer: FerialsacheAnswer): FristComputation | null {
    if (!ctx.deadlineRuleKey) {
      setCalcError("Bitte eine Fristart wählen.");
      return null;
    }
    if (settingsState !== "ok") {
      setCalcPreview(null);
      setCalcError(
        settingsState === "error"
          ? "Kanzlei-Einstellungen (Rechtsraum) konnten nicht geladen werden — die Frist wird nicht berechnet, damit kein fremdes Fristenrecht angewendet wird."
          : "Rechtsraum wird geladen …"
      );
      return null;
    }
    try {
      const result = computeFrist(ctx.deadlineRuleKey, ctx.deadlineStartDate, {
        country: rechtsraum.country,
        state: rechtsraum.state,
        ferialsache: answer === true,
      });
      setCalcPreview(result);
      setCalcError(null);
      return result;
    } catch (err) {
      setCalcPreview(null);
      setCalcError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  function applyFristCalc(result: FristComputation, answer: FerialsacheAnswer) {
    const current = ctx.deadlineForm.getValues();
    ctx.deadlineForm.reset({
      ...current,
      title: result.label,
      description: current.description || result.hinweise.join(" · ") || undefined,
      due_date: result.dueDate,
      type: "deadline",
      status: "pending",
      rule_key: result.key,
      law: result.law,
      start_date: result.fristbeginn,
      calculation_note: result.hinweise.join(" · "),
      vorfrist_date: result.vorfrist ?? current.vorfrist_date,
      is_notfrist: result.notfrist || current.is_notfrist === true,
      // A period extended by the verhandlungsfreie Zeit is only right if the
      // matter is no Ferialsache — a second person confirms that.
      second_check_required: result.notfrist || result.vhfzVerlaengert || undefined,
      ferialsache: result.ferialsacheRelevant ? answer === true : undefined,
      review_status: "unreviewed",
    } as DeadlineFormData);
  }

  function deleteDeadline(index: number) {
    const dl = ctx.deadlinesList[index];
    if (!dl) return;
    if (dl.is_notfrist) {
      // A Notfrist is never removed — it is cancelled with a reason (logged).
      setCancelReason("");
      setCancelTarget(index);
      return;
    }
    void confirm({
      title: "Frist löschen?",
      message: `„${dl.title ?? ""}“ (${formatDate(dl.due_date)}) wird aus der Akte entfernt.`,
      confirmLabel: "Löschen",
      variant: "danger",
    }).then((ok) => {
      if (!ok) return;
      const updated = ctx.deadlinesList.filter((_, idx) => idx !== index);
      ctx.setDeadlinesList(updated);
      ctx.saveCaseUpdate({ deadlines: updated });
    });
  }

  function confirmCancelNotfrist() {
    if (cancelTarget === null) return;
    const reason = cancelReason.trim();
    if (reason.length < 5) return;
    const now = new Date().toISOString();
    const updated = ctx.deadlinesList.map((item, idx) =>
      idx === cancelTarget
        ? ({
            ...item,
            status: "cancelled",
            cancelled_at: now,
            cancelled_by: ctx.currentUserName,
            change_reason: reason,
          } as unknown as DeadlineEntry)
        : item
    );
    // The reason travels once with this save; local state keeps no copy that
    // could silently justify a later change.
    ctx.setDeadlinesList(
      updated.map((item, idx) =>
        idx === cancelTarget
          ? ({ ...item, change_reason: undefined } as unknown as DeadlineEntry)
          : item
      )
    );
    ctx.saveCaseUpdate({ deadlines: updated });
    setCancelTarget(null);
    setCancelReason("");
  }

  // Auto-expand form when editing
  useEffect(() => {
    if (ctx.editingDeadlineIndex !== null) setShowDeadlineForm(true);
  }, [ctx.editingDeadlineIndex]);

  useEffect(() => {
    if (searchParams.get("action") !== "task") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("matter-new-task")?.focus();
      router.replace(pathname, { scroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, router, searchParams]);

  const editingEntry =
    ctx.editingDeadlineIndex !== null ? ctx.deadlinesList[ctx.editingDeadlineIndex] : undefined;
  const watchedDueDate = ctx.deadlineForm.watch("due_date");
  const editingNotfristMoved =
    editingEntry?.is_notfrist === true &&
    !!editingEntry.due_date &&
    !!watchedDueDate &&
    watchedDueDate !== editingEntry.due_date;

  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;
  const slug = ctx.slug;

  function addTask() {
    if (!ctx.newTask.trim()) return;
    const toAgent = newTaskAssigneeId === AGENT_ASSIGNEE;
    const assignee = toAgent ? undefined : teamMembers.find((m) => m.id === newTaskAssigneeId);
    const updated = [
      ...ctx.tasks,
      {
        id: Date.now().toString(),
        text: ctx.newTask.trim(),
        done: false,
        createdAt: new Date().toISOString(),
        dueDate: newTaskDueDate || undefined,
        assigneeId: assignee?.id,
        assigneeName: toAgent ? "KI-Agent" : assignee?.name || assignee?.email,
        assigneeType: toAgent ? ("agent" as const) : assignee ? ("user" as const) : undefined,
        agentStatus: toAgent ? ("pending" as const) : undefined,
      },
    ];
    ctx.setTasks(updated);
    ctx.setNewTask("");
    setNewTaskDueDate("");
    setNewTaskAssigneeId("");
    ctx.saveCaseUpdate({ tasks: updated });
  }

  function reassignTask(taskId: string, assigneeId: string) {
    const toAgent = assigneeId === AGENT_ASSIGNEE;
    const assignee = toAgent ? undefined : teamMembers.find((m) => m.id === assigneeId);
    const updated = ctx.tasks.map((t) =>
      t.id === taskId
        ? toAgent
          ? // Neu an den Agenten → zurück auf pending; ein bereits geprüftes
            // Ergebnis wird verworfen, die Aufgabe geht erneut in die Queue.
            {
              ...t,
              assigneeId: undefined,
              assigneeName: "KI-Agent",
              assigneeType: "agent" as const,
              agentStatus: "pending" as const,
              agentResult: undefined,
            }
          : {
              ...t,
              assigneeId: assignee?.id,
              assigneeName: assignee?.name || assignee?.email,
              assigneeType: assignee ? ("user" as const) : undefined,
              agentStatus: undefined,
              agentResult: undefined,
            }
        : t
    );
    ctx.setTasks(updated);
    ctx.saveCaseUpdate({ tasks: updated });
  }

  return (
    <div className="space-y-4">
      {ctx.standaloneDeadlinesFailed && (
        <div
          role="alert"
          className="max-w-3xl rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]"
        >
          Die eigenständigen Fristen dieser Akte konnten nicht geladen werden — die Liste ist
          unvollständig. Bitte die Seite neu laden.
        </div>
      )}
      {/* Deadline Form — collapsed by default (Progressive Disclosure) */}
      <div className="max-w-3xl space-y-4">
        {!showDeadlineForm ? (
          <button
            onClick={() => setShowDeadlineForm(true)}
            disabled={caseData?.status === "archived"}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm font-medium text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-[0.99] disabled:opacity-50 motion-reduce:transition-none"
          >
            <Plus size={16} className="shrink-0" />
            {t("cases.detail_dl_add")}
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {ctx.editingDeadlineIndex !== null
                  ? t("cases.detail_dl_edit")
                  : t("cases.detail_dl_add")}
              </h3>
              {ctx.editingDeadlineIndex === null && (
                <button
                  onClick={() => setShowDeadlineForm(false)}
                  aria-label="Formular einklappen"
                  className="text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                >
                  <ChevronUp size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_dl_title")}
                </label>
                <input
                  {...ctx.deadlineForm.register("title")}
                  placeholder={t("cases.detail_dl_title_ph")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                />
                {ctx.deadlineForm.formState.errors.title && (
                  <p className="mt-1 text-xs text-[color:var(--ds-danger-text)]">
                    {ctx.deadlineForm.formState.errors.title.message}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_dl_due_date")}
                </label>
                <input
                  type="date"
                  {...ctx.deadlineForm.register("due_date")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                />
                {ctx.deadlineForm.formState.errors.due_date && (
                  <p className="mt-1 text-xs text-[color:var(--ds-danger-text)]">
                    {ctx.deadlineForm.formState.errors.due_date.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_dl_type")}
                </label>
                <select
                  {...ctx.deadlineForm.register("type")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                >
                  <option value="deadline">{t("cases.detail_dl_type_deadline")}</option>
                  <option value="hearing">{t("cases.detail_dl_type_hearing")}</option>
                  <option value="meeting">{t("cases.detail_dl_type_meeting")}</option>
                  <option value="filing">{t("cases.detail_dl_type_filing")}</option>
                  <option value="reminder">{t("cases.detail_dl_type_reminder")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_dl_status")}
                </label>
                <select
                  {...ctx.deadlineForm.register("status")}
                  onChange={(e) => {
                    const val = e.target.value;
                    const isNotfrist = ctx.deadlineForm.getValues("is_notfrist");
                    if (val === "done" && isNotfrist) {
                      const idx = ctx.editingDeadlineIndex;
                      if (idx !== null) setSecondCheckIndex(idx);
                      return;
                    }
                    ctx.deadlineForm.setValue("status", val as never);
                  }}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                >
                  <option value="pending">{t("cases.detail_dl_status_pending")}</option>
                  <option value="warning">{t("cases.detail_dl_status_warning")}</option>
                  <option value="critical">{t("cases.detail_dl_status_critical")}</option>
                  <option value="overdue">{t("cases.detail_dl_status_overdue")}</option>
                  <option value="done">{t("cases.detail_dl_status_done")}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                {t("cases.detail_dl_description")}
              </label>
              <textarea
                {...ctx.deadlineForm.register("description")}
                rows={2}
                placeholder={t("cases.detail_dl_description_ph")}
                className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              />
            </div>

            {/* Moving a stored Notfrist needs a reason (server-enforced, logged). */}
            {editingNotfristMoved && (
              <div>
                <label
                  htmlFor="matter-frist-change-reason"
                  className="mb-1 block text-xs font-medium text-[color:var(--ds-danger-text)]"
                >
                  Begründung für die Änderung der Notfrist *
                </label>
                <input
                  id="matter-frist-change-reason"
                  {...ctx.deadlineForm.register("change_reason")}
                  className="w-full rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                />
                <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  Wird mit altem und neuem Datum protokolliert (mind. 5 Zeichen).
                </p>
              </div>
            )}

            {/* Notfrist + ERV-Zustelldatum */}
            <div className="space-y-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  {...ctx.deadlineForm.register("is_notfrist")}
                  className="mt-0.5 h-4 w-4 rounded border-[color:var(--ds-border-strong)] accent-amber-600"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-[color:var(--ds-warning-text)]" />
                    <span className="text-xs font-medium text-[color:var(--ds-text)]">
                      Notfrist (Vier-Augen-Kontrolle)
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    Gesetzliche Frist mit zwingender Zweiprüfung vor Erledigung.
                  </p>
                </div>
              </label>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("deadlines.erv_date")} (optional)
                </label>
                <input
                  type="date"
                  {...ctx.deadlineForm.register("erv_zustelldatum")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                />
                <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {t("deadlines.erv_date_hint")}
                </p>
              </div>
            </div>
            <div className="brand-border brand-soft/5 space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="brand-text text-xs font-medium">{t("cases.detail_dl_calc_rule")}</p>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_dl_calc_rule_desc")}
                  </p>
                </div>
                <Badge variant="default" className="brand-soft brand-border brand-text text-xs">
                  {t("cases.detail_dl_review_required")}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <select
                  value={ctx.deadlineRuleKey}
                  aria-label="Fristart"
                  data-testid="matter-frist-rule"
                  onChange={(e) => {
                    ctx.setDeadlineRuleKey(e.target.value);
                    setFerialsache(null);
                    setCalcPreview(null);
                    setCalcError(null);
                  }}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                >
                  <option value="">Fristart wählen …</option>
                  {fristOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {rechtsraum.country && rechtsraum.country !== "AT"
                        ? `[${rechtsraum.country}] `
                        : ""}
                      {option.group ? `${option.group}: ` : ""}
                      {option.label} ({option.law})
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  aria-label="Zustellung / Fristbeginn"
                  value={ctx.deadlineStartDate}
                  onChange={(e) => {
                    ctx.setDeadlineStartDate(e.target.value);
                    setCalcPreview(null);
                  }}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                />
                <Button
                  variant="secondary"
                  className="text-xs"
                  disabled={ferialsacheAnswerMissing(calcPreview, ferialsache)}
                  onClick={() => {
                    const result = runFristCalc(ferialsache);
                    if (!result) return;
                    // The verhandlungsfreie Zeit extends this period: ask first.
                    if (ferialsacheAnswerMissing(result, ferialsache)) return;
                    applyFristCalc(result, ferialsache);
                  }}
                >
                  {t("cases.detail_dl_calculate")}
                </Button>
              </div>
              <p
                className="text-xs text-[color:var(--ds-text-muted)]"
                data-testid="matter-frist-rechtsraum"
              >
                Fristenrecht:{" "}
                {rechtsraum.country === "DE"
                  ? "Deutschland (deutsche Fristenregeln)"
                  : rechtsraum.country === "CH"
                    ? "Schweiz"
                    : "Österreich (ZPO/AVG/BAO, § 222 ZPO, österr. Feiertage)"}
                {rechtsraum.source === "matter" ? " — laut Akte" : " — laut Kanzlei-Einstellungen"}
              </p>
              {calcPreview && ferialsacheQuestionVisible(calcPreview, ferialsache) && (
                <FerialsacheField
                  id="matter-frist-ferialsache"
                  value={ferialsache}
                  onChange={(v) => {
                    setFerialsache(v);
                    const result = runFristCalc(v);
                    if (result) applyFristCalc(result, v);
                  }}
                  missing={ferialsacheAnswerMissing(calcPreview, ferialsache)}
                />
              )}
              {calcError && (
                <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
                  {calcError}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={caseData?.status === "archived"}
                className="brand-bg brand-bg gap-2 text-sm text-white"
                onClick={ctx.deadlineForm.handleSubmit(ctx.onDeadlineSubmit)}
              >
                <Plus size={14} />
                {ctx.editingDeadlineIndex !== null
                  ? t("cases.detail_dl_save")
                  : t("cases.detail_dl_add_btn")}
              </Button>
              {ctx.editingDeadlineIndex !== null && (
                <Button
                  variant="ghost"
                  className="text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  onClick={() => {
                    ctx.setEditingDeadlineIndex(null);
                    ctx.deadlineForm.reset({
                      title: "",
                      due_date: "",
                      type: "deadline",
                      status: "pending",
                      description: "",
                      vorfrist_date: undefined,
                      is_notfrist: false,
                      second_check_required: undefined,
                      erv_zustelldatum: undefined,
                    });
                  }}
                >
                  {t("cases.detail_dl_cancel")}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* AI Deadline Detection */}
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PenTool size={16} className="text-[color:var(--ds-info-text)]" />
              <span className="text-sm font-medium text-[color:var(--ds-info-text)]">
                {t("cases.detail_dl_ai_title")}
              </span>
            </div>
          </div>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {t("cases.detail_dl_ai_desc")}
          </p>
          <textarea
            value={ctx.aiDetectText}
            onChange={(e) => ctx.setAiDetectText(e.target.value)}
            rows={3}
            placeholder={t("cases.detail_dl_ai_ph")}
            className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--ds-info-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              className="gap-2 bg-[color:var(--ds-info-solid)] text-sm text-white hover:bg-[color:var(--ds-info-solid)]"
              onClick={async () => {
                if (!ctx.aiDetectText.trim()) return;
                ctx.setAiDetecting(true);
                try {
                  const res = await csrfFetch("/api/legal/ai-deadlines", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: ctx.aiDetectText, caseSlug: slug }),
                  });
                  const data = (await res.json().catch(() => null)) as {
                    detected?: Array<{
                      title: string;
                      date: string;
                      type: string;
                      confidence: number;
                    }>;
                    error?: string;
                    message?: string;
                  } | null;
                  if (!res.ok) {
                    // A failed analysis is NOT "no deadlines found".
                    ctx.setAiDetectedDeadlines([]);
                    setAiDetectError(
                      "Die KI-Fristerkennung ist fehlgeschlagen — der Text wurde NICHT geprüft. Bitte erneut versuchen oder die Fristen manuell erfassen."
                    );
                    return;
                  }
                  setAiDetectError(null);
                  ctx.setAiDetectedDeadlines(data?.detected?.length ? data.detected : []);
                } catch {
                  ctx.setAiDetectedDeadlines([]);
                  setAiDetectError(
                    "Die KI-Fristerkennung ist fehlgeschlagen — der Text wurde NICHT geprüft. Bitte erneut versuchen oder die Fristen manuell erfassen."
                  );
                } finally {
                  ctx.setAiDetecting(false);
                }
              }}
              disabled={
                ctx.aiDetecting || !ctx.aiDetectText.trim() || caseData?.status === "archived"
              }
            >
              {ctx.aiDetecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <PenTool size={14} />
              )}
              {ctx.aiDetecting ? t("cases.detail_dl_ai_analyzing") : t("cases.detail_dl_ai_detect")}
            </Button>
            {ctx.aiDetectedDeadlines.length > 0 && (
              <Button
                variant="ghost"
                className="text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                onClick={() => {
                  ctx.setAiDetectedDeadlines([]);
                  ctx.setAiDetectText("");
                }}
              >
                {t("cases.detail_dl_ai_reset")}
              </Button>
            )}
          </div>
          {aiDetectError && (
            <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
              {aiDetectError}
            </p>
          )}
          {ctx.aiDetectedDeadlines.length > 0 && (
            <div className="space-y-2">
              {ctx.aiDetectedDeadlines.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-[color:var(--ds-text)]">{d.title}</div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      <span className="tabular-nums">{formatDate(d.date)}</span> · {d.type} ·
                      KI-Vorschlag, anwaltlich zu prüfen
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="default"
                      className="border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-xs text-[color:var(--ds-success-text)]"
                    >
                      {Math.round(d.confidence * 100)}%
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={caseData?.status === "archived"}
                      className="border-[color:var(--ds-success-border)] text-xs text-[color:var(--ds-success-text)] hover:bg-[color:var(--ds-success-bg)]"
                      onClick={() => {
                        const entry: DeadlineEntry = {
                          id: `dl-${Date.now()}`,
                          title: d.title,
                          due_date: d.date,
                          type: d.type as DeadlineEntry["type"],
                          status: "pending",
                          review_status: "unreviewed",
                          // Marks it as a KI suggestion: alerts label it and
                          // send no external notification until reviewed.
                          source: "ai_detected",
                        };
                        const updated = [...ctx.deadlinesList, entry];
                        ctx.setDeadlinesList(updated);
                        ctx.saveCaseUpdate({ deadlines: updated });
                        ctx.setAiDetectedDeadlines((prev) => prev.filter((_, idx) => idx !== i));
                      }}
                    >
                      <Plus size={12} /> {t("cases.detail_dl_add_btn")}
                    </Button>
                  </div>
                </div>
              ))}
              <CitationPanel
                data={{ grounding: aiGrounding, citations: [], isStreaming: false }}
                compact
              />
            </div>
          )}
        </div>

        {/* AI-extrahierte Fristenvorschläge */}
        {caseData.suggestedDeadlines && caseData.suggestedDeadlines.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
              <Sparkles size={14} className="text-[color:var(--ds-warning-text)]" />
              {t("casesdetail.ai_deadlines")}
            </div>
            {caseData.suggestedDeadlines
              .map((sd, i) => ({ sd, i }))
              // Keep the ORIGINAL index: filtering first and mapping the
              // filtered position confirmed the wrong suggestion.
              .filter(({ sd }) => !sd.confirmed)
              .map(({ sd, i }) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-[color:var(--ds-text)]">{sd.title}</div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      <span className="tabular-nums">{formatDate(sd.due_date)}</span>
                      {sd.urgency ? ` · ${urgencyLabel(sd.urgency, lang)}` : ""}
                      {sd.source_quote && sd.source_quote !== sd.title && (
                        <span className="mt-0.5 block italic">&bdquo;{sd.source_quote}&ldquo;</span>
                      )}
                      {sd.source && (
                        <span className="mt-0.5 block">
                          {lang === "en" ? "Source" : "Quelle"}: {sourceLabel(sd.source)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={caseData?.status === "archived"}
                      className="border-[color:var(--ds-success-border)] text-xs text-[color:var(--ds-success-text)] hover:bg-[color:var(--ds-success-bg)]"
                      onClick={async () => {
                        try {
                          await ctx.confirmSuggestedDeadline(i, true);
                        } catch (err) {
                          ctx.setSaveError(
                            err instanceof Error
                              ? err.message
                              : "Frist konnte nicht übernommen werden."
                          );
                        }
                      }}
                    >
                      <Check size={12} /> {t("casesdetail.accept")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={caseData?.status === "archived"}
                      className="text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)]"
                      onClick={() =>
                        ctx
                          .confirmSuggestedDeadline(i, false)
                          .catch((err: unknown) =>
                            ctx.setSaveError(
                              err instanceof Error
                                ? err.message
                                : "Fristvorschlag konnte nicht verworfen werden."
                            )
                          )
                      }
                    >
                      <X size={12} /> {t("casesdetail.reject")}
                    </Button>
                  </div>
                </div>
              ))}
            <CitationPanel
              data={{ grounding: aiGrounding, citations: [], isStreaming: false }}
              compact
            />
          </div>
        )}

        {/* Deadlines List */}
        {ctx.deadlinesList.length === 0 ? (
          <div className="space-y-3 py-12 text-center">
            <CalendarClock size={40} className="mx-auto text-[color:var(--ds-border)]" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {t("cases.detail_dl_empty")}
            </p>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {t("cases.detail_dl_empty_hint")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {ctx.deadlinesList.map((dl, i) => {
              const daysUntil = daysUntilDate(dl.due_date) ?? 0;
              const isOverdue = daysUntil < 0;
              const isCritical = daysUntil >= 0 && daysUntil <= 3;
              const isWarning = daysUntil > 3 && daysUntil <= 7;
              const status = isCancelled(dl)
                ? "cancelled"
                : dl.status === "done"
                  ? "done"
                  : isOverdue
                    ? "overdue"
                    : isCritical
                      ? "critical"
                      : isWarning
                        ? "warning"
                        : "pending";
              const statusConfig: Record<string, { label: string; color: string; border: string }> =
                {
                  pending: {
                    label: t("cases.detail_dl_status_pending"),
                    color: "text-[color:var(--ds-info-text)]",
                    border: "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)]",
                  },
                  warning: {
                    label: t("cases.detail_dl_status_warning"),
                    color: "text-[color:var(--ds-warning-text)]",
                    border:
                      "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]",
                  },
                  critical: {
                    label: t("cases.detail_dl_status_critical"),
                    color: "text-[color:var(--ds-danger-text)]",
                    border: "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]",
                  },
                  overdue: {
                    label: t("cases.detail_dl_status_overdue"),
                    color: "text-[color:var(--ds-danger-text)]",
                    border: "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]",
                  },
                  done: {
                    label: t("cases.detail_dl_status_done"),
                    color: "text-[color:var(--ds-success-text)]",
                    border:
                      "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)]",
                  },
                  cancelled: {
                    label: "Storniert",
                    color: "text-[color:var(--ds-text-muted)]",
                    border: "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]",
                  },
                };
              const cfg = statusConfig[status];
              return (
                <div key={i} className={cn("rounded-xl border p-4", cfg.border)}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[color:var(--ds-text)]">
                        {dl.title}
                      </span>
                      <Badge
                        variant="default"
                        className={cn(
                          "border text-xs",
                          statusBadgeClasses(
                            (status === "cancelled" ? "done" : status) as StatusColor
                          )
                        )}
                      >
                        {cfg.label}
                      </Badge>
                      <Badge
                        variant="default"
                        className={cn(
                          "border text-xs",
                          dl.review_status === "approved"
                            ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                            : dl.review_status === "rejected"
                              ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                              : dl.review_status === "reviewed"
                                ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
                                : "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                        )}
                      >
                        {dl.review_status === "approved"
                          ? t("cases.detail_dl_review_approved")
                          : dl.review_status === "rejected"
                            ? t("cases.detail_dl_review_rejected")
                            : dl.review_status === "reviewed"
                              ? t("cases.detail_dl_review_reviewed")
                              : t("cases.detail_dl_review_unreviewed")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={caseData?.status === "archived"}
                        onClick={() => {
                          const updated = ctx.deadlinesList.map((item, idx) =>
                            idx === i
                              ? withDeadlineAudit(
                                  {
                                    ...item,
                                    review_status:
                                      item.review_status === "approved" ? "reviewed" : "approved",
                                    reviewed_at: new Date().toISOString(),
                                    reviewed_by:
                                      caseData.ownLawyerName || t("cases.detail_dl_firm"),
                                  },
                                  "reviewed",
                                  item.review_status === "approved"
                                    ? t("cases.detail_dl_audit_unapprove")
                                    : t("cases.detail_dl_audit_approve")
                                )
                              : item
                          );
                          ctx.setDeadlinesList(updated);
                          ctx.saveCaseUpdate({ deadlines: updated });
                        }}
                        className="px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-success-text)] active:scale-[0.99] motion-reduce:transition-none"
                      >
                        {dl.review_status === "approved"
                          ? t("cases.detail_dl_review_open")
                          : t("cases.detail_dl_review_approve")}
                      </button>
                      <button
                        disabled={caseData?.status === "archived"}
                        onClick={() => {
                          ctx.setEditingDeadlineIndex(i);
                          ctx.deadlineForm.reset(dl as DeadlineFormData);
                        }}
                        className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] active:scale-[0.99] motion-reduce:transition-none"
                      >
                        {t("cases.detail_dl_edit_btn")}
                      </button>
                      <button
                        disabled={caseData?.status === "archived" || isCancelled(dl)}
                        aria-label={
                          dl.is_notfrist
                            ? `Notfrist „${dl.title ?? ""}“ stornieren`
                            : `Frist „${dl.title ?? ""}“ löschen`
                        }
                        onClick={() => deleteDeadline(i)}
                        className="px-2 py-1 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-danger-text)] active:scale-[0.99] motion-reduce:transition-none"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                    <span className="text-[color:var(--ds-text)] tabular-nums">
                      {formatDate(dl.due_date)}
                    </span>
                    {status !== "done" && status !== "cancelled" && (
                      <span
                        className={isOverdue ? "text-[color:var(--ds-danger-text)]" : cfg.color}
                      >
                        {formatDaysUntil(daysUntil)}
                      </span>
                    )}
                    {dl.type && (
                      <Badge
                        variant="default"
                        className="border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                      >
                        {dl.type === "deadline"
                          ? t("cases.detail_dl_type_deadline")
                          : dl.type === "hearing"
                            ? t("cases.detail_dl_type_hearing")
                            : dl.type === "meeting"
                              ? t("cases.detail_dl_type_meeting")
                              : dl.type === "filing"
                                ? t("cases.detail_dl_type_filing")
                                : t("cases.detail_dl_type_reminder")}
                      </Badge>
                    )}
                    {dl.law && (
                      <Badge
                        variant="default"
                        className="border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                      >
                        {dl.law}
                      </Badge>
                    )}
                    {dl.is_notfrist && (
                      <Badge
                        variant="default"
                        className="flex items-center gap-0.5 border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-xs text-[color:var(--ds-warning-text)]"
                      >
                        <ShieldCheck size={10} />
                        Notfrist
                      </Badge>
                    )}
                    {dl.vorfrist_date &&
                      new Date(dl.vorfrist_date) <= new Date() &&
                      dl.status !== "done" && (
                        <Badge
                          variant="default"
                          className="border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-xs text-[color:var(--ds-info-text)]"
                        >
                          Vorfrist erreicht
                        </Badge>
                      )}
                    {dl.vorfrist_date && new Date(dl.vorfrist_date) > new Date() && (
                      <Badge
                        variant="default"
                        className="flex items-center gap-0.5 border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-xs text-[color:var(--ds-info-text)]"
                      >
                        <Clock size={10} />
                        Vorfrist: {formatDate(dl.vorfrist_date)}
                      </Badge>
                    )}
                    {dl.erv_zustelldatum && (
                      <Badge
                        variant="default"
                        className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                      >
                        ERV: {formatDate(dl.erv_zustelldatum)}
                      </Badge>
                    )}
                  </div>
                  {dl.description && (
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {dl.description}
                    </p>
                  )}
                  {dl.calculation_note && (
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_dl_calc_note")} {dl.calculation_note}
                    </p>
                  )}
                  {dl.reviewed_at && (
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_dl_reviewed_by")}{" "}
                      {dl.reviewed_by || t("cases.detail_dl_firm")}{" "}
                      {t("cases.detail_dl_reviewed_at")} {formatDateTime(dl.reviewed_at)}
                    </p>
                  )}
                  <div className="mt-3 border-t border-[color:var(--ds-border)]/50 pt-3">
                    <CommentThread
                      parentSlug={`${slug}/deadline/${i}`}
                      parentType="deadline"
                      currentUserId={ctx.currentUserId}
                      currentUserName={ctx.currentUserName}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tasks Section */}
      <div className="max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <input
              id="matter-new-task"
              value={ctx.newTask}
              onChange={(e) => ctx.setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ctx.newTask.trim()) addTask();
              }}
              placeholder={t("cases.new_task")}
              aria-label={t("cases.new_task")}
              disabled={caseData?.status === "archived"}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 disabled:opacity-50 motion-reduce:transition-none"
            />
          </div>
          <input
            type="date"
            value={newTaskDueDate}
            onChange={(e) => setNewTaskDueDate(e.target.value)}
            aria-label="Fälligkeit"
            disabled={caseData?.status === "archived"}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-2 text-sm text-[color:var(--ds-text)] disabled:opacity-50"
          />
          <select
            value={newTaskAssigneeId}
            onChange={(e) => setNewTaskAssigneeId(e.target.value)}
            aria-label="Zuständig"
            disabled={caseData?.status === "archived"}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-2 text-sm text-[color:var(--ds-text)] disabled:opacity-50"
          >
            <option value="">Nicht zugewiesen</option>
            <option value={AGENT_ASSIGNEE}>KI-Agent (mit Aktenkontext)</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            disabled={caseData?.status === "archived"}
            className="brand-bg brand-bg gap-2 text-sm text-white"
            onClick={() => addTask()}
          >
            <Plus size={14} /> {t("cases.detail_tasks_add")}
          </Button>
        </div>
        {ctx.tasks.length === 0 ? (
          <div className="space-y-2 py-10 text-center">
            <ListChecks size={32} className="mx-auto text-[color:var(--ds-border)]" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {t("cases.detail_tasks_empty")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {ctx.tasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                  task.done
                    ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)]"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                )}
              >
                <button
                  disabled={caseData?.status === "archived"}
                  onClick={() => {
                    const updated = ctx.tasks.map((t) =>
                      t.id === task.id ? { ...t, done: !t.done } : t
                    );
                    ctx.setTasks(updated);
                    ctx.saveCaseUpdate({ tasks: updated });
                  }}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99] motion-reduce:transition-none",
                    task.done
                      ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                      : "hover:brand-border border-[color:var(--ds-border)]"
                  )}
                >
                  {task.done && <Check size={12} />}
                </button>
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "text-sm",
                      task.done
                        ? "text-[color:var(--ds-text-muted)] line-through"
                        : "text-[color:var(--ds-text)]"
                    )}
                  >
                    {task.text}
                  </span>
                  {task.dueDate && (
                    <span
                      className={cn(
                        "ml-2 text-xs tabular-nums",
                        !task.done &&
                          task.dueDate < new Date().toISOString().slice(0, 10) &&
                          "text-[color:var(--ds-danger-text)]",
                        !(!task.done && task.dueDate < new Date().toISOString().slice(0, 10)) &&
                          "text-[color:var(--ds-text-subtle)]"
                      )}
                    >
                      {formatDate(task.dueDate)}
                    </span>
                  )}
                  {task.assigneeType === "agent" && (
                    <Badge
                      variant={task.agentStatus === "needs_review" ? "warning" : "default"}
                      className="ml-2 align-middle"
                    >
                      {task.agentStatus === "needs_review"
                        ? "Agent-Ergebnis — prüfen"
                        : "KI-Agent läuft"}
                    </Badge>
                  )}
                  {task.assigneeType === "agent" && task.agentResult && (
                    <details className="mt-1.5 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text)]">
                      <summary className="cursor-pointer font-medium select-none">
                        Agenten-Ergebnis (anwaltlich zu prüfen)
                      </summary>
                      <p className="mt-1 whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                        {task.agentResult}
                      </p>
                    </details>
                  )}
                </div>
                <select
                  value={task.assigneeType === "agent" ? AGENT_ASSIGNEE : (task.assigneeId ?? "")}
                  onChange={(e) => reassignTask(task.id, e.target.value)}
                  disabled={caseData?.status === "archived"}
                  aria-label={`Zuständig für „${task.text}"`}
                  className="shrink-0 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-1.5 py-1 text-xs text-[color:var(--ds-text)] disabled:opacity-50"
                >
                  <option value="">Nicht zugewiesen</option>
                  <option value={AGENT_ASSIGNEE}>KI-Agent</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
                <button
                  disabled={caseData?.status === "archived"}
                  aria-label={`Aufgabe „${task.text}“ löschen`}
                  onClick={() => {
                    void confirm({
                      title: "Aufgabe löschen?",
                      message: `„${task.text}“ wird aus der Akte entfernt.`,
                      confirmLabel: "Löschen",
                      variant: "danger",
                    }).then((ok) => {
                      if (!ok) return;
                      const updated = ctx.tasks.filter((t) => t.id !== task.id);
                      ctx.setTasks(updated);
                      ctx.saveCaseUpdate({ tasks: updated });
                    });
                  }}
                  className="text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-danger-text)] active:scale-[0.99] motion-reduce:transition-none"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notfrist: cancel with a mandatory reason instead of deleting */}
      {cancelTarget !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="notfrist-cancel-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-surface)] p-6 shadow-xl">
            <h3
              id="notfrist-cancel-title"
              className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]"
            >
              Notfrist stornieren?
            </h3>
            <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">
              „{ctx.deadlinesList[cancelTarget]?.title ?? ""}“ (
              {formatDate(ctx.deadlinesList[cancelTarget]?.due_date ?? "")}) ist eine Notfrist. Sie
              wird nicht gelöscht, sondern mit Begründung storniert und protokolliert. Nur
              Anwältinnen/Anwälte und Administratoren dürfen das.
            </p>
            <label htmlFor="notfrist-cancel-reason" className="mb-1 block text-xs font-medium">
              Begründung *
            </label>
            <input
              id="notfrist-cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mb-4 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCancelTarget(null)}
                className="text-xs"
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={cancelReason.trim().length < 5}
                onClick={confirmCancelNotfrist}
                className="text-xs"
              >
                Stornieren
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* P0: Vier-Augen second-check confirmation modal for Notfristen */}
      {secondCheckIndex !== null && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Backdrop click-to-close; keyboard users close via the dialog's close button.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !secondCheckBusy) setSecondCheckIndex(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-surface)] p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--ds-warning-bg)]">
                <ShieldCheck size={20} className="text-[color:var(--ds-warning-text)]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("deadlines.second_check")}
                </h3>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("deadlines.notfrist")} — {ctx.deadlinesList[secondCheckIndex]?.title ?? ""}
                </p>
              </div>
            </div>
            <p className="mb-4 text-sm text-[color:var(--ds-text-muted)]">
              {lang === "en"
                ? "This is a statutory deadline (Notfrist). Marking it as done requires a second confirmation (four-eyes principle). By confirming, you attest that you have verified the deadline completion."
                : "Dies ist eine Notfrist. Die Erledigung erfordert eine zweite Bestätigung (Vier-Augen-Prinzip). Mit der Bestätigung belegen Sie, dass Sie die Fristwahrung geprüft haben."}
            </p>
            <div className="mb-4 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]">
              <strong>{t("deadlines.second_check_by")}:</strong> {ctx.currentUserName}
            </div>
            {secondCheckIndex !== null &&
              ctx.deadlinesList[secondCheckIndex]?.reviewed_by === ctx.currentUserName && (
                <div className="mb-4 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]">
                  {t("deadlines.second_check_self_blocked")}
                </div>
              )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={secondCheckBusy}
                onClick={() => setSecondCheckIndex(null)}
                className="text-xs"
              >
                {lang === "en" ? "Cancel" : "Abbrechen"}
              </Button>
              <Button
                size="sm"
                disabled={
                  secondCheckBusy ||
                  (secondCheckIndex !== null &&
                    ctx.deadlinesList[secondCheckIndex]?.reviewed_by === ctx.currentUserName)
                }
                onClick={async () => {
                  if (secondCheckIndex === null) return;
                  const dl = ctx.deadlinesList[secondCheckIndex];
                  if (!dl) {
                    setSecondCheckBusy(false);
                    setSecondCheckIndex(null);
                    return;
                  }
                  if (dl.reviewed_by && dl.reviewed_by === ctx.currentUserName) {
                    setSecondCheckIndex(null);
                    return;
                  }
                  setSecondCheckBusy(true);
                  try {
                    // Server-enforced four-eyes check: the route stamps the
                    // signed-in user and refuses the creator/first checker.
                    // The generic page write strips client-set second_check_*.
                    await api.legal.fristenSecondCheck(caseData.slug, {
                      id: dl.id,
                      title: dl.title,
                      due_date: dl.due_date,
                    });
                    addToast({ type: "success", title: t("deadlines.second_check_done") });
                    ctx.setEditingDeadlineIndex(null);
                    await ctx.refreshCaseData();
                  } catch (err) {
                    addToast({
                      type: "error",
                      title:
                        err instanceof ApiRequestError && err.code === "second_check_self_blocked"
                          ? t("deadlines.second_check_self_blocked")
                          : err instanceof ApiRequestError && err.status === 409 && err.message
                            ? err.message
                            : t("deadlines.update_failed"),
                    });
                  } finally {
                    setSecondCheckBusy(false);
                    setSecondCheckIndex(null);
                  }
                }}
                className="gap-1.5 bg-[color:var(--ds-warning-solid)] text-xs text-white hover:bg-[color:var(--ds-warning-solid)]"
              >
                {secondCheckBusy ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <ShieldCheck size={13} />
                )}
                {t("deadlines.second_check_done")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
