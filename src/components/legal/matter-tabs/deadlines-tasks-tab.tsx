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
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { statusBadgeClasses, type StatusColor } from "@/lib/status-colors";
import { DEADLINE_RULES, calculateDeadline, withDeadlineAudit } from "@/lib/legal-deadlines";
import type { DeadlineEntry } from "@/lib/legal-types";
import type { DeadlineFormData } from "@/lib/schemas/case-detail";
import { csrfFetch } from "@/lib/csrf";
import CommentThread from "@/components/legal/CommentThread";

export function DeadlinesTasksTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  const [showDeadlineForm, setShowDeadlineForm] = useState(false);
  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;
  const slug = ctx.slug;

  // Auto-expand form when editing
  useEffect(() => {
    if (ctx.editingDeadlineIndex !== null) setShowDeadlineForm(true);
  }, [ctx.editingDeadlineIndex]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Deadline Form — collapsed by default (Progressive Disclosure) */}
      <div className="max-w-3xl space-y-4">
        {!showDeadlineForm ? (
          <button
            onClick={() => setShowDeadlineForm(true)}
            disabled={caseData?.status === "archived"}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm font-medium text-[color:var(--ds-text-muted)] transition-colors hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] disabled:opacity-50"
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
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
              {ctx.deadlineForm.formState.errors.title && (
                <p className="mt-1 text-xs text-red-600">
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
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
              {ctx.deadlineForm.formState.errors.due_date && (
                <p className="mt-1 text-xs text-red-600">
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
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
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
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
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
              className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
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
                onChange={(e) => ctx.setDeadlineRuleKey(e.target.value)}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              >
                {DEADLINE_RULES.map((rule) => (
                  <option key={rule.key} value={rule.key}>
                    {rule.label} ({rule.law})
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={ctx.deadlineStartDate}
                onChange={(e) => ctx.setDeadlineStartDate(e.target.value)}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
              <Button
                variant="secondary"
                className="text-xs"
                onClick={() => {
                  const rule =
                    DEADLINE_RULES.find((r) => r.key === ctx.deadlineRuleKey) ?? DEADLINE_RULES[0];
                  const calculated = calculateDeadline(rule, ctx.deadlineStartDate);
                  ctx.deadlineForm.reset(calculated as DeadlineFormData);
                }}
              >
                {t("cases.detail_dl_calculate")}
              </Button>
            </div>
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
        <div className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PenTool size={16} className="text-blue-600" />
              <span className="text-sm font-medium text-blue-600">
                {t("cases.detail_dl_ai_title")}
              </span>
            </div>
            <Badge
              variant="default"
              className="border-blue-500/20 bg-blue-500/10 text-xs text-blue-600"
            >
              Beta
            </Badge>
          </div>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {t("cases.detail_dl_ai_desc")}
          </p>
          <textarea
            value={ctx.aiDetectText}
            onChange={(e) => ctx.setAiDetectText(e.target.value)}
            rows={3}
            placeholder={t("cases.detail_dl_ai_ph")}
            className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-blue-500/50 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              className="gap-2 bg-blue-600 text-sm text-white hover:bg-blue-500"
              onClick={async () => {
                if (!ctx.aiDetectText.trim()) return;
                ctx.setAiDetecting(true);
                try {
                  const res = await csrfFetch("/api/legal/ai-deadlines", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: ctx.aiDetectText, caseSlug: slug }),
                  });
                  const data = await res.json();
                  ctx.setAiDetectedDeadlines(data.detected?.length > 0 ? data.detected : []);
                } catch {
                  ctx.setAiDetectedDeadlines([]);
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
                      {d.date} · {d.type}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="default"
                      className="border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-600"
                    >
                      {Math.round(d.confidence * 100)}%
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={caseData?.status === "archived"}
                      className="border-emerald-500/30 text-xs text-emerald-600 hover:bg-emerald-500/10"
                      onClick={() => {
                        const entry: DeadlineEntry = {
                          id: `dl-${Date.now()}`,
                          title: d.title,
                          date: d.date,
                          due_date: d.date,
                          type: d.type as DeadlineEntry["type"],
                          status: "pending",
                          review_status: "unreviewed",
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
            </div>
          )}
        </div>

        {/* AI-extrahierte Fristenvorschläge */}
        {caseData.suggestedDeadlines && caseData.suggestedDeadlines.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
              <Sparkles size={14} className="text-amber-500" />
              {t("casesdetail.ai_deadlines")}
            </div>
            {caseData.suggestedDeadlines
              .filter((sd) => !sd.confirmed)
              .map((sd, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-[color:var(--ds-text)]">{sd.title}</div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {sd.due_date} · {sd.urgency}
                      {sd.source_quote && (
                        <span className="mt-0.5 block italic">&bdquo;{sd.source_quote}&ldquo;</span>
                      )}
                      <span className="mt-0.5 block">Quelle: {sd.source}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={caseData?.status === "archived"}
                      className="border-emerald-500/30 text-xs text-emerald-600 hover:bg-emerald-500/10"
                      onClick={async () => {
                        const entry: DeadlineEntry = {
                          id: `dl-${Date.now()}`,
                          title: sd.title,
                          date: sd.due_date,
                          due_date: sd.due_date,
                          type: "custom" as DeadlineEntry["type"],
                          status: "pending",
                          review_status: "unreviewed",
                        };
                        const updated = [...ctx.deadlinesList, entry];
                        ctx.setDeadlinesList(updated);
                        ctx.saveCaseUpdate({ deadlines: updated });
                        await ctx.confirmSuggestedDeadline(i, true);
                      }}
                    >
                      <Check size={12} /> {t("casesdetail.accept")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={caseData?.status === "archived"}
                      className="text-xs text-[color:var(--ds-text-muted)] hover:text-red-600"
                      onClick={() => ctx.confirmSuggestedDeadline(i, false)}
                    >
                      <X size={12} /> {t("casesdetail.reject")}
                    </Button>
                  </div>
                </div>
              ))}
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
              const dlDate = new Date(dl.due_date || dl.date || Date.now());
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const daysUntil = Math.ceil(
                (dlDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
              );
              const isOverdue = daysUntil < 0;
              const isCritical = daysUntil >= 0 && daysUntil <= 3;
              const isWarning = daysUntil > 3 && daysUntil <= 7;
              const status =
                dl.status === "done"
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
                    color: "text-blue-600",
                    border: "border-blue-500/20 bg-blue-500/5",
                  },
                  warning: {
                    label: t("cases.detail_dl_status_warning"),
                    color: "text-amber-600",
                    border: "border-amber-500/20 bg-amber-500/5",
                  },
                  critical: {
                    label: t("cases.detail_dl_status_critical"),
                    color: "text-red-600",
                    border: "border-red-500/20 bg-red-500/5",
                  },
                  overdue: {
                    label: t("cases.detail_dl_status_overdue"),
                    color: "text-rose-600",
                    border: "border-rose-500/20 bg-rose-500/5",
                  },
                  done: {
                    label: t("cases.detail_dl_status_done"),
                    color: "text-emerald-600",
                    border: "border-emerald-500/20 bg-emerald-500/5",
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
                        className={cn("border text-xs", statusBadgeClasses(status as StatusColor))}
                      >
                        {cfg.label}
                      </Badge>
                      <Badge
                        variant="default"
                        className={cn(
                          "border text-xs",
                          dl.review_status === "approved"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                            : dl.review_status === "rejected"
                              ? "border-red-500/20 bg-red-500/10 text-red-600"
                              : dl.review_status === "reviewed"
                                ? "border-blue-500/20 bg-blue-500/10 text-blue-600"
                                : "border-amber-500/20 bg-amber-500/10 text-amber-600"
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
                        className="px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-emerald-600"
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
                        className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors"
                      >
                        {t("cases.detail_dl_edit_btn")}
                      </button>
                      <button
                        disabled={caseData?.status === "archived"}
                        onClick={() => {
                          const updated = ctx.deadlinesList.filter((_, idx) => idx !== i);
                          ctx.setDeadlinesList(updated);
                          ctx.saveCaseUpdate({ deadlines: updated });
                        }}
                        className="px-2 py-1 text-[color:var(--ds-text-muted)] transition-colors hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                    <span>
                      {dlDate.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
                        weekday: "short",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    {!isOverdue && status !== "done" && (
                      <span className={cfg.color}>
                        ({daysUntil} {t("cases.detail_dl_days")})
                      </span>
                    )}
                    {isOverdue && (
                      <span className="text-rose-600">
                        ({Math.abs(daysUntil)} {t("cases.detail_dl_days_overdue")})
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
                      {t("cases.detail_dl_reviewed_at")}{" "}
                      {new Date(dl.reviewed_at).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}
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
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              value={ctx.newTask}
              onChange={(e) => ctx.setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ctx.newTask.trim()) {
                  const updated = [
                    ...ctx.tasks,
                    {
                      id: Date.now().toString(),
                      text: ctx.newTask.trim(),
                      done: false,
                      createdAt: new Date().toISOString(),
                    },
                  ];
                  ctx.setTasks(updated);
                  ctx.setNewTask("");
                  ctx.saveCaseUpdate({ tasks: updated });
                }
              }}
              placeholder={t("cases.new_task")}
              aria-label={t("cases.new_task")}
              disabled={caseData?.status === "archived"}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] transition-colors placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none disabled:opacity-50"
            />
          </div>
          <Button
            variant="primary"
            disabled={caseData?.status === "archived"}
            className="brand-bg brand-bg gap-2 text-sm text-white"
            onClick={() => {
              if (ctx.newTask.trim()) {
                const updated = [
                  ...ctx.tasks,
                  {
                    id: Date.now().toString(),
                    text: ctx.newTask.trim(),
                    done: false,
                    createdAt: new Date().toISOString(),
                  },
                ];
                ctx.setTasks(updated);
                ctx.setNewTask("");
                ctx.saveCaseUpdate({ tasks: updated });
              }
            }}
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
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  task.done
                    ? "border-emerald-500/20 bg-emerald-500/5"
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
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    task.done
                      ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-600"
                      : "hover:brand-border border-[color:var(--ds-border)]"
                  )}
                >
                  {task.done && <Check size={12} />}
                </button>
                <span
                  className={cn(
                    "flex-1 text-sm",
                    task.done
                      ? "text-[color:var(--ds-text-muted)] line-through"
                      : "text-[color:var(--ds-text)]"
                  )}
                >
                  {task.text}
                </span>
                <button
                  disabled={caseData?.status === "archived"}
                  onClick={() => {
                    const updated = ctx.tasks.filter((t) => t.id !== task.id);
                    ctx.setTasks(updated);
                    ctx.saveCaseUpdate({ tasks: updated });
                  }}
                  className="text-[color:var(--ds-text-muted)] transition-colors hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
